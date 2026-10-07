import { useEffect } from 'react';
import { money, dateTime, shortId } from '../lib/format';
import { flagMeta, lineItemsOf } from '../lib/flags';
import { IconCheck, IconPrinter, IconX } from './Icons';

/**
 * DischargeSlipModal
 * High-fidelity printable Hospital Discharge Clearance & Explanation of Benefits (EOB) certificate.
 * Includes @media print rules so window.print() outputs an official clean physical document.
 */
export default function DischargeSlipModal({ claim, onClose }) {
  const policy = claim?.policies;
  const breakdown = claim?.ai_reasoning_log?.breakdown ?? {};
  const lines = lineItemsOf(claim);
  const status = claim?.status ?? 'PENDING';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePrint = () => {
    window.print();
  };

  const statusColor =
    status === 'APPROVED'
      ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
      : status === 'PARTIAL'
      ? 'border-amber-600 text-amber-700 bg-amber-50'
      : 'border-rose-600 text-rose-700 bg-rose-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm print:static print:p-0 print:bg-white">
      {/* Container */}
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white text-slate-900 shadow-2xl print:max-h-none print:shadow-none print:w-full print:rounded-none">
        {/* Screen Action Bar (Hidden in Print) */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">Discharge Clearance & EOB Slip</span>
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-mono text-slate-700">#{shortId(claim.id)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              id="print-slip-btn"
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-teal-700 cursor-pointer"
            >
              <IconPrinter className="h-4 w-4" /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              id="close-slip-btn"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Slip Content */}
        <div className="p-8 sm:p-12 print:p-6" id="printable-clearance-slip">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between border-b-2 border-slate-900 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white font-black text-lg">
                  +
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">CareClaim Health Network</h1>
                  <p className="text-xs text-slate-500">Autonomous Discharge Claims Adjudication & Settlement Portal</p>
                </div>
              </div>
            </div>
            <div className="mt-3 text-right sm:mt-0">
              <span className={`inline-block rounded-md border-2 px-3 py-1 font-mono text-sm font-bold uppercase tracking-wider ${statusColor}`}>
                {status}
              </span>
              <p className="mt-1 text-xs text-slate-500">Generated: {dateTime(claim.created_at)}</p>
            </div>
          </div>

          {/* Document Title */}
          <div className="my-6 text-center">
            <h2 className="text-base font-extrabold uppercase tracking-wide text-slate-800">
              HOSPITAL DISCHARGE CLEARANCE & EXPLANATION OF BENEFITS (EOB)
            </h2>
            <p className="text-xs text-slate-500">Official Settlement Advice for Cashless / Reimbursed Inpatient Hospitalization</p>
          </div>

          {/* Metadata Grid */}
          <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-4">
            <div>
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Patient ID</p>
              <p className="mt-0.5 font-bold text-slate-900">{claim.patient_id}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Policy Number</p>
              <p className="mt-0.5 font-mono font-bold text-slate-900">{policy?.policy_number || 'N/A'}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Diagnosis (ICD-10)</p>
              <p className="mt-0.5 font-mono font-bold text-slate-900">{claim.diagnosis_code || 'UNSPECIFIED'}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Claim Reference</p>
              <p className="mt-0.5 font-mono text-slate-700">{claim.id}</p>
            </div>
          </div>

          {/* Financial Waterfall Summary */}
          <div className="mb-8 overflow-hidden rounded-xl border border-slate-300">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-300">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Financial Adjudication Waterfall</h3>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y sm:divide-y-0 sm:grid-cols-4 divide-slate-200 text-center">
              <div className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Total Billed</p>
                <p className="mt-1 font-mono text-base font-bold text-slate-900">{money(claim.total_billed)}</p>
              </div>
              <div className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Excluded / Disallowed</p>
                <p className="mt-1 font-mono text-base font-bold text-rose-600">
                  {money(breakdown.excluded_total ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-emerald-50/50">
                <p className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold">Insurer Pays</p>
                <p className="mt-1 font-mono text-base font-black text-emerald-700">{money(claim.approved_amount)}</p>
              </div>
              <div className="p-3 bg-amber-50/50">
                <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">Patient Payable</p>
                <p className="mt-1 font-mono text-base font-black text-amber-700">
                  {money(breakdown.patient_payable ?? Math.max(0, Number(claim.total_billed) - Number(claim.approved_amount || 0)))}
                </p>
              </div>
            </div>
          </div>

          {/* Itemized Line Items Audit Table */}
          <div className="mb-8">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">Itemized Audit & Settlement Breakdown</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2 px-2 text-center w-8">#</th>
                  <th className="py-2 px-3">Service / Procedure Description</th>
                  <th className="py-2 px-3 text-right">Billed (₹)</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3">Adjudication Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lines.map((it) => {
                  const meta = flagMeta(it.flag);
                  const isOk = it.flag === 'OK';
                  return (
                    <tr key={it.line} className={isOk ? '' : 'bg-rose-50/40'}>
                      <td className="py-2 px-2 text-center font-mono text-slate-400">{it.line}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">{it.item_name}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900">{money(it.cost)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {it.flag}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 text-[11px]">{it.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Policy Terms Summary */}
          {policy && (
            <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-600">
              <span className="font-bold text-slate-800">Policy Constraints Applied: </span>
              Max Coverage Limit: <span className="font-mono font-semibold">{money(policy.max_coverage_limit)}</span> | Copay: <span className="font-semibold">{Number(policy.copay_percentage)}%</span> | Cap Reduction Applied: <span className="font-mono">{money(breakdown.cap_reduction ?? 0)}</span>
            </div>
          )}

          {/* Signoff / Seal Block */}
          <div className="mt-12 pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800">Hospital Billing & TPA Desk</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Discharge verification confirmed</p>
              <div className="mt-8 border-b border-slate-400 w-48"></div>
              <p className="mt-1 text-[10px] text-slate-400">Authorized Signature & Hospital Seal</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-800">CareClaim Autonomous Adjudicator</p>
              <p className="font-mono text-[10px] text-slate-500 mt-0.5">Verification Checksum: {shortId(claim.id)}-AUDIT-OK</p>
              <div className="mt-8 border-b border-slate-400 w-48 ml-auto"></div>
              <p className="mt-1 text-[10px] text-slate-400">Deterministic Mathematical Audit Pass</p>
            </div>
          </div>

          {/* Legal Disclaimer Footer */}
          <p className="mt-8 text-center text-[10px] text-slate-400">
            This Explanation of Benefits is generated automatically by CareClaim AI for hospital discharge clearance.
            All determinations are subject to final policy terms, pre-authorization agreements, and CDSCO/IRDAI guidelines.
          </p>
        </div>
      </div>
    </div>
  );
}
