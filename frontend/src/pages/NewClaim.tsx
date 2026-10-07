import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { fetchApi, extractBill } from '../lib/api';
import { useAccount } from '../lib/account';
import { toBillLine } from '../lib/claims';
import { formatCurrency } from '../lib/format';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

// The file travels as base64 inside JSON (a third larger), and the API accepts 15 MB.
const MAX_UPLOAD_MB = 10;

interface BillRow {
  item_name: string;
  cost: number;
  quantity: number;
}

const BLANK_ROW: BillRow = { item_name: '', cost: 0, quantity: 1 };

/** For a hospital: the one policy with this number, or null. The backend answers for that number only. */
const lookUpPolicy = (number: string) =>
  fetchApi(`/api/policies?policy_number=${encodeURIComponent(number)}`).then(res => res.policies[0] ?? null);

export function NewClaim() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profile = useAccount();
  // A patient checks their own bill: the backend fixes the patient ID and only accepts their own policy.
  const isPatient = profile.role === 'PATIENT';
  const [patientId, setPatientId] = useState(isPatient ? profile.patient_id ?? '' : '');
  const [policyNumber, setPolicyNumber] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState<BillRow[]>([BLANK_ROW]);
  // A patient's own policies, or for a hospital the answer to its latest lookup.
  const [policies, setPolicies] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // A patient is given the policy they hold.
  useEffect(() => {
    if (!isPatient) return;
    fetchApi('/api/policies')
      .then(res => {
        setPolicies(res.policies);
        if (res.policies.length) setPolicyNumber(res.policies[0].policy_number);
      })
      .catch(err => toast.error(err.message));
  }, [isPatient]);

  // A hospital looks the policy up by the number on the patient's card; the
  // backend answers for that one number only.
  useEffect(() => {
    if (isPatient) return;
    const number = policyNumber.trim();
    let stale = false;
    const timer = setTimeout(() => {
      (number ? lookUpPolicy(number) : Promise.resolve(null))
        .catch(() => null) // the preview stays empty; submitting looks again and reports the failure
        .then(found => { if (!stale) setPolicies(found ? [found] : []); });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [isPatient, policyNumber]);

  // Matched against what is typed now, so an answer for an earlier number is never used.
  const policyData = policies.find(p => p.policy_number.toLowerCase() === policyNumber.trim().toLowerCase()) ?? null;

  const billLines = items.map(toBillLine);
  const totalBilled = Math.round(billLines.reduce((sum, line) => sum + line.cost, 0) * 100) / 100;

  const updateItem = (idx: number, change: Partial<BillRow>) =>
    setItems(rows => rows.map((row, i) => (i === idx ? { ...row, ...change } : row)));

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PDF document or image (PNG, JPG, WebP).');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`That file is too large. Upload a document under ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setExtracting(true);
    const toastId = toast.loading('Extracting bill lines with Gemini Vision...');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const data = await extractBill(base64, file.type);
      if (data.items?.length) {
        setItems(data.items.map((it: any) => ({ item_name: it.item_name, cost: it.cost, quantity: 1 })));
      }
      if (data.diagnosis_code) setDiagnosis(data.diagnosis_code);
      // A patient's ID and policy are fixed by their account, not by what a document says.
      if (!isPatient && data.patient_id) setPatientId(data.patient_id);
      if (!isPatient && data.policy_number) setPolicyNumber(data.policy_number);
      toast.success(`Extracted ${data.items?.length || 0} items (${formatCurrency(data.total_billed)}) via Gemini Vision`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Failed to extract bill items', { id: toastId });
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some(row => !row.item_name.trim() || !(row.cost > 0))) {
      toast.error('Give every bill line a name and an amount, or remove it.');
      return;
    }
    setSubmitting(true);
    try {
      // The preview's lookup is debounced and fails quietly, so it may not have
      // an answer yet for a number that exists: ask again before saying it does not.
      const policy = policyData ?? (isPatient ? null : await lookUpPolicy(policyNumber.trim()));
      if (!policy) {
        toast.error('No policy found with that number');
        return;
      }
      // The backend takes the policy's id (not its number) and { item_name, cost } bill lines.
      const { claim } = await fetchApi('/api/claims', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: patientId.trim(),
          policy_id: policy.id,
          diagnosis_code: diagnosis.trim(),
          raw_bill_data: billLines,
          total_billed: totalBilled
        })
      });
      toast.success(isPatient ? 'Bill saved' : 'Claim submitted successfully');
      navigate(`/claims/${claim.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Scenarios use the mock policies seeded by supabase/schema.sql.
  const loadScenario = (scenario: number) => {
    if (scenario === 1) {
      setPolicyNumber('HDFC-118-SILVER');
      setPatientId('PAT-1002');
      setDiagnosis('J18.9');
      setItems([
        { item_name: 'Room Charges (4 days)', cost: 28000, quantity: 1 },
        { item_name: 'Pulmonology Consultation', cost: 6500, quantity: 1 },
        { item_name: 'Chest X-Ray Digital', cost: 2800, quantity: 1 },
        { item_name: 'IV Antibiotics & Nebulization', cost: 32000, quantity: 1 }
      ]);
    } else if (scenario === 2) {
      setPolicyNumber('STAR-402-GOLD');
      setPatientId('PAT-1001');
      setDiagnosis('K35.80');
      setItems([
        { item_name: 'Laparoscopic Appendectomy', cost: 85000, quantity: 1 },
        { item_name: 'Anesthesia', cost: 18000, quantity: 1 },
        { item_name: 'Cosmetic Scar Revision Surgery', cost: 32000, quantity: 1 }
      ]);
    } else if (scenario === 3) {
      setPolicyNumber('STAR-402-GOLD');
      setPatientId('PAT-1001');
      setDiagnosis('K35.80');
      setItems([
        { item_name: 'Laparoscopic Appendectomy', cost: 85000, quantity: 1 },
        { item_name: 'Anesthesia', cost: 18000, quantity: 1 },
        { item_name: 'Anesthesia', cost: 18000, quantity: 1 }, // duplicate
        { item_name: 'Abdominal X-Ray', cost: 45000, quantity: 1 } // overcharge
      ]);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-end border-b border-rule pb-4">
        <div>
          <h1 className="text-3xl font-serif text-pine-deep">{isPatient ? 'Check a Bill' : 'New Claim Intake'}</h1>
          {isPatient && (
            <p className="text-sm text-ink-soft mt-1">Enter or scan a hospital bill to see what your policy pays and which charges are worth questioning.</p>
          )}
        </div>
        {!isPatient && (
          <select
            aria-label="Load a sample scenario"
            onChange={e => loadScenario(Number(e.target.value))}
            className="bg-bone border border-rule rounded px-3 py-1.5 text-sm font-mono focus:outline-none"
          >
            <option value="0">Load Sample Scenario...</option>
            <option value="1">1. Clean Approval</option>
            <option value="2">2. Partial (Cosmetic)</option>
            <option value="3">3. Fraud/Overcharge</option>
          </select>
        )}
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-paper p-6 rounded-lg border border-rule space-y-4">
            <h2 className="font-mono text-sm uppercase tracking-wider text-pine-deep border-b border-rule pb-2">Patient Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="claim-patient-id" className="block text-xs font-mono uppercase text-ink-soft mb-1">Patient ID</label>
                <input id="claim-patient-id" required readOnly={isPatient} value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="PAT-1001" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="claim-policy-number" className="block text-xs font-mono uppercase text-ink-soft mb-1">Policy Number</label>
                <input id="claim-policy-number" required value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} placeholder="STAR-402-GOLD" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label htmlFor="claim-diagnosis" className="block text-xs font-mono uppercase text-ink-soft mb-1">Diagnosis Code</label>
              <input id="claim-diagnosis" required value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="ICD-10, e.g. K35.80" className="w-full bg-bone border border-rule rounded px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Document Ingestion Zone */}
          <div className="bg-paper p-4 rounded-lg border border-rule space-y-2">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-pine-deep font-bold flex items-center gap-1.5">
                  <Upload size={14} /> Scan Bill Document (PDF or Photo)
                </span>
                <p className="text-[11px] text-ink-soft font-mono mt-0.5">
                  Gemini Vision automatically extracts line items, costs & diagnosis code.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  // Cleared so that choosing the same file again (a retry) still fires onChange.
                  e.target.value = '';
                  if (f) handleFileUpload(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
                className="bg-bone hover:bg-rule/40 border border-rule text-pine-deep px-3 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Upload size={13} /> {extracting ? 'Extracting…' : 'Upload Document'}
              </button>
            </div>
          </div>

          <div className="bg-paper p-6 rounded-lg border border-rule space-y-4">
            <div className="flex justify-between items-end border-b border-rule pb-2">
              <h2 className="font-mono text-sm uppercase tracking-wider text-pine-deep">Itemized Bill</h2>
              <div className="font-mono font-bold text-lg text-pine-deep">Total: {formatCurrency(totalBilled)}</div>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={item.item_name}
                    onChange={e => updateItem(idx, { item_name: e.target.value })}
                    aria-label={`Line ${idx + 1} item name`}
                    className="flex-1 bg-bone border border-rule rounded px-3 py-2 text-sm" placeholder="Item Name"
                  />
                  <input
                    type="number" value={item.cost}
                    onChange={e => updateItem(idx, { cost: Number(e.target.value) })}
                    aria-label={`Line ${idx + 1} cost in rupees`}
                    className="w-32 bg-bone border border-rule rounded px-3 py-2 text-sm font-mono text-right" placeholder="Cost"
                  />
                  <input
                    type="number" value={item.quantity} min={1}
                    onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                    aria-label={`Line ${idx + 1} quantity`}
                    className="w-16 bg-bone border border-rule rounded px-2 py-2 text-sm font-mono text-center" placeholder="Qty"
                  />
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label={`Remove line ${idx + 1}`} className="text-vermilion px-2 hover:bg-vermilion/10 rounded">×</button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems([...items, BLANK_ROW])}
              className="text-sm text-pine font-medium hover:underline"
            >
              + Add Line Item
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <button
            type="submit"
            disabled={submitting || items.length === 0}
            className="w-full bg-pine hover:bg-pine-deep text-bone rounded px-4 py-3 font-medium transition-colors disabled:opacity-50 text-lg shadow-md"
          >
            {submitting ? 'Submitting...' : isPatient ? 'Save and Check Bill' : 'Submit Claim'}
          </button>

          {policyData ? (
            <div className="bg-paper p-5 rounded-lg border-t-4 border-t-moss border border-rule shadow-sm">
              <div className="text-xs font-mono uppercase tracking-wider text-moss mb-3">{isPatient ? 'Your Policy' : 'Policy Match Found'}</div>
              <div className="font-serif text-xl text-pine-deep mb-4">{policyData.policy_number}</div>
              <div className="space-y-2 font-mono text-sm border-t border-rule pt-3">
                <div className="flex justify-between">
                  <span className="text-ink-soft">Coverage Limit</span>
                  <span className="font-bold">{formatCurrency(policyData.max_coverage_limit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Copay</span>
                  <span className="font-bold">{policyData.copay_percentage}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-bone p-5 rounded-lg border border-rule border-dashed text-center text-ink-soft text-sm">
              {isPatient ? 'No policy is linked to your account.' : 'Enter the policy number from the patient’s card to preview coverage.'}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
