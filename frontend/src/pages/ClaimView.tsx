import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { API_BASE, errorMessage, fetchApi, getAccessToken } from '../lib/api';
import { useAccount } from '../lib/account';
import { approvedDisplay, flagLabel, flaggedLines, isSuspicious, patientPayable, toPayoutBreakdown, toTerminalEvents } from '../lib/claims';
import type { Dispute, ReferencePrice } from '../lib/claims';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { AgentTerminal } from '../components/AgentTerminal';
import type { TerminalEvent } from '../components/AgentTerminal';
import { PayoutWaterfall } from '../components/PayoutWaterfall';
import { StatusStamp } from '../components/StatusStamp';
import { DischargeSlipModal } from '../components/DischargeSlipModal';
import { DisputeCard } from '../components/DisputeCard';
import { FlaggedLine } from '../components/FlaggedLine';
import { formatCurrency, formatDate, shortId } from '../lib/format';
import { ArrowLeft, FileText, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PlainSummary } from '../components/PlainSummary';
import { BenchmarkInspectorModal } from '../components/BenchmarkInspectorModal';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/ErrorState';
import { PageTitle } from '../components/PageTitle';

/** Remounts per claim, so one claim's run never shows under another claim's URL. */
export function ClaimView() {
  const { id } = useParams();
  return <ClaimDetail key={id} id={id ?? ''} />;
}

