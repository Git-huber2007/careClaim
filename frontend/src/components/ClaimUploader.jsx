import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { money, parseBill } from '../lib/format';
import { SAMPLE_BILLS } from '../lib/sampleBills';
import { IconBolt, IconFile, IconSparkle, Spinner } from './Icons';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ClaimUploader() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ patient_id: '', policy_id: '', diagnosis_code: '', itemized_bill: '' });
  const [policies, setPolicies] = useState([]);
  const [policiesError, setPoliciesError] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listPolicies().then(setPolicies).catch((e) => setPoliciesError(e.message));
  }, []);

  const parsed = useMemo(() => parseBill(form.itemized_bill), [form.itemized_bill]);
  const total = useMemo(() => Math.round(parsed.items.reduce((s, i) => s + i.cost, 0) * 100) / 100, [parsed]);
  const selectedPolicy = policies.find((p) => p.id === form.policy_id);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  function onPolicyChange(e) {
    const id = e.target.value;
    const p = policies.find((x) => x.id === id);
    setForm((f) => ({ ...f, policy_id: id, patient_id: f.patient_id || p?.patient_id || '' }));
    setErrors((er) => ({ ...er, policy_id: undefined }));
  }

  function loadSample(s) {
    setForm({
      patient_id: s.patient_id,
      policy_id: s.policy_id,
      diagnosis_code: s.diagnosis_code,
      itemized_bill: JSON.stringify(s.items, null, 2),
    });
    setErrors({});
    setSubmitError('');
  }

  function validate() {
    const e = {};
    if (!form.patient_id.trim()) e.patient_id = 'Patient ID is required';
    if (!form.policy_id.trim()) e.policy_id = 'Policy is required';
    else if (!UUID_RE.test(form.policy_id.trim())) e.policy_id = 'Policy ID must be a valid UUID';
    if (!form.diagnosis_code.trim()) e.diagnosis_code = 'Diagnosis code is required';
    if (parsed.error) e.itemized_bill = parsed.error;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const claim = await api.createClaim({
        patient_id: form.patient_id.trim(),
        policy_id: form.policy_id.trim(),
        diagnosis_code: form.diagnosis_code.trim().toUpperCase(),
        raw_bill_data: parsed.items,
        total_billed: total,
      });
      navigate(`/claims/${claim.id}`);
    } catch (err) {
      if (err.details?.length) {
        const fieldErrs = {};
        err.details.forEach((d) => {
          const key = d.path.startsWith('raw_bill_data') || d.path === 'total_billed' ? 'itemized_bill' : d.path;
          fieldErrs[key] = d.message;
        });
        setErrors(fieldErrs);
      }
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <form onSubmit={handleSubmit} className="glass space-y-6 p-6 md:p-8" noValidate id="claim-form">
        {/* Samples */}
        <div>
          <p className="label flex items-center gap-1.5"><IconSparkle className="h-3.5 w-3.5" /> Quick-load demo scenario</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SAMPLE_BILLS.map((s, i) => (
              <button
                key={s.label}
                id={`sample-${i}`}
                type="button"
                onClick={() => loadSample(s)}
                className="group rounded-xl border border-white/[0.06] bg-ink-950/40 px-3.5 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand-400/30 hover:bg-brand-400/[0.04] cursor-pointer"
              >
                <p className="text-sm font-semibold text-ink-200 group-hover:text-white">{s.label}</p>
                <p className="text-xs text-ink-400">{s.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-white/5" />

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="policy_id" className="label">Policy *</label>
            {policies.length > 0 ? (
              <select id="policy_id" className={`input ${errors.policy_id ? 'input-error' : ''}`} value={form.policy_id} onChange={onPolicyChange}>
                <option value="">Select a policy…</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_number} — {p.patient_id}</option>
                ))}
              </select>
            ) : (
              <input id="policy_id" className={`input font-mono ${errors.policy_id ? 'input-error' : ''}`} placeholder="Policy UUID" value={form.policy_id} onChange={set('policy_id')} />
            )}
            {errors.policy_id && <p className="mt-1.5 text-xs text-rose-300">{errors.policy_id}</p>}
            {policiesError && <p className="mt-1.5 text-xs text-amber-300">Could not load policies: {policiesError}</p>}
          </div>

          <div>
            <label htmlFor="patient_id" className="label">Patient ID *</label>
            <input id="patient_id" className={`input ${errors.patient_id ? 'input-error' : ''}`} placeholder="PAT-1001" value={form.patient_id} onChange={set('patient_id')} />
            {errors.patient_id && <p className="mt-1.5 text-xs text-rose-300">{errors.patient_id}</p>}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="diagnosis_code" className="label">Diagnosis Code (ICD-10) *</label>
            <input id="diagnosis_code" className={`input font-mono uppercase ${errors.diagnosis_code ? 'input-error' : ''}`} placeholder="K35.80" value={form.diagnosis_code} onChange={set('diagnosis_code')} />
            {errors.diagnosis_code && <p className="mt-1.5 text-xs text-rose-300">{errors.diagnosis_code}</p>}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between">
            <label htmlFor="itemized_bill" className="label">Itemized Bill *</label>
            <span className="mb-1.5 text-[11px] text-ink-400">JSON array or one “Item, cost” per line</span>
          </div>
          <textarea
            id="itemized_bill"
            rows={12}
            spellCheck={false}
            className={`input resize-y font-mono text-[13px] leading-relaxed ${errors.itemized_bill ? 'input-error' : ''}`}
            placeholder={'[\n  { "item_name": "Room Charges (3 days)", "cost": 1800 },\n  { "item_name": "Appendectomy", "cost": 8500 }\n]\n\n— or —\n\nRoom Charges (3 days), 1800\nAppendectomy, 8500'}
            value={form.itemized_bill}
            onChange={set('itemized_bill')}
          />
          {errors.itemized_bill && <p className="mt-1.5 text-xs text-rose-300">{errors.itemized_bill}</p>}
        </div>

        {submitError && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/20">{submitError}</p>}

        <div className="flex justify-end">
          <button id="submit-claim" type="submit" className="btn-primary px-6 py-3" disabled={submitting}>
            {submitting ? <Spinner /> : <IconBolt className="h-4 w-4" />}
            Submit claim to agent
          </button>
        </div>
      </form>

      {/* Live preview */}
      <aside className="glass h-fit p-6 xl:sticky xl:top-10">
        <p className="label flex items-center gap-1.5"><IconFile className="h-3.5 w-3.5" /> Parsed bill preview</p>
        {parsed.items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-400">
            Line items will appear here as you type.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {parsed.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>
                  <span className="truncate text-ink-200">{it.item_name}</span>
                </span>
                <span className="tabular-nums text-white">{money(it.cost)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-950/60 px-4 py-3 ring-1 ring-white/5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Total billed</span>
          <span className="text-lg font-bold tabular-nums text-white">{money(total)}</span>
        </div>

        {selectedPolicy && (
          <div className="mt-4 space-y-2 rounded-xl border border-white/5 p-4 text-xs">
            <p className="font-semibold text-ink-200">{selectedPolicy.policy_number}</p>
            <div className="flex justify-between text-ink-400"><span>Max coverage</span><span className="text-ink-200">{money(selectedPolicy.max_coverage_limit)}</span></div>
            <div className="flex justify-between text-ink-400"><span>Copay</span><span className="text-ink-200">{Number(selectedPolicy.copay_percentage)}%</span></div>
            <div className="flex flex-wrap gap-1 pt-1">
              {selectedPolicy.excluded_treatments.slice(0, 6).map((t) => (
                <span key={t} className="rounded-md bg-rose-400/10 px-1.5 py-0.5 text-[10px] text-rose-300">✕ {t}</span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
