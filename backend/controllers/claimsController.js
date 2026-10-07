import { config } from '../config.js';
import { supabaseAdmin } from '../services/supabase.js';
import { runAdjudicationAgent, extractBillFromDocument } from '../services/geminiService.js';
import { computeAdjudication } from '../services/adjudicationMath.js';
import { claimSubmissionSchema, uuidParamSchema, billExtractionSchema, policyLookupSchema } from '../validation/schemas.js';
import { HttpError } from '../utils/http.js';

const CLAIM_LIST_COLUMNS =
  'id, patient_id, policy_id, diagnosis_code, total_billed, status, approved_amount, source, created_at, policies(policy_number), disputes(status), flagged_total:ai_reasoning_log->breakdown->flagged_total';

const money = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

const norm = (s) => String(s || '').trim().toLowerCase();
const isPatient = (req) => req.profile.role === 'PATIENT';

/**
 * The service role bypasses RLS, so this is the access rule for a claim:
 *   hospital → claims that hospital account filed
 *   patient  → claims filed for their patient ID, plus bills they checked themselves
 */
function canAccess(claim, req) {
  if (!isPatient(req)) {
    if (claim.source !== 'HOSPITAL') return false;
    // Teammates in the same hospital organization can access and process claims
    if (req.profile?.hospital_org && claim.hospital_org && req.profile.hospital_org === claim.hospital_org) {
      return true;
    }
    return claim.hospital_user_id === req.user.id;
  }
  if (claim.source === 'PATIENT') return claim.patient_user_id === req.user.id;
  // Exact, like the list query in scopedClaims: createClaim stores the ID as the patient's record spells it.
  return claim.patient_id === req.profile.patient_id;
}

// What each flag means, in words that say nothing about any particular policy.
const FLAG_MEANING = {
  OK: 'No problem was found with this charge.',
  NOT_COVERED: 'The policy this claim was filed against does not pay for this charge.',
  DUPLICATE: 'The same item appears to be billed more than once.',
  OVERPRICED: 'The amount is well above the reference price for this service.',
  UNBUNDLED: 'Normally included in a procedure already on the bill, but charged separately.',
  UNRELATED: 'Does not appear to be connected to the diagnosis.',
};

/**
 * A verdict with the policy's own terms left out: no limit, copay rate or
 * reasoning, and each line's free-text reason (which can quote an exclusion)
 * replaced by the plain meaning of its flag.
 */
function withoutPolicyTerms(log) {
  const b = log.breakdown ?? {};
  const plain = (lines) => lines?.map((l) => ({ ...l, reason: FLAG_MEANING[l.flag] ?? FLAG_MEANING.NOT_COVERED }));
  return {
    chain_of_thought: ['This claim was filed against a policy that is not linked to your account, so the detailed reasoning is not shown.'],
    line_items: plain(log.line_items),
    denied_items: plain(log.denied_items),
    breakdown: {
      total_billed: b.total_billed,
      excluded_total: b.excluded_total,
      flagged_total: b.flagged_total,
      not_covered_total: b.not_covered_total,
      copay_amount: b.copay_amount,
      cap_reduction: b.cap_reduction,
      approved_amount: b.approved_amount,
      patient_payable: b.patient_payable,
    },
    processed_at: log.processed_at,
  };
}

/** What the caller is allowed to see of a claim they can access. */
function present(claim, req) {
  const out = { ...claim, disputes: [...(claim.disputes ?? [])].sort((a, b) => a.line_number - b.line_number) };
  const policy = claim.policies;

  if (!isPatient(req)) {
    // Never the holder's ID, not even when it is the one the hospital typed:
    // showing it only on a match would confirm a guess, and with the policy
    // number that ID is what a patient account is claimed with.
    if (policy) out.policies = { ...policy, patient_id: undefined };
    return out;
  }

  // A claim can be filed for this patient against someone else's policy (the
  // mismatch case); that policy's terms are not theirs to read, in the policy
  // record or in the agent's reasoning about it.
  if (norm(policy?.patient_id) !== norm(req.profile.patient_id)) {
    if (policy) out.policies = { policy_number: policy.policy_number };
    if (claim.ai_reasoning_log) out.ai_reasoning_log = withoutPolicyTerms(claim.ai_reasoning_log);
  } else if (claim.ai_reasoning_log) {
    out.ai_reasoning_log = { ...claim.ai_reasoning_log, processed_by: undefined };
  }
  delete out.hospital_user_id;
  return out;
}

