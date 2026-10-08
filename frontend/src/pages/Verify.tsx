import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageTitle } from '../components/PageTitle';
import { API_BASE, errorMessage } from '../lib/api';
import { formatCurrency, formatDate, shortId } from '../lib/format';
import { StatusStamp } from '../components/StatusStamp';

interface Verification {
  reference: string;
  status: 'APPROVED' | 'PARTIAL' | 'DENIED';
  hospital: string | null;
  total_billed: number;
  approved_amount: number;
  patient_payable: number;
  processed_at: string | null;
}

/**
 * Where the QR code on a discharge slip leads. Open to anyone holding the
 * slip, so it confirms the slip's reference and amounts and shows nothing else.
 */
export function Verify() {
  const { id = '' } = useParams();
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    fetch(`${API_BASE}/api/verify/${encodeURIComponent(id)}`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 400 ? 'This is not a valid slip reference.' : errorMessage(body, res.status));
        if (current) setResult(body.verification);
      })
      .catch(err => { if (current) setError(err.message === 'Failed to fetch' ? 'The verification service cannot be reached right now.' : err.message); });
    return () => { current = false; };
  }, [id]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <PageTitle>Verify a discharge slip</PageTitle>
      <div className="w-full max-w-md bg-paper rounded-lg border border-rule p-8 space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-2xl text-pine-deep">
            CareClaim <span className="theme-fixed text-bone bg-pine px-1.5 py-0.5 rounded text-sm font-mono align-middle font-bold">AI</span>
          </h1>
          <div className="text-xs font-mono uppercase tracking-widest text-ink-soft mt-1">Discharge slip verification</div>
        </div>

        {error ? (
          <div className="text-center space-y-2">
            <div className="font-serif text-xl text-vermilion">Not verified</div>
            <p className="text-sm text-ink-soft">{error}</p>
          </div>
        ) : !result ? (
          <div className="text-center font-mono text-sm text-ink-soft">Checking…</div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <div className="font-serif text-xl text-moss">This slip matches our records</div>
              <StatusStamp status={result.status} />
            </div>
            <dl className="font-mono text-sm divide-y divide-rule border-y border-rule">
              {[
                ['Reference', `#${shortId(result.reference)}`],
                ['Clearance code', `CC-${shortId(result.reference).toUpperCase()}`],
                ...(result.hospital ? [['Hospital', result.hospital]] : []),
                ['Total billed', formatCurrency(result.total_billed)],
                ['Insurer pays', formatCurrency(result.approved_amount)],
                ['Patient pays', formatCurrency(result.patient_payable)],
                ['Decided on', formatDate(result.processed_at ?? undefined)]
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-soft">{label}</dt>
                  <dd className="font-bold text-right">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink-soft text-center">
              Compare these amounts with the printed slip. If they differ, the slip has been altered.
            </p>
          </>
        )}

        <div className="text-center">
          <Link to="/login" className="text-sm text-pine hover:underline">Go to CareClaim</Link>
        </div>
      </div>
    </div>
  );
}
