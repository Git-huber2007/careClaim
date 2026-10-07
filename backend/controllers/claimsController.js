import { config } from '../config.js';
import { supabaseAdmin } from '../services/supabase.js';
import { runAdjudicationAgent, extractBillFromDocument } from '../services/geminiService.js';
import { computeAdjudication, round2 } from '../services/adjudicationMath.js';
import {
  claimSubmissionSchema,
  uuidParamSchema,
  billExtractionSchema,
  policyLookupSchema,
  estimateSchema,
} from '../validation/schemas.js';
import { HttpError, dbError, schemaOutOfDate } from '../utils/http.js';

const CLAIM_LIST_COLUMNS =
  'id, patient_id, policy_id, diagnosis_code, total_billed, status, approved_amount, source, created_at, updated_at, policies(policy_number), disputes(status), flagged_total:ai_reasoning_log->breakdown->flagged_total';

const money = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

const norm = (s) => String(s || '').trim().toLowerCase();
const isPatient = (req) => req.profile.role === 'PATIENT';

/**
 * The service role bypasses RLS, so this is the access rule for a claim:
 *   hospital → claims filed by that account or by anyone in its organization
 *   patient  → claims filed for their patient ID, plus bills they checked themselves
 */
function canAccess(claim, req) {
  if (!isPatient(req)) {
    if (claim.source !== 'HOSPITAL') return false;
    const org = req.profile.hospital_org;
    return claim.hospital_user_id === req.user.id || Boolean(org && org === claim.hospital_org);
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
      waived_total: b.waived_total,
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
    if (error) throw dbError(error);
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

  if (error) throw dbError(error);
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

  if (error) throw dbError(error);
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

  if (policyErr) throw dbError(policyErr);
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

  const { data, error } = await supabaseAdmin
    .from('claims')
    .insert({
      ...owner,
      policy_id: body.policy_id,
      diagnosis_code: body.diagnosis_code,
      raw_bill_data: body.raw_bill_data,
      total_billed: body.total_billed,
      status: 'PENDING',
    })
    .select(CLAIM_LIST_COLUMNS)
    .single();

  if (error) throw dbError(error, 'Failed to create claim');
  res.status(201).json({ claim: data });
}

// Model requests made today, per account (only counted when a daily cap is configured).
const aiRequests = { day: '', counts: new Map() };

/** Counts one model request against the caller's daily cap, or refuses it. */
function spendAiRequest(userId) {
  const limit = config.aiDailyLimitPerUser;
  if (!limit) return;
  const today = new Date().toISOString().slice(0, 10);
  if (aiRequests.day !== today) {
    aiRequests.day = today;
    aiRequests.counts.clear();
  }
  const used = aiRequests.counts.get(userId) ?? 0;
  if (used >= limit) {
    throw new HttpError(429, `This account has used its ${limit} AI requests for today. The count resets at midnight UTC.`);
  }
  aiRequests.counts.set(userId, used + 1);
}

/** POST /api/claims/extract-bill — extract line items from image or PDF via Gemini Vision */
export async function extractBill(req, res) {
  const body = billExtractionSchema.parse(req.body);
  spendAiRequest(req.user.id);
  const extracted = await extractBillFromDocument(body);
  res.json({ extracted });
}

/** A value inside a PostgREST filter: quoted, with the quote and the escape character escaped. */
export const quoted =(value) => `"${String(value).replace(/[\\"]/g, '\\$&')}"`;

/** The claims the caller may see (the list-level form of canAccess). */
function scopedClaims(req, columns) {
  const query = supabaseAdmin.from('claims').select(columns);
  if (isPatient(req)) {
    return query.eq('patient_id', req.profile.patient_id).or(`source.eq.HOSPITAL,patient_user_id.eq.${req.user.id}`);
  }
  // Hospital staff share their organization's claim queue
  const org = req.profile.hospital_org;
  if (org) {
    return query.eq('source', 'HOSPITAL').or(`hospital_org.eq.${quoted(org)},hospital_user_id.eq.${req.user.id}`);
  }
  return query.eq('source', 'HOSPITAL').eq('hospital_user_id', req.user.id);
}

/** GET /api/claims */
export async function listClaims(req, res) {
  const claims = await allRows(() => scopedClaims(req, CLAIM_LIST_COLUMNS).order('created_at', { ascending: false }).order('id'));
  // `stalled` as on a single claim: PROCESSING, but the run behind it died.
  res.json({ claims: claims.map((c) => (c.status === 'PROCESSING' ? { ...c, stalled: isStalled(c) } : c)) });
}

/** GET /api/stats — headline numbers over the caller's own claims */
export async function getStats(req, res) {
  const cols = 'status, approved_amount, duration_ms:ai_reasoning_log->duration_ms';
  const data = await allRows(() => scopedClaims(req, cols).order('id'));

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

// A run also marks its claim PROCESSING in the database, so another server
// instance will not start it too. If the server stops mid-run that mark is
// never cleared; after this long (a run takes about two minutes at worst) the
// claim counts as stalled and can be run again.
const STALE_LOCK_MS = 3 * 60 * 1000;
const lockIsStale = (claim) =>
  claim.status === 'PROCESSING' && !(Date.now() - Date.parse(claim.updated_at) <= STALE_LOCK_MS);
// Function declaration, so the list handler above can use it: stalled = marked, old, and not running here.
function isStalled(claim) {
  return !inFlight.has(claim.id) && lockIsStale(claim);
}

/** GET /api/claims/:id */
export async function getClaim(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  // Read before the row: a run that finishes while the query is out must not
  // pair a stale PENDING row with "nothing is running".
  const running = inFlight.has(id);
  const claim = await getAccessibleClaim(id, req);
  const stalled = !running && lockIsStale(claim);
  res.json({
    claim: { ...present(claim, req), adjudicating: running || (claim.status === 'PROCESSING' && !stalled), stalled },
  });
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

  const alreadyRunning = 'This claim is already being adjudicated. The verdict appears when that run finishes.';
  const stalled = isStalled(claim);
  if (inFlight.has(claim.id) || (claim.status === 'PROCESSING' && !stalled)) throw new HttpError(409, alreadyRunning);
  // A saved verdict is final: patients raise disputes against its line flags.
  if (claim.status !== 'PENDING' && !stalled) throw new HttpError(409, 'This claim has already been adjudicated.');

  // Take the claim in the database: PENDING → PROCESSING, or a stalled run's
  // PROCESSING → PROCESSING with a new time. The update only matches the row
  // as it was just read, so of two servers trying at once, one gets nothing.
  let lock = supabaseAdmin
    .from('claims')
    .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
    .eq('id', claim.id)
    .eq('status', claim.status);
  if (stalled) lock = claim.updated_at ? lock.eq('updated_at', claim.updated_at) : lock.is('updated_at', null);

  const { data: locked, error: lockErr } = await lock.select('id').maybeSingle();
  // 23514: the status check constraint predates PROCESSING.
  if (lockErr) throw lockErr.code === '23514' ? schemaOutOfDate() : dbError(lockErr);
  if (!locked) throw new HttpError(409, alreadyRunning);

  inFlight.add(claim.id);
  try {
    spendAiRequest(req.user.id);
    return present(await runAgent(claim, { onStage, onLog, processedBy: req.user.id }), req);
  } catch (err) {
    // No verdict was saved, so hand the claim back for another try.
    const { error: unlockErr } = await supabaseAdmin
      .from('claims')
      .update({ status: 'PENDING' })
      .eq('id', claim.id)
      .eq('status', 'PROCESSING');
    if (unlockErr) console.warn('[claims] could not return claim to PENDING:', unlockErr.message);
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
  if (model !== config.geminiModel) await log([`[SYS] ${config.geminiModel} has no quota left; answered by ${model}`]);
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

  if (error) throw dbError(error);
  res.json({ policies: data });
}

/** GET /api/reference-prices — the rate card the overcharge check compares against */
export async function listReferencePrices(_req, res) {
  const { data, error } = await supabaseAdmin
    .from('reference_prices')
    .select('item_name, typical_max_price, unit')
    .order('item_name');

  if (error) throw dbError(error);
  res.json({ prices: data });
}

/**
 * POST /api/estimate — what a policy would pay for a planned bill, before
 * anything is filed. No model is involved: a line is left out only if its name
 * opens with one of the policy's exclusions or it exactly repeats another
 * line, and the patient is taken to be the policy's holder, so this is the
 * most the policy would pay. (The patient ID is deliberately not an input:
 * a free answer to "does this ID hold this policy?" would let IDs be guessed.)
 */
export async function estimatePayout(req, res) {
  const body = estimateSchema.parse(req.body);

  const { data: policy, error } = await supabaseAdmin.from('policies').select('*').eq('id', body.policy_id).maybeSingle();
  if (error) throw dbError(error);
  if (!policy) throw new HttpError(400, 'Referenced policy does not exist.', [{ path: 'policy_id', message: 'Unknown policy' }]);
  if (isPatient(req) && norm(policy.patient_id) !== norm(req.profile.patient_id)) {
    throw new HttpError(403, 'You can only estimate against your own policy.', [{ path: 'policy_id', message: 'Not your policy' }]);
  }

  const estimate = computeAdjudication({
    billItems: body.raw_bill_data,
    totalBilled: body.raw_bill_data.reduce((sum, item) => sum + item.cost, 0),
    policy,
    lineItems: [],
  });
  res.json({
    estimate: {
      breakdown: estimate.breakdown,
      excluded_lines: estimate.denied_items.map(({ line, item_name, cost, reason }) => ({ line, item_name, cost, reason })),
    },
  });
}

/** GET /api/analytics — totals over the caller's claims, by status, by flag, by item and by day */
export async function getAnalytics(req, res) {
  const cols = 'status, total_billed, approved_amount, created_at, line_items:ai_reasoning_log->line_items, breakdown:ai_reasoning_log->breakdown';
  const claims = await allRows(() => scopedClaims(req, cols).order('id'));

  const byStatus = {};
  const totals = { billed: 0, approved: 0, flagged: 0, not_covered: 0, waived: 0 };
  const flags = new Map();
  const items = new Map();
  const days = new Map();

  for (const c of claims) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    const day = String(c.created_at).slice(0, 10);
    const d = days.get(day) ?? { date: day, claims: 0, billed: 0, approved: 0 };
    d.claims += 1;
    d.billed += Number(c.total_billed);
    days.set(day, d);

    if (c.status === 'PENDING' || c.status === 'PROCESSING') continue;
    d.approved += Number(c.approved_amount || 0);
    totals.billed += Number(c.total_billed);
    totals.approved += Number(c.approved_amount || 0);
    totals.flagged += Number(c.breakdown?.flagged_total || 0);
    totals.not_covered += Number(c.breakdown?.not_covered_total || 0);
    totals.waived += Number(c.breakdown?.waived_total || 0);

    for (const l of c.line_items ?? []) {
      if (l.flag === 'OK') continue;
      const f = flags.get(l.flag) ?? { flag: l.flag, lines: 0, amount: 0 };
      f.lines += 1;
      f.amount += Number(l.cost);
      flags.set(l.flag, f);

      const key = norm(l.item_name);
      const item = items.get(key) ?? { item_name: l.item_name, times: 0, amount: 0 };
      item.times += 1;
      item.amount += Number(l.cost);
      items.set(key, item);
    }
  }

  const byAmount = (a, b) => b.amount - a.amount;
  const rounded = (rows) => rows.map((r) => ({ ...r, amount: round2(r.amount) }));
  res.json({
    total_claims: claims.length,
    adjudicated_claims: claims.length - (byStatus.PENDING ?? 0) - (byStatus.PROCESSING ?? 0),
    by_status: byStatus,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    by_flag: rounded([...flags.values()].sort(byAmount)),
    top_flagged_items: rounded([...items.values()].sort(byAmount).slice(0, 8)),
    daily: [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((d) => ({ ...d, billed: round2(d.billed), approved: round2(d.approved) })),
  });
}

/**
 * GET /api/verify/:id — public. What the QR code on a discharge slip opens: it
 * confirms that a slip with this reference was issued and for how much, and
 * says nothing about the patient, the policy or the bill's contents.
 */
export async function verifyClaim(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const { data, error } = await supabaseAdmin
    .from('claims')
    .select('id, status, total_billed, approved_amount, hospital_org, processed_at:ai_reasoning_log->>processed_at, patient_payable:ai_reasoning_log->breakdown->patient_payable')
    .eq('id', id)
    // A bill a patient typed in and checked themselves is nobody's discharge slip.
    .eq('source', 'HOSPITAL')
    .maybeSingle();

  if (error) throw dbError(error);
  if (!data || data.status === 'PENDING' || data.status === 'PROCESSING') {
    throw new HttpError(404, 'No adjudicated claim has this reference.');
  }
  res.json({
    verification: {
      reference: data.id,
      status: data.status,
      hospital: data.hospital_org,
      total_billed: Number(data.total_billed),
      approved_amount: Number(data.approved_amount),
      patient_payable: Number(data.patient_payable ?? Math.max(0, data.total_billed - data.approved_amount)),
      processed_at: data.processed_at,
    },
  });
}

// The scanned bill a claim was typed in from, kept in private storage under the claim's ID.
const DOCUMENT_BUCKET = 'claim-documents';
let bucketReady = null;
const ensureBucket = () =>
  (bucketReady ??= supabaseAdmin.storage.createBucket(DOCUMENT_BUCKET, { public: false }).then(({ error }) => {
    if (error && !/exist/i.test(error.message)) {
      bucketReady = null;
      throw new HttpError(500, `Document storage is unavailable: ${error.message}`);
    }
  }));

/** POST /api/claims/:id/document — attach the original bill to a claim the caller filed */
export async function attachDocument(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const body = billExtractionSchema.parse(req.body);
  const claim = await getAccessibleClaim(id, req);
  if (claim.hospital_user_id !== req.user.id && claim.patient_user_id !== req.user.id) {
    throw new HttpError(403, 'Only the account that filed this claim can attach its bill.');
  }

  await ensureBucket();
  const base64 = body.fileBase64.includes(',') ? body.fileBase64.split(',')[1] : body.fileBase64;
  const { error } = await supabaseAdmin.storage
    .from(DOCUMENT_BUCKET)
    // Never replaced: it is the record of what the claim was typed in from.
    .upload(claim.id, Buffer.from(base64, 'base64'), { contentType: body.mimeType, upsert: false });

  if (error) {
    if (/exist|duplicate/i.test(error.message)) throw new HttpError(409, 'This claim already has its original bill attached.');
    throw new HttpError(500, `Failed to store the document: ${error.message}`);
  }
  res.status(201).json({ attached: true });
}

/** GET /api/claims/:id/document — a link to the claim's original bill that works for an hour, or null */
export async function getDocument(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const claim = await getAccessibleClaim(id, req);

  const { data: found, error: listErr } = await supabaseAdmin.storage.from(DOCUMENT_BUCKET).list('', { search: claim.id, limit: 1 });
  // No bucket yet means no claim has had a document attached.
  if (listErr || !found?.some((f) => f.name === claim.id)) return res.json({ url: null });

  const { data, error } = await supabaseAdmin.storage.from(DOCUMENT_BUCKET).createSignedUrl(claim.id, 3600);
  if (error) throw new HttpError(500, `Failed to open the document: ${error.message}`);
  res.json({ url: data.signedUrl });
}