/** PostgREST answers at most 1000 rows at a time; read every page so lists and totals are complete. */
async function allRows(buildQuery) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw new HttpError(500, `Database error: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function getAccessibleClaim(claimId, req) {
  const { data, error } = await supabaseAdmin
    .from('claims')
    .select('*, policies(*), disputes(*)')
    .eq('id', claimId)
    .maybeSingle();

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  if (!data || !canAccess(data, req)) throw new HttpError(404, 'Claim not found.');
  return data;
}

/** The patient ID as an existing policy spells it, or as typed when no policy has it. */
async function knownSpelling(patientId) {
  // Only IDs made of these characters go into a pattern match: `%`, `*` and
  // `\` would act as wildcards or escapes there. (`_` matches any one
  // character, which the exact comparison below sorts out.)
  if (!/^[A-Za-z0-9 ._/-]+$/.test(patientId)) return patientId;

  const { data, error } = await supabaseAdmin.from('policies').select('patient_id').ilike('patient_id', patientId);

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  return data.find((p) => norm(p.patient_id) === norm(patientId))?.patient_id ?? patientId;
}

/** POST /api/claims */
export async function createClaim(req, res) {
  const body = claimSubmissionSchema.parse(req.body);

  const { data: policy, error: policyErr } = await supabaseAdmin
    .from('policies')
    .select('id, patient_id, policy_number')
    .eq('id', body.policy_id)
    .maybeSingle();

  if (policyErr) throw new HttpError(500, `Database error: ${policyErr.message}`);
  if (!policy) throw new HttpError(400, 'Referenced policy does not exist.', [{ path: 'policy_id', message: 'Unknown policy' }]);

  const holderMatches = (id) => norm(id) === norm(policy.patient_id);
  let owner;
  if (isPatient(req)) {
    // A patient checks their own bill against their own policy; neither comes from the body.
    if (!holderMatches(req.profile.patient_id)) {
      throw new HttpError(403, 'You can only check a bill against your own policy.', [{ path: 'policy_id', message: 'Not your policy' }]);
    }
    owner = { source: 'PATIENT', patient_user_id: req.user.id, patient_id: req.profile.patient_id };
  } else {
    owner = {
      source: 'HOSPITAL',
      hospital_user_id: req.user.id, // from verified JWT, never from body
      hospital_org: req.profile?.hospital_org || 'CareClaim General Hospital',
      // Stored the way the patient's own policy spells it, so their account
      // finds the claim whatever case the hospital typed.
      patient_id: holderMatches(body.patient_id) ? policy.patient_id : await knownSpelling(body.patient_id),
    };
  }

  const claimInsert = {
    ...owner,
    policy_id: body.policy_id,
    diagnosis_code: body.diagnosis_code,
    raw_bill_data: body.raw_bill_data,
    total_billed: body.total_billed,
    status: 'PENDING',
  };

  let { data, error } = await supabaseAdmin
    .from('claims')
    .insert(claimInsert)
    .select(CLAIM_LIST_COLUMNS)
    .single();

  // If hospital_org column has not been added to DB schema yet (code 42703), retry without it
  if (error && error.code === '42703') {
    delete claimInsert.hospital_org;
    const retry = await supabaseAdmin
      .from('claims')
      .insert(claimInsert)
      .select(CLAIM_LIST_COLUMNS)
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new HttpError(500, `Failed to create claim: ${error.message}`);
  res.status(201).json({ claim: data });
}

/** POST /api/claims/extract-bill — extract line items from image or PDF via Gemini Vision */
export async function extractBill(req, res) {
  const body = billExtractionSchema.parse(req.body);
  const extracted = await extractBillFromDocument(body);
  res.json({ extracted });
}


/** The claims the caller may see (the list-level form of canAccess). */
function scopedClaims(req, columns) {
  const query = supabaseAdmin.from('claims').select(columns);
  if (isPatient(req)) {
    return query.eq('patient_id', req.profile.patient_id).or(`source.eq.HOSPITAL,patient_user_id.eq.${req.user.id}`);
  }
  // Hospital staff share their organization's claim queue
  if (req.profile?.hospital_org) {
    return query.eq('source', 'HOSPITAL').or(`hospital_org.eq.${req.profile.hospital_org},hospital_user_id.eq.${req.user.id}`);
  }
  return query.eq('source', 'HOSPITAL').eq('hospital_user_id', req.user.id);
}

/** GET /api/claims */
export async function listClaims(req, res) {
  const claims = await allRows(() =>
    scopedClaims(req, CLAIM_LIST_COLUMNS).order('created_at', { ascending: false }).order('id')
  );
  res.json({ claims });
}

/** GET /api/stats — headline numbers over the caller's own claims */
export async function getStats(req, res) {
  const data = await allRows(() =>
    scopedClaims(req, 'status, approved_amount, duration_ms:ai_reasoning_log->duration_ms').order('id')
  );

  const adjudicated = data.filter((c) => c.status !== 'PENDING' && c.status !== 'PROCESSING');
  const paid = adjudicated.filter((c) => c.status !== 'DENIED');
  const durations = adjudicated.filter((c) => c.duration_ms != null).map((c) => Number(c.duration_ms));

  res.json({
    total_claims: data.length,
    // share of adjudicated claims that were paid in full or in part
    approval_rate: adjudicated.length ? (paid.length / adjudicated.length) * 100 : 0,
    total_payout: Math.round(adjudicated.reduce((s, c) => s + Number(c.approved_amount || 0), 0) * 100) / 100,
    avg_processing_ms: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0,
  });
}

// Claims this process is adjudicating right now. A run outlives the request
// that started it, so a second request for the same claim would start a second
// model run and overwrite the first verdict.
const inFlight = new Set();

/** GET /api/claims/:id */
export async function getClaim(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  // Read before the row: a run that finishes while the query is out must not
  // pair a stale PENDING row with "nothing is running".
  const adjudicating = inFlight.has(id);
  const claim = await getAccessibleClaim(id, req);
  res.json({ claim: { ...present(claim, req), adjudicating } });
}

/**
 * Runs the agent on a claim the caller may adjudicate and saves the verdict.
 * `onStage` / `onLog` receive progress as it happens (used by the SSE mode);
 * the same log lines are stored as the claim's chain_of_thought.
 */
async function adjudicate(id, req, { onStage = () => {}, onLog = () => {} } = {}) {
  onStage('intake');
  const claim = await getAccessibleClaim(id, req);
  // A patient can read a claim the hospital filed for them, but only run their own bill checks.
  if (isPatient(req) && claim.source !== 'PATIENT') {
    throw new HttpError(403, 'Only the hospital that filed this claim can run its adjudication.');
  }

  // Detect stale PROCESSING lock (e.g. server crashed/restarted > 5 minutes ago)
  const isStuckProcessing = claim.status === 'PROCESSING' && (
    (Date.now() - new Date(claim.updated_at || claim.created_at).getTime()) > 5 * 60 * 1000
  );

  if (inFlight.has(claim.id) || (claim.status === 'PROCESSING' && !isStuckProcessing)) {
    throw new HttpError(409, 'This claim is already being adjudicated. The verdict appears when that run finishes.');
  }
  // A saved verdict is final: patients raise disputes against its line flags.
  if (claim.status !== 'PENDING' && !isStuckProcessing) {
    throw new HttpError(409, 'This claim has already been adjudicated.');
  }

  // Atomic database status transition: PENDING (or stale PROCESSING) -> PROCESSING
  let dbLockAcquired = false;
  try {
    let updateQuery = supabaseAdmin
      .from('claims')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('id', claim.id);

    if (isStuckProcessing) {
      updateQuery = updateQuery.eq('status', 'PROCESSING');
    } else {
      updateQuery = updateQuery.eq('status', 'PENDING');
    }

    let { data: locked, error: lockErr } = await updateQuery
      .select('id, status')
      .maybeSingle();

    // If updated_at column does not exist yet (code 42703), retry without updated_at
    if (lockErr && lockErr.code === '42703') {
      let retryQuery = supabaseAdmin
        .from('claims')
        .update({ status: 'PROCESSING' })
        .eq('id', claim.id);

      if (isStuckProcessing) {
        retryQuery = retryQuery.eq('status', 'PROCESSING');
      } else {
        retryQuery = retryQuery.eq('status', 'PENDING');
      }

      const retry = await retryQuery.select('id, status').maybeSingle();
      locked = retry.data;
      lockErr = retry.error;
    }

    if (!lockErr && locked) {
      dbLockAcquired = true;
    } else if (!lockErr && !locked) {
      throw new HttpError(409, 'This claim is currently being adjudicated by another instance.');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // If DB check constraint doesn't include PROCESSING yet (code 23514), inFlight in-memory set serves as fallback
    console.warn('[claims] DB atomic status transition to PROCESSING bypassed:', err?.message);
  }

  inFlight.add(claim.id);
  try {
    return present(await runAgent(claim, { onStage, onLog, processedBy: req.user.id }), req);
  } catch (err) {
    // If run failed before a final verdict was saved, roll back to PENDING so it can be retried
    if (dbLockAcquired) {
      await supabaseAdmin.from('claims').update({ status: 'PENDING' }).eq('id', claim.id).eq('status', 'PROCESSING').catch(() => {});
    }
    throw err;
  } finally {
    inFlight.delete(claim.id);
  }
}

async function runAgent(claim, { onStage, onLog, processedBy }) {
  const startedAt = Date.now();
  const logLines = [];
  let listenerMs = 0; // time spent inside onLog (stream pacing), kept out of the reported duration
  const log = async (lines) => {
    for (const line of lines) {
      logLines.push(line);
      const t = Date.now();
      await onLog(line);
      listenerMs += Date.now() - t;
    }
  };
  const elapsedMs = () => Date.now() - startedAt - listenerMs;

  const policy = claim.policies;
  if (!policy) throw new HttpError(422, 'Claim has no associated policy; cannot adjudicate.');

  const billItems = Array.isArray(claim.raw_bill_data) ? claim.raw_bill_data : [];
  if (billItems.length === 0) throw new HttpError(422, 'Claim has no bill line items.');

  // The overpricing check degrades to the agent's own judgement without a rate card.
  const { data: referencePrices, error: pricesErr } = await supabaseAdmin
    .from('reference_prices')
    .select('item_name, typical_max_price, unit')
    .order('item_name');
  if (pricesErr) console.warn('[claims] reference prices unavailable:', pricesErr.message);

  await log([
    `[SYS] Agent session opened for claim ${claim.id.slice(0, 8)}…`,
    `[SYS] Loaded ${billItems.length} bill line items · total ${money(claim.total_billed)}`,
    `[SYS] Policy ${policy.policy_number} retrieved from Supabase · limit ${money(policy.max_coverage_limit)} · copay ${Number(policy.copay_percentage)}%`,
    `[SYS] Loaded ${referencePrices?.length ?? 0} reference prices for the overcharge check`,
    `[SYS] Dispatching to ${config.geminiModel}…`,
  ]);

  // 1. Autonomous reasoning by Gemini
  onStage('reasoning');
  const { result, model, attempts } = await runAdjudicationAgent(claim, policy, referencePrices ?? []);
  await log(result.chain_of_thought);

  // 2. Deterministic verification of the flags and the payout math
  onStage('verification');
  const verified = computeAdjudication({
    billItems,
    totalBilled: claim.total_billed,
    policy,
    lineItems: result.line_items,
    patientId: claim.patient_id,
  });

  const aiAmount = Math.round(result.approved_amount * 100) / 100;
  const mathMatches = Math.abs(aiAmount - verified.approved_amount) < 0.01;
  const statusMatches = result.final_status === verified.status;

  await log([
    `[VERIFIER] Re-computing payout deterministically from agent's line-item flags…`,
    ...(verified.patient_mismatch
      ? [`[VERIFIER] WARNING: patient ${claim.patient_id} is not the holder of policy ${policy.policy_number}; all line items denied`]
      : []),
    ...(verified.duplicates_caught
      ? [`[VERIFIER] WARNING: ${verified.duplicates_caught} exact duplicate line(s) the agent passed were flagged DUPLICATE`]
      : []),
    ...(verified.exclusions_enforced
      ? [`[VERIFIER] WARNING: ${verified.exclusions_enforced} line(s) the agent passed name an excluded treatment and were flagged NOT_COVERED`]
      : []),
    ...(verified.missing_decisions
      ? [`[VERIFIER] WARNING: agent returned no flag for ${verified.missing_decisions} bill line(s); treated as OK`]
      : []),
    `[VERIFIER] ${money(verified.breakdown.total_billed)} − ${money(verified.breakdown.excluded_total)} excluded = ${money(verified.breakdown.eligible_amount)} eligible`,
    ...(verified.breakdown.excluded_total
      ? [`[VERIFIER] Excluded = ${money(verified.breakdown.flagged_total)} flagged for review + ${money(verified.breakdown.not_covered_total)} not covered`]
      : []),
    `[VERIFIER] Copay ${verified.breakdown.copay_percentage}% = ${money(verified.breakdown.copay_amount)} → payable ${money(verified.breakdown.payable_before_cap)}`,
    ...(verified.breakdown.cap_applied
      ? [`[VERIFIER] Max coverage cap applied: reduced by ${money(verified.breakdown.cap_reduction)}`]
      : []),
    ...(verified.unmatched_line_items.length
      ? [`[VERIFIER] WARNING: ${verified.unmatched_line_items.length} flagged item(s) could not be matched to bill lines and were ignored`]
      : []),
    mathMatches && statusMatches
      ? `[VERIFIER] ✓ Agent math confirmed: ${money(verified.approved_amount)} (${verified.status})`
      : `[VERIFIER] ⚠ Agent reported ${money(aiAmount)} (${result.final_status}); corrected to ${money(verified.approved_amount)} (${verified.status})`,
    `[SYS] Adjudication complete in ${(elapsedMs() / 1000).toFixed(1)}s`,
  ]);

  const reasoningLog = {
    chain_of_thought: logLines,
    agent_chain_of_thought: result.chain_of_thought,
    line_items: verified.line_items,
    denied_items: verified.denied_items,
    unmatched_line_items: verified.unmatched_line_items,
    breakdown: verified.breakdown,
    ai_reported: { final_status: result.final_status, approved_amount: aiAmount },
    verification: { math_matches: mathMatches, status_matches: statusMatches },
    model,
    attempts,
    duration_ms: elapsedMs(),
    processed_at: new Date().toISOString(),
    processed_by: processedBy, // the account that ran it; a verdict is saved once and never replaced
  };

  const { data: updated, error } = await supabaseAdmin
    .from('claims')
    .update({
      status: verified.status,
      approved_amount: verified.approved_amount,
      ai_reasoning_log: reasoningLog,
    })
    .eq('id', claim.id)
    .in('status', ['PENDING', 'PROCESSING']) // replaces pending or in-progress lock, never replaces an already finalized verdict
    .select('*, policies(*), disputes(*)')
    .maybeSingle();

  if (error) throw new HttpError(500, `Failed to save adjudication: ${error.message}`);
  if (!updated) throw new HttpError(409, 'This claim has already been adjudicated.');
  return updated;
}

