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
import { formatCurrency } from '../lib/format';
import { BarChart3, FileText, Printer, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PlainSummary } from '../components/PlainSummary';
import { PatientSmsModal } from '../components/PatientSmsModal';
import { BenchmarkInspectorModal } from '../components/BenchmarkInspectorModal';

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
  const [showSlip, setShowSlip] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
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
    setEvents([]);

    const token = await getAccessToken();
    const startedAt = Date.now();
    const abort = new AbortController();
    streamAbort.current = abort;
    let settled = false; // the `result` event arrived

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
            toast.error(data.message);
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
      if (!abort.signal.aborted) toast.error(err?.message || 'Connection lost');
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
    if (!loadError) return <div className="p-10 text-center font-mono">Loading...</div>;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-paper p-8 rounded-lg border border-rule text-center space-y-4 shadow-sm">
          <div className="font-serif text-2xl text-pine-deep">Unable to load this claim</div>
          <div className="text-sm text-vermilion font-mono bg-vermilion/5 border border-vermilion/20 p-3 rounded">{loadError}</div>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/dashboard" className="px-4 py-2 border border-rule text-sm rounded hover:bg-bone transition-colors font-medium">
              Back to dashboard
            </Link>
            <button onClick={loadClaim} className="px-4 py-2 bg-pine hover:bg-pine-deep text-bone text-sm rounded transition-colors font-medium">
              Retry
            </button>
          </div>
        </div>
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
  const payoutNote = !decided
    ? busy
      ? 'Adjudication in progress'
      : !stalled
        ? 'Not adjudicated yet'
        : canRun
          ? 'The last run stopped before it finished. Run it again.'
          : 'The last run stopped before it finished. The hospital needs to run it again.'
    : isPatient ? `You pay ${formatCurrency(patientPayable(claim))}` : '';

  const inspected = inspectedLine ? { item: claim.raw_bill_data[inspectedLine - 1], hit: flagByLine.get(inspectedLine) } : null;
  const canDisputeInspected =
    canDispute && Boolean(inspected?.hit) && isSuspicious(inspected!.hit!.flag) && !inspected!.hit!.waived && !disputedLines.has(inspectedLine!);

  const onDisputeAnswered = (dispute: Dispute) => {
    upsertDispute(dispute);
    // An accepted dispute takes the charge off what the patient owes; show the new amounts.
    if (dispute.status === 'ACCEPTED') loadClaim();
  };

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left: Bill Details */}
      <div className="lg:col-span-3 space-y-6">
        <div className="bg-paper p-6 rounded-lg border border-rule">
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft border-b border-rule pb-2 mb-4">Claim Intake</h2>
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
              <div className="flex justify-between items-center mb-2">
                <span className="text-ink-soft">Itemized Bill</span>
                <span className="text-[10px] font-mono text-pine bg-pine/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <BarChart3 size={11} /> Rate Inspector
                </span>
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
                      className={`w-full text-left font-mono text-xs p-2 rounded transition-all cursor-pointer border ${
                        hit
                          ? 'bg-vermilion/10 border-vermilion/30 hover:bg-vermilion/15'
                          : 'bg-bone border-transparent hover:border-pine/30 hover:bg-rule/40'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="truncate pr-2 font-medium">{item.item_name}</span>
                        <span className="font-bold">{formatCurrency(item.cost)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        {hit ? (
                          <div
                            className={`text-[10px] font-bold uppercase tracking-widest ${
                              isSuspicious(hit.flag) ? 'text-vermilion' : 'text-amber'
                            }`}
                          >
                            {flagLabel(hit.flag)}{hit.waived ? ' · withdrawn' : ''}
                          </div>
                        ) : (
                          // Until there is a verdict nothing has been checked, so nothing is called OK.
                          <div className={`text-[10px] font-semibold ${decided ? 'text-moss' : 'text-ink-soft'}`}>{decided ? 'OK' : 'Not checked yet'}</div>
                        )}
                        <span className="text-[9px] text-ink-soft hover:text-pine">
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
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-serif text-pine-deep">AI Adjudication Core</h2>
          {canRun && (
            <button
              onClick={runAdjudication}
              disabled={busy}
              className="bg-phosphor hover:bg-phosphor/80 text-pine-deep font-bold font-mono text-xs uppercase tracking-widest px-4 py-2 rounded transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_15px_rgba(92,255,157,0.3)]"
            >
              {stalled ? 'Run Adjudication Again' : 'Run Autonomous Adjudication'}
            </button>
          )}
        </div>

        {loadError && (
          <div className="text-xs text-vermilion font-mono">Could not refresh this claim: {loadError}</div>
        )}

        <AgentTerminal events={events} isProcessing={busy} />
      </div>

      {/* Right: Summary */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-paper p-6 rounded-lg border border-rule h-full shadow-sm flex flex-col">
          <div className="flex justify-between items-start border-b border-rule pb-4 mb-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft">Decision Summary</h2>
            <div className="flex items-center gap-2">
              {decided && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSmsModal(true)}
                    id="export-sms-alert"
                    className="inline-flex items-center gap-1 rounded bg-bone hover:bg-rule/40 border border-rule px-2.5 py-1 text-xs font-mono text-pine-deep transition-colors cursor-pointer"
                    title="Simulate SMS / WhatsApp cashless clearance alert sent to patient phone"
                  >
                    <Smartphone size={13} /> SMS Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSlip(true)}
                    id="export-discharge-slip"
                    className="inline-flex items-center gap-1 rounded bg-bone hover:bg-rule/40 border border-rule px-2.5 py-1 text-xs font-mono text-pine-deep transition-colors cursor-pointer"
                  >
                    <Printer size={13} /> Discharge Slip
                  </button>
                </>
              )}
              <StatusStamp status={busy ? 'PROCESSING' : stalled ? 'PENDING' : claim.status} />
            </div>
          </div>

          <div className="text-center mb-8">
            <div className="text-ink-soft text-sm mb-1">Approved Payout</div>
            <div className="font-serif text-5xl text-pine-deep tracking-tight">
              {approvedDisplay(claim)}
            </div>
            {payoutNote && <div className="text-xs text-ink-soft font-mono mt-2">{payoutNote}</div>}
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
                <div className="font-mono text-xs uppercase tracking-widest text-ink-soft">
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
                <div className="font-mono text-xs uppercase tracking-widest text-ink-soft">
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

      {showSlip && <DischargeSlipModal claim={claim} onClose={() => setShowSlip(false)} />}
      {showSmsModal && <PatientSmsModal claim={claim} onClose={() => setShowSmsModal(false)} />}
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
