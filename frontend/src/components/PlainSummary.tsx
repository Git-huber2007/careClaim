import { useState } from 'react';
import { explainVerdict } from '../lib/explain';
import type { Lang } from '../lib/explain';

const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' }
];

/** The verdict in everyday words, in English or Hindi. Renders nothing until there is a verdict. */
export function PlainSummary({ claim, forPatient }: { claim: any; forPatient: boolean }) {
  const [lang, setLang] = useState<Lang>('en');
  const explanation = explainVerdict(claim, lang, forPatient);
  if (!explanation) return null;

  return (
    <section aria-label="The decision in simple words" className="bg-bone border border-rule rounded-lg p-4 text-sm space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-ink-soft">In simple words</h3>
        <div className="flex rounded border border-rule overflow-hidden text-xs">
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              type="button"
              aria-pressed={lang === l.id}
              onClick={() => setLang(l.id)}
              className={`px-2.5 py-1 transition-colors ${lang === l.id ? 'bg-pine text-bone' : 'bg-paper text-ink-soft hover:bg-rule/40'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div lang={lang} className="space-y-2 leading-relaxed">
        <p>{explanation.summary.join(' ')}</p>
        {explanation.charges.length > 0 && (
          <ul className="list-disc pl-5 space-y-1">
            {explanation.charges.map((charge, i) => (
              <li key={i}>{charge}</li>
            ))}
          </ul>
        )}
        {explanation.notes.map((note, i) => (
          <p key={i} className="text-ink-soft">{note}</p>
        ))}
      </div>
    </section>
  );
}
