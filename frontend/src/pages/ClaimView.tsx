import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { API_BASE, errorMessage, fetchApi, getAccessToken } from '../lib/api';
import { useAccount } from '../lib/account';
import { flagLabel, flaggedLines, isSuspicious, toPayoutBreakdown, toTerminalEvents } from '../lib/claims';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { AgentTerminal } from '../components/AgentTerminal';
import type { TerminalEvent } from '../components/AgentTerminal';
import { PayoutWaterfall } from '../components/PayoutWaterfall';
import { StatusStamp } from '../components/StatusStamp';
import { DischargeSlipModal } from '../components/DischargeSlipModal';
import { formatCurrency } from '../lib/format';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';

export function ClaimView() {
  const { id } = useParams();
  const profile = useAccount();
  const [claim, setClaim] = useState<any>(null);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSlip, setShowSlip] = useState(false);

  const loadClaim = useCallback(async () => {
    if (!id) return;
    try {
      // The backend wraps the claim: { claim: { ..., policies, ai_reasoning_log } }
      const { claim: data } = await fetchApi(`/api/claims/${id}`);
      setClaim(data);
      setEvents(toTerminalEvents(data.ai_reasoning_log));
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    if (!id) return;
    fetchApi(`/api/claims/${id}`)
      .then(({ claim: data }) => {
        if (!active) return;
        setClaim(data);
        setEvents(toTerminalEvents(data.ai_reasoning_log));
      })
      .catch((err: any) => {
        if (!active) return;
        toast.error(err.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const runAdjudication = async () => {
    if (!claim || claim.status !== 'PENDING') return;

    setIsProcessing(true);
    setEvents([]);

    const token = await getAccessToken();
    const startedAt = Date.now();
    let settled = false; // a `result` or `error` event arrived

    try {
      await fetchEventSource(`${API_BASE}/api/claims/${id}/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
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
            setIsProcessing(false);
          } else if (ev.event === 'error') {
            settled = true;
            toast.error(data.message);
            setIsProcessing(false);
            loadClaim();
          } else {
            setEvents(prev => [...prev, { ts: Date.now() - startedAt, event: ev.event as any, data }]);
          }
        },
        onerror(err) {
          toast.error(err?.message || 'Connection lost');
          setIsProcessing(false);
          throw err;
        },
        onclose() {
          setIsProcessing(false);
          // The stream ended without a verdict; the backend still finishes and saves the run.
          if (!settled) loadClaim();
        }
      });
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  if (!claim) return <div className="p-10 text-center font-mono">Loading...</div>;

  const log = claim.ai_reasoning_log;
  const breakdown = toPayoutBreakdown(log);
  const flagged = flaggedLines(log);
  const flagByLine = new Map(flagged.map(l => [l.line, l]));
  // A patient can open a claim the hospital filed for them, but only the hospital can run it.
  const canRun = claim.status === 'PENDING' && (profile.role !== 'PATIENT' || claim.source === 'PATIENT');

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
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
              disabled={isProcessing}
              className="bg-phosphor hover:bg-phosphor/80 text-pine-deep font-bold font-mono text-xs uppercase tracking-widest px-4 py-2 rounded transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_15px_rgba(92,255,157,0.3)]"
            >
              {isProcessing ? 'Processing...' : 'Run Autonomous Adjudication'}
            </button>
          )}
        </div>

        <AgentTerminal events={events} isProcessing={isProcessing} />
      </div>

      {/* Right: Summary */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-paper p-6 rounded-lg border border-rule h-full shadow-sm flex flex-col">
          <div className="flex justify-between items-start border-b border-rule pb-4 mb-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-ink-soft">Decision Summary</h2>
            <div className="flex items-center gap-2">
              {claim.status !== 'PENDING' && (
                <button
                  type="button"
                  onClick={() => setShowSlip(true)}
                  id="export-discharge-slip"
                  className="inline-flex items-center gap-1 rounded bg-bone hover:bg-rule/40 border border-rule px-2.5 py-1 text-xs font-mono text-pine-deep transition-colors cursor-pointer"
                >
                  <Printer size={13} /> Discharge Slip
                </button>
              )}
              <StatusStamp status={isProcessing ? 'PROCESSING' : claim.status} />
            </div>
          </div>

          <div className="text-center mb-8">
            <div className="text-ink-soft text-sm mb-1">Approved Payout</div>
            <div className="font-serif text-5xl text-pine-deep tracking-tight">
              {formatCurrency(claim.approved_amount)}
            </div>
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
                  <div key={l.line} className={`p-3 rounded border text-sm ${isSuspicious(l.flag) ? 'bg-vermilion/10 text-vermilion border-vermilion/20' : 'bg-amber/10 text-amber border-amber/20'}`}>
                    <div className="flex justify-between gap-3 font-bold">
                      <span>{l.item_name} · {flagLabel(l.flag)}</span>
                      <span className="font-mono shrink-0">{formatCurrency(l.cost)}</span>
                    </div>
                    <div className="text-ink-soft mt-1">{l.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSlip && <DischargeSlipModal claim={claim} onClose={() => setShowSlip(false)} />}
    </div>
  );
}