// Gap between streamed log lines, so a terminal UI prints them one by one
// instead of in a single burst once the model has answered.
const STREAM_LINE_GAP_MS = 40;

/**
 * Server-Sent Events mode of the process route:
 *   stage_start {stage} · log {message} · result {claim} · error {message}
 * Once the stream is open every failure is reported as an `error` event,
 * because the HTTP status has already been sent.
 */
async function streamAdjudication(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const open = () => !res.writableEnded && !res.destroyed;
  const send = (event, data) => open() && res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // The model call can be silent for a while; comments keep proxies from closing the stream.
  const heartbeat = setInterval(() => open() && res.write(': ping\n\n'), 15_000);

  try {
    const { id } = uuidParamSchema.parse(req.params);
    const claim = await adjudicate(id, req, {
      onStage: (stage) => send('stage_start', { stage }),
      onLog: async (message) => {
        send('log', { message });
        // A client that left still gets its claim adjudicated and saved, just without the pacing.
        if (open()) await new Promise((r) => setTimeout(r, STREAM_LINE_GAP_MS));
      },
    });
    send('result', claim);
  } catch (err) {
    const expected = err instanceof HttpError || err?.name === 'ZodError';
    if (!expected) console.error('[error]', err);
    send('error', { message: err instanceof HttpError ? err.message : expected ? 'Invalid claim ID.' : 'Internal server error' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

/**
 * POST /api/claims/:id/process — the agentic adjudication route.
 * Answers with JSON, or streams progress when the client asks for text/event-stream.
 */
export async function processClaim(req, res) {
  if ((req.headers.accept || '').includes('text/event-stream')) return streamAdjudication(req, res);

  const { id } = uuidParamSchema.parse(req.params);
  res.json({ claim: await adjudicate(id, req) });
}

/**
 * GET /api/policies — for the claim submission form.
 *   patient  → the policy (or policies) they hold
 *   hospital → the one policy whose number they give (?policy_number=), as read
 *              off the patient's card
 * A hospital account is self-declared, so it never gets the full list or a
 * holder's patient ID: that pair is what a patient account is claimed with.
 */
export async function listPolicies(req, res) {
  const terms = 'id, policy_number, max_coverage_limit, copay_percentage, covered_treatments, excluded_treatments';
  let query;

  if (isPatient(req)) {
    query = supabaseAdmin.from('policies').select(`${terms}, patient_id`).eq('patient_id', req.profile.patient_id);
  } else {
    const { policy_number: number } = policyLookupSchema.parse(req.query);
    if (!number) return res.json({ policies: [] });
    query = supabaseAdmin.from('policies').select(terms).in('policy_number', [number, number.toUpperCase()]);
  }

  const { data, error } = await query.order('policy_number');

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  res.json({ policies: data });
}
