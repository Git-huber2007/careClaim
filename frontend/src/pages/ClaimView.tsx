import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { API_BASE, errorMessage, fetchApi, getAccessToken } from '../lib/api';
import { useAccount } from '../lib/account';
import { approvedDisplay, flagLabel, flaggedLines, isSuspicious, patientPayable, toPayoutBreakdown, toTerminalEvents } from '../lib/claims';
import type { Dispute } from '../lib/claims';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { AgentTerminal } from '../components/AgentTerminal';
import type { TerminalEvent } from '../components/AgentTerminal';
import { PayoutWaterfall } from '../components/PayoutWaterfall';
import { StatusStamp } from '../components/StatusStamp';
import { DischargeSlipModal } from '../components/DischargeSlipModal';
import { DisputeCard } from '../components/DisputeCard';
import { FlaggedLine } from '../components/FlaggedLine';
import { formatCurrency } from '../lib/format';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';

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

  // A run this tab is not streaming (the stream dropped, or it was started
  // before this page opened) still finishes and saves on the backend, so wait
  // for its verdict instead of offering to run the claim a second time.
  const adjudicating = Boolean(claim?.adjudicating) || claim?.status === 'PROCESSING';
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
    if (!claim || claim.status !== 'PENDING' || busy) return;

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
  const canRun = claim.status === 'PENDING' && !busy && (!isPatient || claim.source === 'PATIENT');
  // A bill the patient entered themselves has no hospital account behind it to answer.
  const canDispute = isPatient && claim.source === 'HOSPITAL';
  const payoutNote = !decided
    ? busy ? 'Adjudication in progress' : 'Not adjudicated yet'
    : isPatient ? `You pay ${formatCurrency(patientPayable(claim))}` : '';

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
            <div className="border-t border-rule pt-4">
              <div className="text-ink-soft mb-2">Itemized Bill</div>
              <div className="space-y-2">
                {claim.raw_bill_data.map((item: any, i: number) => {
                  const hit = flagByLine.get(i + 1);
                  return (
                    <div key={i} title={hit?.reason} className={`font-mono text-xs p-2 rounded ${hit ? 'bg-vermilion/10' : 'bg-bone'}`}>
                      <div className="flex justify-between">
                        <span className="truncate pr-2">{item.item_name}</span>
                        <span>{formatCurrency(item.cost)}</span>
                      </div>
                      {hit && (
                        <div className={`mt-1 text-[10px] font-bold uppercase tracking-widest ${isSuspicious(hit.flag) ? 'text-vermilion' : 'text-amber'}`}>
                          {flagLabel(hit.flag)}
                        </div>
                      )}
                    </div>
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
              {busy ? 'Processing...' : 'Run Autonomous Adjudication'}
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
                <button
                  type="button"
                  onClick={() => setShowSlip(true)}
                  id="export-discharge-slip"
                  className="inline-flex items-center gap-1 rounded bg-bone hover:bg-rule/40 border border-rule px-2.5 py-1 text-xs font-mono text-pine-deep transition-colors cursor-pointer"
                >
                  <Printer size={13} /> Discharge Slip
                </button>
              )}
              <StatusStamp status={busy ? 'PROCESSING' : claim.status} />
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
                  />
                ))}
                {isPatient && flagged.some(l => isSuspicious(l.flag)) && (
                  <p className="text-xs text-ink-soft">
                    A flag means the charge is worth asking about. It is not proof that the hospital did anything wrong.
                  </p>
                )}
              </div>
            )}

            {disputes.length > 0 && (
              <div className="mt-8 space-y-2">
                <div className="font-mono text-xs uppercase tracking-widest text-ink-soft">
                  {isPatient ? 'Your disputes on this bill' : `Patient disputes (${disputes.length})`}
                </div>
                <ul className="space-y-2">
                  {disputes.map(d => (
                    <DisputeCard key={d.id} dispute={d} onChanged={upsertDispute} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSlip && <DischargeSlipModal claim={claim} onClose={() => setShowSlip(false)} />}
    </div>
  );
}
