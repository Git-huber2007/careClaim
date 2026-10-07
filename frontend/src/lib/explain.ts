import { flaggedLines, isSuspicious, patientPayable } from './claims';
import { formatCurrency } from './format';

export type Lang = 'en' | 'hi';

/**
 * A verdict in everyday words, in English or Hindi. It is built only from the
 * flags and amounts of the saved verdict, never from the agent's own wording,
 * so it reads the same for every claim and shows nothing about a policy that
 * the viewer is not already shown.
 */

const FLAG_MEANING: Record<Lang, Record<string, string>> = {
  en: {
    NOT_COVERED: 'The policy does not pay for this.',
    DUPLICATE: 'It looks like it was billed twice.',
    OVERPRICED: 'The amount is well above the usual price.',
    UNBUNDLED: 'It is normally included in another procedure on the bill.',
    UNRELATED: 'It does not seem connected to the diagnosis.'
  },
  hi: {
    NOT_COVERED: 'यह खर्च पॉलिसी में शामिल नहीं है।',
    DUPLICATE: 'यह खर्च बिल में दो बार जोड़ा गया लगता है।',
    OVERPRICED: 'इसकी रकम सामान्य दर से काफ़ी ज़्यादा है।',
    UNBUNDLED: 'यह आम तौर पर बिल के किसी दूसरे इलाज में शामिल होता है, पर अलग से जोड़ा गया है।',
    UNRELATED: 'इसका बीमारी के निदान से संबंध नहीं दिखता।'
  }
};

const TEXT = {
  en: {
    billed: (a: string) => `The bill was ${a}.`,
    insurerPays: (a: string) => `The insurer pays ${a}.`,
    youPay: (a: string) => `You pay ${a}.`,
    patientPays: (a: string) => `The patient pays ${a}.`,
    allAccepted: 'Every charge on the bill was accepted.',
    notPaid: (n: number, a: string) => `The insurer did not pay for ${n} ${n === 1 ? 'charge' : 'charges'}, worth ${a}:`,
    copay: (a: string) => `${a} is the copay: the share of the accepted charges that the policy leaves to the patient.`,
    cap: (a: string) => `${a} is above the policy's coverage limit, so the insurer does not pay it.`,
    waived: (a: string) => `After a dispute, the hospital withdrew ${a} of charges. That amount is no longer owed.`,
    withdrawn: 'Withdrawn by the hospital.',
    askHospital: 'You can ask the hospital about the charges marked as possible billing problems. A flag means the charge is worth checking; it is not proof of a mistake.'
  },
  hi: {
    billed: (a: string) => `कुल बिल ${a} था।`,
    insurerPays: (a: string) => `बीमा कंपनी ${a} देगी।`,
    youPay: (a: string) => `आपको ${a} देना है।`,
    patientPays: (a: string) => `मरीज़ को ${a} देना है।`,
    allAccepted: 'बिल के सभी खर्च मान लिए गए।',
    notPaid: (n: number, a: string) => `बीमा कंपनी ने ${a} के ${n} खर्च नहीं दिए:`,
    copay: (a: string) => `${a} को-पे है: माने गए खर्च का वह हिस्सा जो पॉलिसी के अनुसार मरीज़ को देना होता है।`,
    cap: (a: string) => `${a} पॉलिसी की अधिकतम सीमा से ऊपर है, इसलिए बीमा कंपनी इसे नहीं देगी।`,
    waived: (a: string) => `आपत्ति के बाद अस्पताल ने ${a} का खर्च हटा दिया है। यह रकम अब नहीं देनी है।`,
    withdrawn: 'अस्पताल ने यह खर्च हटा दिया है।',
    askHospital: 'जिन खर्चों पर बिलिंग की गड़बड़ी का शक है, उनके बारे में आप अस्पताल से पूछ सकते हैं। फ़्लैग का मतलब है कि खर्च जाँचने लायक है; यह गलती का सबूत नहीं है।'
  }
};

export interface Explanation {
  /** Sentences, in reading order. */
  summary: string[];
  /** One entry per charge the insurer did not pay. */
  charges: string[];
  /** Notes that follow the list of charges. */
  notes: string[];
}

/** Null until the claim has a verdict. */
export function explainVerdict(claim: any, lang: Lang, forPatient: boolean): Explanation | null {
  const log = claim?.ai_reasoning_log;
  if (!log || claim.status === 'PENDING' || claim.status === 'PROCESSING') return null;

  const t = TEXT[lang];
  const b = log.breakdown ?? {};
  const flagged = flaggedLines(log);
  const sum = (lines: { cost: number }[]) => lines.reduce((s, l) => s + Number(l.cost), 0);

  const summary = [
    t.billed(formatCurrency(Number(claim.total_billed))),
    t.insurerPays(formatCurrency(Number(claim.approved_amount))),
    (forPatient ? t.youPay : t.patientPays)(formatCurrency(patientPayable(claim)))
  ];
  if (!flagged.length) summary.push(t.allAccepted);

  const charges = flagged.map(
    l =>
      `${l.item_name} (${formatCurrency(Number(l.cost))}): ${FLAG_MEANING[lang][l.flag] ?? FLAG_MEANING[lang].NOT_COVERED}` +
      (l.waived ? ` ${t.withdrawn}` : '')
  );

  const notes: string[] = [];
  if (Number(b.copay_amount) > 0) notes.push(t.copay(formatCurrency(Number(b.copay_amount))));
  if (Number(b.cap_reduction) > 0) notes.push(t.cap(formatCurrency(Number(b.cap_reduction))));
  if (Number(b.waived_total) > 0) notes.push(t.waived(formatCurrency(Number(b.waived_total))));
  if (forPatient && flagged.some(l => isSuspicious(l.flag) && !l.waived)) notes.push(t.askHospital);

  return {
    summary: flagged.length ? [...summary, t.notPaid(flagged.length, formatCurrency(sum(flagged)))] : summary,
    charges,
    notes
  };
}