function ClaimDetail({ id }: { id: string }) {
  const profile = useAccount();
  const isPatient = profile.role === 'PATIENT';
  const [claim, setClaim] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [streaming, setStreaming] = useState(false); // this tab holds the open run stream
  const [runFailed, setRunFailed] = useState(false); // the run this tab started ended in an error
  const [showSlip, setShowSlip] = useState(false);
  const [inspectedLine, setInspectedLine] = useState<number | null>(null);
  // The flagged line whose dispute form is open (one at a time).
  const [disputeLine, setDisputeLine] = useState<number | null>(null);
  const [prices, setPrices] = useState<ReferencePrice[] | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const streamAbort = useRef<AbortController | null>(null);

  const loadClaim = useCallback(
    () =>
      // The backend wraps the claim: { claim: { ..., policies, disputes, ai_reasoning_log } }
      fetchApi(`/api/claims/${id}`)
        .then(({ claim: data }) => {
          setClaim(data);
          setLoadError('');
          // A run still in flight has no saved log yet; keep the lines already streamed.
          if (data.ai_reasoning_log) setEvents(toTerminalEvents(data.ai_reasoning_log));
          return true;
        })
        .catch((err: any) => {
          setLoadError(err.message);
          return false;
        }),
    [id]
  );

  useEffect(() => { loadClaim(); }, [loadClaim]);

  // Extras the page works without: the rate card behind the inspector, and the scanned bill if one was attached.
  useEffect(() => {
    fetchApi('/api/reference-prices').then(res => setPrices(res.prices)).catch(() => {});
    fetchApi(`/api/claims/${id}/document`).then(res => setDocumentUrl(res.url)).catch(() => {});
  }, [id]);

  // The backend marked a run for this claim that then died (a server restart); it can be run again.
  const stalled = Boolean(claim?.stalled);
  // A run this tab is not streaming (the stream dropped, or it was started
  // before this page opened) still finishes and saves on the backend, so wait
  // for its verdict instead of offering to run the claim a second time.
  const adjudicating = Boolean(claim?.adjudicating) || (claim?.status === 'PROCESSING' && !stalled);
  useEffect(() => {
    if (!adjudicating || streaming) return;
    // Each poll waits for the one before it, so slow responses cannot pile up
    // or land out of order, and backs off while the API is failing.
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let delay = 2000;
    const schedule = () => {
      timer = setTimeout(async () => {
        delay = (await loadClaim()) ? 2000 : Math.min(delay * 2, 30000);
        if (!stopped) schedule();
      }, delay);
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [adjudicating, streaming, loadClaim]);

  useEffect(() => () => streamAbort.current?.abort(), []);

  const busy = streaming || adjudicating;

  const runAdjudication = async () => {
    if (!claim || (claim.status !== 'PENDING' && !stalled) || busy) return;

    setStreaming(true);
    setRunFailed(false);
    setEvents([]);

    const token = await getAccessToken();
    const startedAt = Date.now();
    const abort = new AbortController();
    streamAbort.current = abort;
    let settled = false; // the `result` event arrived
    // The terminal keeps the reason, so the page does not look stuck at its last line.
    const logError = (message: string) =>
      setEvents(prev => [...prev, { ts: Date.now() - startedAt, event: 'log', data: { message: `[ERR] ${message}` } }]);

    try {
      await fetchEventSource(`${API_BASE}/api/claims/${id}/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: abort.signal,
        // By default the stream is dropped when the tab is hidden and the POST
        // is sent again when it is shown, which would adjudicate the claim twice.
        openWhenHidden: true,
        async onopen(res) {
          if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) return;
          // Rejected before the stream opened (expired session, no access): a normal JSON error.
          const body = await res.json().catch(() => ({}));
          throw new Error(errorMessage(body, res.status));
        },
        onmessage(ev) {
          if (!ev.data) return;
          const data = JSON.parse(ev.data);
          if (ev.event === 'result') {
            settled = true;
            setClaim(data);
          } else if (ev.event === 'error') {
            setRunFailed(true);
            logError(data.message);
            toast.error(isPatient ? 'The check failed. The log shows why.' : 'The adjudication failed. The log shows why.');
          } else {
            setEvents(prev => [...prev, { ts: Date.now() - startedAt, event: ev.event as any, data }]);
          }
        },
        onerror(err) {
          // Rethrown to stop the library's automatic retry, which would POST the run again.
          throw err;
        }
      });
    } catch (err: any) {
      if (!abort.signal.aborted) {
        const message = err?.message || 'Connection lost';
        logError(message);
        toast.error(message);
      }
    } finally {
      setStreaming(false);
      // No verdict came down this stream. Ask the backend where the claim stands:
      // if the run is still going there, it comes back as `adjudicating`.
      if (!settled && !abort.signal.aborted) loadClaim();
    }
  };

  const upsertDispute = (dispute: Dispute) =>
    setClaim((c: any) => ({
      ...c,
      disputes: [...(c.disputes ?? []).filter((d: Dispute) => d.id !== dispute.id), dispute].sort(
        (a: Dispute, b: Dispute) => a.line_number - b.line_number
      )
    }));

  if (!claim) {
    if (!loadError) return <Loading label="Loading claim…" />;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <ErrorState title="Unable to load this claim" message={loadError}>
          <Link to="/dashboard" className="btn btn-secondary">
            Back to dashboard
          </Link>
          <button onClick={loadClaim} className="btn btn-primary">
            Retry
          </button>
        </ErrorState>
      </div>
    );
  }

  const log = claim.ai_reasoning_log;
  const breakdown = toPayoutBreakdown(log);
  const flagged = flaggedLines(log);
  const flagByLine = new Map(flagged.map(l => [l.line, l]));
  const disputes: Dispute[] = claim.disputes ?? [];
  const disputedLines = new Set(disputes.map(d => d.line_number));
  const decided = claim.status !== 'PENDING' && claim.status !== 'PROCESSING';
  // A patient can open a claim the hospital filed for them, but only the hospital can run it.
  const canRun = (claim.status === 'PENDING' || stalled) && !busy && (!isPatient || claim.source === 'PATIENT');
  // A bill the patient entered themselves has no hospital account behind it to answer.
  const canDispute = isPatient && claim.source === 'HOSPITAL';
  // The same page in two registers: a hospital adjudicates a claim, a patient checks a bill.
  const words = isPatient
    ? {
        thing: 'Bill',
        intake: 'Your bill',
        logTitle: 'How this bill was checked',
        runFirst: 'Check this bill',
        runAgain: 'Check it again',
        run: 'check',
        running: 'Checking your bill…',
        notYet: 'Not checked yet',
        afterwards: 'Once the bill is checked, the payout breakdown, a plain-language summary and any charges that were not paid appear here.'
      }
    : {
        thing: 'Claim',
        intake: 'Claim intake',
        logTitle: 'Adjudication log',
        runFirst: 'Run adjudication',
        runAgain: 'Run adjudication again',
        run: 'run',
        running: 'Adjudication in progress',
        notYet: 'Not adjudicated yet',
        afterwards: 'Once the claim is adjudicated, the payout breakdown, a plain-language summary and any charges that were not paid appear here.'
      };

  // The run ended without a verdict: it failed in this tab, or died on the server.
  const runBroke = !decided && !busy && (runFailed || stalled);
  const payoutNote = !decided
    ? busy
      ? words.running
      : !runBroke
        ? words.notYet
        : `The last ${words.run} ${runFailed ? 'failed' : 'stopped before it finished'}. ${canRun ? `${words.runAgain}.` : 'The hospital needs to run it again.'}`
    : isPatient
      ? `You pay ${formatCurrency(patientPayable(claim))}`
      : (patientPayable(claim) > 0 ? `Patient owes ${formatCurrency(patientPayable(claim))}` : 'Fully settled by policy');

  const inspected = inspectedLine ? { item: claim.raw_bill_data[inspectedLine - 1], hit: flagByLine.get(inspectedLine) } : null;
  const canDisputeInspected =
    canDispute && Boolean(inspected?.hit) && isSuspicious(inspected!.hit!.flag) && !inspected!.hit!.waived && !disputedLines.has(inspectedLine!);

  const onDisputeAnswered = (dispute: Dispute) => {
    upsertDispute(dispute);
    // An accepted dispute takes the charge off what the patient owes; show the new amounts.
    if (dispute.status === 'ACCEPTED') loadClaim();
  };

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto space-y-6">
      <PageTitle>{`${words.thing} #${shortId(claim.id)}`}</PageTitle>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule pb-4">
        <div>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-pine font-medium hover:underline">
            <ArrowLeft size={14} /> {isPatient ? 'My bills' : 'Claims'}
          </Link>
          <h1 className="text-3xl font-serif text-pine-deep mt-1">{words.thing} #{shortId(claim.id)}</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm font-mono text-ink-soft">
            Filed {formatDate(claim.created_at)} · {claim.patient_id}
          </p>
          {canRun && (
            <button
              onClick={runAdjudication}
              disabled={busy}
              className="btn btn-run lg:hidden"
            >
              {runBroke ? words.runAgain : words.runFirst}
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Bill Details */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-paper p-6 rounded-lg border border-rule">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft border-b border-rule pb-2 mb-4">{words.intake}</h2>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-ink-soft">Patient ID</div>
                <div className="font-medium">{claim.patient_id}</div>
              </div>
              <div>
                <div className="text-ink-soft">Policy</div>
                <div className="font-mono bg-bone px-1 rounded inline-block">{claim.policies?.policy_number}</div>
              </div>
              <div>
                <div className="text-ink-soft">Diagnosis</div>
                <div className="font-mono bg-bone px-1 rounded inline-block">{claim.diagnosis_code}</div>
              </div>
              {documentUrl && (
                <div>
                  <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-pine font-medium hover:underline">
                    <FileText size={14} /> View the original bill
                  </a>
                </div>
              )}
              <div className="border-t border-rule pt-4">
                <div className="mb-2">
                  <div className="text-ink-soft">Itemized bill</div>
                  <div className="text-xs text-ink-soft">Select a line to compare it with the reference price.</div>
                </div>
                <div className="space-y-2">
                  {claim.raw_bill_data.map((item: any, i: number) => {
                    const lineNumber = i + 1;
                    const hit = flagByLine.get(lineNumber);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setInspectedLine(lineNumber)}
                        title="Compare this charge with the reference price"
                        className={`group w-full text-left font-mono text-xs p-2 rounded transition-all cursor-pointer border ${
                          hit
                            ? 'bg-vermilion/10 border-vermilion/30 hover:bg-vermilion/15'
                            : 'bg-bone border-transparent hover:border-pine/30 hover:bg-rule/40'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="min-w-0 break-words font-medium">{item.item_name}</span>
                          <span className="shrink-0 font-bold">{formatCurrency(item.cost)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2 mt-1">
                          {hit ? (
                            <div
                              className={`font-bold uppercase tracking-wider ${
                                isSuspicious(hit.flag) ? 'text-vermilion' : 'text-amber-ink'
                              }`}
                            >
                              {flagLabel(hit.flag)}{hit.waived ? ' · withdrawn' : ''}
                            </div>
                          ) : (
                            // Until there is a verdict nothing has been checked, so nothing is called OK.
                            <div className={`font-semibold ${decided ? 'text-moss' : 'text-ink-soft'}`}>{decided ? 'OK' : 'Not checked yet'}</div>
                          )}
                          <span className="shrink-0 text-ink-soft group-hover:text-pine">
                            Inspect ↗
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between font-mono font-bold mt-4 pt-2 border-t border-rule/50">
                  <span>Total</span>
                  <span>{formatCurrency(claim.total_billed)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Agent Terminal */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-lg font-sans font-semibold text-pine-deep">{words.logTitle}</h2>
            {canRun && (
              <button
                onClick={runAdjudication}
                disabled={busy}
                className="btn btn-run"
              >
                {runBroke ? words.runAgain : words.runFirst}
              </button>
            )}
          </div>

          {loadError && (
            <div className="text-xs text-vermilion font-mono">Could not refresh this claim: {loadError}</div>
          )}

          <AgentTerminal events={events} isProcessing={busy} />
        </div>

        {/* Right: Summary */}
        {/* On a phone the columns stack; once there is a verdict it goes above the bill and the log. */}
        <div className={`lg:col-span-4 space-y-6 ${decided ? 'order-first lg:order-none' : ''}`}>
          <div className="bg-paper p-6 rounded-lg border border-rule flex flex-col">
            <div className="flex justify-between items-start border-b border-rule pb-4 mb-6">
              <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft">Decision summary</h2>
              <div className="flex items-center gap-2">
                {decided && (
                  <button
                    type="button"
                    onClick={() => setShowSlip(true)}
                    id="export-discharge-slip"
                    className="btn btn-sm btn-secondary"
                  >
                    <Printer size={13} /> Discharge slip
                  </button>
                )}
                <StatusStamp status={busy ? 'PROCESSING' : stalled ? 'PENDING' : claim.status} />
              </div>
            </div>

            <div className="text-center mb-8">
              <div className="text-ink-soft text-sm mb-1">Approved payout</div>
              <div className="font-mono tabular-nums text-4xl sm:text-5xl font-bold text-pine-deep tracking-tight">
                {decided ? approvedDisplay(claim) : (busy ? 'Checking…' : 'Awaiting check')}
              </div>
              {payoutNote && <div className={`text-xs font-mono mt-2 ${runBroke ? 'text-vermilion' : 'text-ink-soft'}`}>{payoutNote}</div>}
              {!decided && !busy && (
                <p className="text-sm text-ink-soft mt-6 max-w-xs mx-auto">
                  {words.afterwards}
                </p>
              )}
            </div>

            <div className="flex-1">
              {breakdown && (
                <PayoutWaterfall breakdown={breakdown} />
              )}

              {decided && (
                <div className="mt-8">
                  <PlainSummary claim={claim} forPatient={isPatient} />
                </div>
              )}

              {flagged.length > 0 && (
                <div className="mt-8 space-y-2">
                  <div className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    {claim.status === 'DENIED' ? 'Claim Denied' : 'Line Items Not Paid'}
                  </div>
                  {flagged.map(l => (
                    <FlaggedLine
                      key={l.line}
                      claimId={claim.id}
                      line={l}
                      canDispute={canDispute}
                      disputed={disputedLines.has(l.line)}
                      onDisputed={upsertDispute}
                      open={disputeLine === l.line}
                      onOpenChange={open => setDisputeLine(open ? l.line : null)}
                    />
                  ))}
                </div>
              )}

              {disputes.length > 0 && (
                <div className="mt-8 space-y-2">
                  <div className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    {isPatient ? 'Your disputes on this bill' : `Patient disputes (${disputes.length})`}
                  </div>
                  <ul className="space-y-2">
                    {disputes.map(d => (
                      <DisputeCard key={d.id} dispute={d} onChanged={onDisputeAnswered} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {showSlip && <DischargeSlipModal claim={claim} onClose={() => setShowSlip(false)} />}
      {inspected && inspectedLine && (
        <BenchmarkInspectorModal
          item={inspected.item}
          hit={inspected.hit}
          lineNumber={inspectedLine}
          decided={decided}
          prices={prices}
          onClose={() => setInspectedLine(null)}
          onStartDispute={
            canDisputeInspected
              ? () => {
                  setDisputeLine(inspectedLine);
                  setInspectedLine(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
