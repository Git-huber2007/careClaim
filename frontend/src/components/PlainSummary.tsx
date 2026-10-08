import { useState } from 'react';
import { LANGUAGES, explainVerdict } from '../lib/explain';
import type { Lang } from '../lib/explain';

const KEY = 'careclaim-language';

/** The language picked last time, on any claim; English until one is picked. */
function rememberedLanguage(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    return LANGUAGES.find(l => l.id === stored)?.id ?? 'en';
  } catch {
    return 'en';
  }
}

/** The verdict in everyday words, in the reader's language. Renders nothing until there is a verdict. */
export function PlainSummary({ claim, forPatient }: { claim: any; forPatient: boolean }) {
  const [lang, setLang] = useState<Lang>(rememberedLanguage);
  const explanation = explainVerdict(claim, lang, forPatient);
  if (!explanation) return null;

  const choose = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembered for next time; the summary still changes now.
    }
  };

  return (
    <section aria-label="The decision in simple words" className="bg-bone border border-rule rounded-lg p-4 text-sm space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-soft">In simple words</h3>
        <select
          aria-label="Language of this summary"
          value={lang}
          onChange={e => choose(e.target.value as Lang)}
          className="rounded border border-rule bg-paper px-2 py-1 text-xs cursor-pointer"
        >
          {LANGUAGES.map(l => (
            <option key={l.id} value={l.id} lang={l.id}>{l.label}</option>
          ))}
        </select>
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
