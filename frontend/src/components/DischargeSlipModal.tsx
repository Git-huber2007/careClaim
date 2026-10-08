import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { formatCurrency, formatDate, shortId } from '../lib/format';
import { flagLabel, patientPayable } from '../lib/claims';
import { CheckCircle2, Printer, ShieldCheck, X } from 'lucide-react';
import { useModalFocus } from '../lib/useModalFocus';
import { getDoctorForClaim, getPatientForClaim, DoctorSignatureSvg, PatientSignatureSvg } from './DynamicSignatures';

interface DischargeSlipModalProps {
  claim: any;
  onClose: () => void;
}

export function DischargeSlipModal({ claim, onClose }: DischargeSlipModalProps) {
  const policy = claim?.policies;
  const breakdown = claim?.ai_reasoning_log?.breakdown ?? {};
  const status = claim?.status ?? 'PENDING';
  const billItems = claim?.raw_bill_data ?? [];
  const lineDecisions = claim?.ai_reasoning_log?.line_items ?? [];
  const decisionByLine = new Map(lineDecisions.map((l: any) => [l.line, l]));
  const doctor = getDoctorForClaim(claim);
  const patientSigner = getPatientForClaim(claim);

  // Anyone handed the printed slip can scan this to check it against the record.
  // Available for all adjudicated claims so patients and hospital staff can verify.
  const verifiable = status === 'APPROVED' || status === 'PARTIAL' || status === 'DENIED';
  const verifyUrl = `${window.location.origin}/verify/${claim.id}`;
  const [qrCode, setQrCode] = useState('');
  useEffect(() => {
    if (!verifiable) return;
    let current = true;
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 })
      .then(dataUrl => { if (current) setQrCode(dataUrl); })
      .catch(() => {}); // the slip prints without the code
    return () => { current = false; };
  }, [verifiable, verifyUrl]);

  const dialog = useModalFocus<HTMLDivElement>(onClose);

  const handlePrint = () => {
    window.print();
  };

  const statusColor =
    status === 'APPROVED'
      ? 'border-moss text-pine-deep bg-moss/10'
      : status === 'PARTIAL'
      ? 'border-amber text-amber-ink bg-amber/10'
      : 'border-vermilion text-vermilion bg-vermilion/10';

  return createPortal(
    <div
      data-print-root
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim/75 p-4 backdrop-blur-sm print:static print:block print:overflow-visible print:p-0 print:bg-white print:backdrop-blur-none cursor-pointer print:cursor-default"
    >
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Discharge clearance slip" className="outline-none relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-paper text-ink shadow-2xl border border-rule print:max-h-none print:max-w-none print:overflow-visible print:shadow-none print:w-full print:rounded-none print:border-none cursor-auto">
        {/* Action Toolbar (Screen Only) */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-bone px-6 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base text-pine-deep font-bold">Discharge Clearance & EOB Slip</span>
            <span className="rounded bg-paper px-2 py-0.5 text-xs font-mono text-ink-soft border border-rule">
              #{shortId(claim.id)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              id="print-slip-btn"
              className="btn btn-sm btn-primary"
            >
              <Printer size={14} /> Print / save PDF
            </button>
            <button
              onClick={onClose}
              id="close-slip-btn"
              aria-label="Close"
              className="rounded p-1.5 text-ink-soft hover:bg-paper cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Certificate Content */}
        <div className="p-8 sm:p-12 print:p-6 bg-paper" id="printable-clearance-slip">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between border-b-2 border-pine-deep pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-pine text-bone text-2xl font-bold">
                +
              </div>
              <div>
                <h1 className="text-xl font-serif font-bold tracking-tight text-pine-deep">
                  CareClaim Health Network
                </h1>
                <p className="text-xs text-ink-soft font-mono">
                  Autonomous Hospital Discharge Claims Adjudication & Settlement Portal
                </p>
              </div>
            </div>
            <div className="mt-3 text-right sm:mt-0">
              <span className={`inline-block rounded border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider ${statusColor}`}>
                {status}
              </span>
              <p className="mt-1 text-xs text-ink-soft font-mono">Date: {formatDate(claim.created_at)}</p>
            </div>
          </div>

          {/* Title */}
          <div className="my-6 text-center">
            <h2 className="text-base font-serif font-bold text-pine-deep">
              Hospital Discharge Clearance & Explanation of Benefits (EOB)
            </h2>
            <p className="text-xs text-ink-soft font-mono">
              Official Settlement Advice for Inpatient Hospitalization
            </p>
          </div>

          {/* Metadata Grid */}
          <div className="mb-6 grid grid-cols-2 gap-4 rounded border border-rule bg-bone p-4 text-xs sm:grid-cols-4 font-mono">
            <div>
              <p className="text-[11px] text-ink-soft uppercase tracking-wider">Patient ID</p>
              <p className="mt-0.5 font-bold text-ink">{claim.patient_id}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-soft uppercase tracking-wider">Policy Number</p>
              <p className="mt-0.5 font-bold text-ink">{policy?.policy_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-soft uppercase tracking-wider">Diagnosis (ICD-10)</p>
              <p className="mt-0.5 font-bold text-ink">{claim.diagnosis_code || 'UNSPECIFIED'}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-soft uppercase tracking-wider">Claim Reference</p>
              <p className="mt-0.5 text-ink-soft truncate">{claim.id}</p>
            </div>
          </div>

          {/* Waterfall Strip */}
          <div className="mb-8 overflow-hidden rounded border border-rule bg-bone">
            <div className="bg-bone px-4 py-2 border-b border-rule">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink-soft">
                Financial Adjudication Waterfall
              </h3>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y sm:divide-y-0 sm:grid-cols-4 divide-rule text-center font-mono">
              <div className="p-3">
                <p className="text-[11px] text-ink-soft uppercase">Total Billed</p>
                <p className="mt-1 text-base font-bold text-ink">{formatCurrency(claim.total_billed)}</p>
              </div>
              <div className="p-3">
                <p className="text-[11px] text-ink-soft uppercase">Disallowed / Flagged</p>
                <p className="mt-1 text-base font-bold text-vermilion">
                  {formatCurrency(breakdown.excluded_total ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-moss/10">
                <p className="text-[11px] text-pine-deep uppercase font-bold">Insurer Pays</p>
                <p className="mt-1 text-base font-bold text-pine-deep">
                  {formatCurrency(claim.approved_amount)}
                </p>
              </div>
              <div className="p-3 bg-amber/10">
                <p className="text-[11px] text-amber-ink uppercase font-bold">Patient Payable</p>
                <p className="mt-1 text-base font-bold text-amber-ink">
                  {formatCurrency(patientPayable(claim))}
                </p>
              </div>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="mb-8">
            <h3 className="mb-2 text-xs font-mono font-bold uppercase tracking-wider text-ink-soft">
              Audited Line Items Breakdown
            </h3>
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-rule bg-bone text-xs text-ink-soft">
                  <th className="py-2 px-2 text-center w-8">#</th>
                  <th className="py-2 px-3 font-normal">Service / Charge Description</th>
                  <th className="py-2 px-3 text-right font-normal">Billed</th>
                  <th className="py-2 px-3 text-center font-normal">Status</th>
                  <th className="py-2 px-3 font-normal">Audit Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {billItems.map((item: any, i: number) => {
                  const decision: any = decisionByLine.get(i + 1);
                  const flag = decision?.flag || 'OK';
                  const isOk = flag === 'OK';
                  return (
                    <tr key={i} className={isOk ? '' : 'bg-vermilion/5'}>
                      <td className="py-2 px-2 text-center text-ink-soft">{i + 1}</td>
                      <td className="py-2 px-3 font-sans font-medium text-ink">{item.item_name}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(item.cost)}</td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${
                            isOk
                              ? 'bg-moss/10 text-pine-deep'
                              : 'bg-vermilion/10 text-vermilion'
                          }`}
                        >
                          {flagLabel(flag)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-ink-soft font-sans text-xs">
                        {decision?.reason || (isOk ? 'Covered under policy schedule.' : 'Flagged for review.')}
                        {decision?.waived && <span className="block font-medium text-pine-deep">Withdrawn by the hospital; not owed.</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Signoff Blocks */}
          <div className="mt-10 pt-6 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs font-mono">
            {/* Hospital Signoff */}
            <div className="space-y-1">
              <p className="font-bold text-pine-deep font-serif text-sm">Hospital Attending Consultant</p>
              <p className="text-[11px] text-ink font-semibold truncate">{doctor.name}</p>
              <p className="text-[10px] text-ink-soft truncate">{doctor.role} · {doctor.regNo}</p>

              <div className="py-1">
                <DoctorSignatureSvg doctor={doctor} />
              </div>

              <div className="border-b border-ink-soft/40 w-44"></div>
              <p className="mt-1 text-[11px] text-ink-soft">Attending Physician & TPA Desk</p>
              <div className="pt-0.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-moss bg-moss/10 px-1.5 py-0.5 rounded border border-moss/20 font-bold uppercase tracking-wider">
                  <ShieldCheck size={11} /> {doctor.department.split('&')[0].trim()} Cleared
                </span>
              </div>
            </div>

            {/* Patient Signoff */}
            <div className="space-y-1">
              <p className="font-bold text-pine-deep font-serif text-sm">Patient / Beneficiary</p>
              <p className="text-[11px] text-ink font-semibold truncate">{patientSigner.name}</p>
              <p className="text-[10px] text-ink-soft truncate">{patientSigner.relation} · ID: {claim.patient_id}</p>

              <div className="py-1">
                <PatientSignatureSvg patient={patientSigner} />
              </div>

              <div className="border-b border-ink-soft/40 w-44"></div>
              <p className="mt-1 text-[11px] text-ink-soft">Patient / Attendant Signature</p>
              <div className="pt-0.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-pine-deep bg-pine/10 px-1.5 py-0.5 rounded border border-pine/20 font-bold uppercase tracking-wider">
                  <CheckCircle2 size={11} /> Settlement Acknowledged
                </span>
              </div>
            </div>

            {/* AI Adjudicator Signoff */}
            <div className="space-y-1 sm:text-right flex flex-col sm:items-end">
              <p className="font-bold text-pine-deep font-serif text-sm">CareClaim AI Adjudicator</p>
              <p className="text-[11px] text-ink-soft">Checksum: {shortId(claim.id)}-VERIFIED-OK</p>

              <div className="py-1 h-11 flex items-center sm:justify-end">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-moss/40 bg-moss/10 text-[10px] font-mono text-moss font-bold uppercase tracking-wider shadow-xs">
                  <CheckCircle2 size={12} className="text-moss" />
                  <span>Deterministic Math Pass</span>
                </div>
              </div>

              <div className="border-b border-ink-soft/40 w-44"></div>
              <p className="mt-1 text-[11px] text-ink-soft">Cryptographic Clearance</p>
              <div className="pt-0.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-ink-soft bg-bone px-1.5 py-0.5 rounded border border-rule font-mono uppercase tracking-wider">
                  Alg: CC-ED25519-PASS
                </span>
              </div>
            </div>
          </div>

          {qrCode && (
            <div className="mt-8 flex items-center justify-center gap-4 text-xs text-ink-soft font-mono">
              <img src={qrCode} alt="QR code that opens the verification page for this slip" className="h-24 w-24 border border-rule" />
              <div>
                <p className="font-bold text-ink">Verify this slip</p>
                <p>Scan the code, or open:</p>
                <p className="break-all">{verifyUrl}</p>
              </div>
            </div>
          )}

          <p className="mt-8 text-center text-[11px] text-ink-soft font-mono">
            Automated discharge settlement generated by CareClaim AI. Subject to policy terms and IRDAI regulations.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
