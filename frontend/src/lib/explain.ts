import { flaggedLines, isSuspicious, patientPayable } from './claims';
import { formatCurrency } from './format';

/** The languages the plain-words summary is written in, each under its own name. */
export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
  { id: 'kn', label: 'ಕನ್ನಡ' },
  { id: 'ta', label: 'தமிழ்' },
  { id: 'te', label: 'తెలుగు' },
  { id: 'mr', label: 'मराठी' },
  { id: 'bn', label: 'বাংলা' }
] as const;

export type Lang = (typeof LANGUAGES)[number]['id'];

/**
 * A verdict in everyday words, in English or an Indian language. It is built
 * only from the flags and amounts of the saved verdict, never from the agent's
 * own wording, so it reads the same for every claim and shows nothing about a
 * policy that the viewer is not already shown.
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
  },
  kn: {
    NOT_COVERED: 'ಈ ವೆಚ್ಚ ಪಾಲಿಸಿಯಲ್ಲಿ ಸೇರಿಲ್ಲ.',
    DUPLICATE: 'ಈ ವೆಚ್ಚವನ್ನು ಬಿಲ್‌ನಲ್ಲಿ ಎರಡು ಬಾರಿ ಸೇರಿಸಿದಂತೆ ಕಾಣುತ್ತದೆ.',
    OVERPRICED: 'ಈ ಮೊತ್ತ ಸಾಮಾನ್ಯ ದರಕ್ಕಿಂತ ಬಹಳ ಹೆಚ್ಚಾಗಿದೆ.',
    UNBUNDLED: 'ಇದು ಸಾಮಾನ್ಯವಾಗಿ ಬಿಲ್‌ನಲ್ಲಿರುವ ಇನ್ನೊಂದು ಚಿಕಿತ್ಸೆಯಲ್ಲೇ ಸೇರಿರುತ್ತದೆ, ಆದರೆ ಪ್ರತ್ಯೇಕವಾಗಿ ಸೇರಿಸಲಾಗಿದೆ.',
    UNRELATED: 'ಇದಕ್ಕೂ ರೋಗನಿರ್ಣಯಕ್ಕೂ ಸಂಬಂಧ ಕಾಣುತ್ತಿಲ್ಲ.'
  },
  ta: {
    NOT_COVERED: 'இந்தச் செலவு பாலிசியில் சேர்க்கப்படவில்லை.',
    DUPLICATE: 'இந்தச் செலவு பில்லில் இரண்டு முறை சேர்க்கப்பட்டதாகத் தெரிகிறது.',
    OVERPRICED: 'இந்தத் தொகை வழக்கமான விலையை விட மிக அதிகம்.',
    UNBUNDLED: 'இது பொதுவாக பில்லில் உள்ள வேறொரு சிகிச்சையிலேயே அடங்கும், ஆனால் தனியாகச் சேர்க்கப்பட்டுள்ளது.',
    UNRELATED: 'இதற்கும் நோய் கண்டறிதலுக்கும் தொடர்பு இருப்பதாகத் தெரியவில்லை.'
  },
  te: {
    NOT_COVERED: 'ఈ ఖర్చు పాలసీలో చేర్చబడలేదు.',
    DUPLICATE: 'ఈ ఖర్చు బిల్లులో రెండుసార్లు చేర్చినట్లు కనిపిస్తోంది.',
    OVERPRICED: 'ఈ మొత్తం సాధారణ ధర కంటే చాలా ఎక్కువ.',
    UNBUNDLED: 'ఇది సాధారణంగా బిల్లులోని మరో చికిత్సలోనే కలిసి ఉంటుంది, కానీ విడిగా చేర్చారు.',
    UNRELATED: 'దీనికి రోగ నిర్ధారణతో సంబంధం ఉన్నట్లు కనిపించడం లేదు.'
  },
  mr: {
    NOT_COVERED: 'हा खर्च पॉलिसीमध्ये समाविष्ट नाही.',
    DUPLICATE: 'हा खर्च बिलात दोनदा लावल्यासारखा दिसतो.',
    OVERPRICED: 'ही रक्कम नेहमीच्या दरापेक्षा खूप जास्त आहे.',
    UNBUNDLED: 'हा खर्च साधारणपणे बिलातील दुसऱ्या उपचारातच समाविष्ट असतो, पण तो वेगळा लावला आहे.',
    UNRELATED: 'याचा आजाराच्या निदानाशी संबंध दिसत नाही.'
  },
  bn: {
    NOT_COVERED: 'এই খরচ পলিসির আওতায় পড়ে না।',
    DUPLICATE: 'এই খরচ বিলে দুবার ধরা হয়েছে বলে মনে হচ্ছে।',
    OVERPRICED: 'এই অঙ্ক সাধারণ দরের চেয়ে অনেক বেশি।',
    UNBUNDLED: 'এটি সাধারণত বিলের অন্য একটি চিকিৎসার মধ্যেই ধরা থাকে, কিন্তু আলাদা করে যোগ করা হয়েছে।',
    UNRELATED: 'রোগনির্ণয়ের সঙ্গে এর সম্পর্ক আছে বলে মনে হচ্ছে না।'
  }
};

interface Wording {
  billed: (amount: string) => string;
  insurerPays: (amount: string) => string;
  youPay: (amount: string) => string;
  patientPays: (amount: string) => string;
  allAccepted: string;
  notPaid: (count: number, amount: string) => string;
  copay: (amount: string) => string;
  cap: (amount: string) => string;
  waived: (amount: string) => string;
  withdrawn: string;
  askHospital: string;
}

const TEXT: Record<Lang, Wording> = {
  en: {
    billed: a => `The bill was ${a}.`,
    insurerPays: a => `The insurer pays ${a}.`,
    youPay: a => `You pay ${a}.`,
    patientPays: a => `The patient pays ${a}.`,
    allAccepted: 'Every charge on the bill was accepted.',
    notPaid: (n, a) => `The insurer did not pay for ${n} ${n === 1 ? 'charge' : 'charges'}, worth ${a}:`,
    copay: a => `${a} is the copay: the share of the accepted charges that the policy leaves to the patient.`,
    cap: a => `${a} is above the policy's coverage limit, so the insurer does not pay it.`,
    waived: a => `After a dispute, the hospital withdrew ${a} of charges. That amount is no longer owed.`,
    withdrawn: 'Withdrawn by the hospital.',
    askHospital: 'You can ask the hospital about the charges marked as possible billing problems. A flag means the charge is worth checking; it is not proof of a mistake.'
  },
  hi: {
    billed: a => `कुल बिल ${a} था।`,
    insurerPays: a => `बीमा कंपनी ${a} देगी।`,
    youPay: a => `आपको ${a} देना है।`,
    patientPays: a => `मरीज़ को ${a} देना है।`,
    allAccepted: 'बिल के सभी खर्च मान लिए गए।',
    notPaid: (n, a) => `बीमा कंपनी ने ${a} के ${n} खर्च नहीं दिए:`,
    copay: a => `${a} को-पे है: माने गए खर्च का वह हिस्सा जो पॉलिसी के अनुसार मरीज़ को देना होता है।`,
    cap: a => `${a} पॉलिसी की अधिकतम सीमा से ऊपर है, इसलिए बीमा कंपनी इसे नहीं देगी।`,
    waived: a => `आपत्ति के बाद अस्पताल ने ${a} का खर्च हटा दिया है। यह रकम अब नहीं देनी है।`,
    withdrawn: 'अस्पताल ने यह खर्च हटा दिया है।',
    askHospital: 'जिन खर्चों पर बिलिंग की गड़बड़ी का शक है, उनके बारे में आप अस्पताल से पूछ सकते हैं। फ़्लैग का मतलब है कि खर्च जाँचने लायक है; यह गलती का सबूत नहीं है।'
  },
  kn: {
    billed: a => `ಒಟ್ಟು ಬಿಲ್ ${a}.`,
    insurerPays: a => `ವಿಮಾ ಕಂಪನಿ ${a} ಪಾವತಿಸುತ್ತದೆ.`,
    youPay: a => `ನೀವು ${a} ಪಾವತಿಸಬೇಕು.`,
    patientPays: a => `ರೋಗಿ ${a} ಪಾವತಿಸಬೇಕು.`,
    allAccepted: 'ಬಿಲ್‌ನ ಎಲ್ಲಾ ವೆಚ್ಚಗಳನ್ನು ಒಪ್ಪಿಕೊಳ್ಳಲಾಗಿದೆ.',
    notPaid: (n, a) => `ವಿಮಾ ಕಂಪನಿ ${a} ಮೌಲ್ಯದ ${n} ${n === 1 ? 'ವೆಚ್ಚವನ್ನು' : 'ವೆಚ್ಚಗಳನ್ನು'} ಪಾವತಿಸಿಲ್ಲ:`,
    copay: a => `${a} ಕೋ-ಪೇ: ಒಪ್ಪಿಕೊಂಡ ವೆಚ್ಚಗಳಲ್ಲಿ ಪಾಲಿಸಿಯ ಪ್ರಕಾರ ರೋಗಿ ಪಾವತಿಸಬೇಕಾದ ಪಾಲು.`,
    cap: a => `${a} ಪಾಲಿಸಿಯ ಗರಿಷ್ಠ ಮಿತಿಗಿಂತ ಹೆಚ್ಚಾಗಿದೆ, ಆದ್ದರಿಂದ ವಿಮಾ ಕಂಪನಿ ಅದನ್ನು ಪಾವತಿಸುವುದಿಲ್ಲ.`,
    waived: a => `ಆಕ್ಷೇಪಣೆಯ ನಂತರ ಆಸ್ಪತ್ರೆ ${a} ವೆಚ್ಚವನ್ನು ಹಿಂಪಡೆದಿದೆ. ಆ ಮೊತ್ತವನ್ನು ಇನ್ನು ಪಾವತಿಸಬೇಕಿಲ್ಲ.`,
    withdrawn: 'ಆಸ್ಪತ್ರೆ ಈ ವೆಚ್ಚವನ್ನು ಹಿಂಪಡೆದಿದೆ.',
    askHospital: 'ಬಿಲ್ಲಿಂಗ್ ತಪ್ಪಿರಬಹುದು ಎಂದು ಗುರುತಿಸಿದ ವೆಚ್ಚಗಳ ಬಗ್ಗೆ ನೀವು ಆಸ್ಪತ್ರೆಯನ್ನು ಕೇಳಬಹುದು. ಗುರುತು ಎಂದರೆ ಆ ವೆಚ್ಚವನ್ನು ಪರಿಶೀಲಿಸುವುದು ಒಳ್ಳೆಯದು ಎಂದರ್ಥ; ಅದು ತಪ್ಪಿನ ಪುರಾವೆಯಲ್ಲ.'
  },
  ta: {
    billed: a => `மொத்த பில் ${a}.`,
    insurerPays: a => `காப்பீட்டு நிறுவனம் ${a} செலுத்தும்.`,
    youPay: a => `நீங்கள் ${a} செலுத்த வேண்டும்.`,
    patientPays: a => `நோயாளி ${a} செலுத்த வேண்டும்.`,
    allAccepted: 'பில்லில் உள்ள அனைத்துச் செலவுகளும் ஏற்கப்பட்டன.',
    notPaid: (n, a) => `காப்பீட்டு நிறுவனம் ${a} மதிப்புள்ள ${n} ${n === 1 ? 'செலவை' : 'செலவுகளை'} செலுத்தவில்லை:`,
    copay: a => `${a} என்பது கோ-பே: ஏற்கப்பட்ட செலவுகளில் பாலிசியின்படி நோயாளி செலுத்த வேண்டிய பங்கு.`,
    cap: a => `${a} பாலிசியின் அதிகபட்ச வரம்பை விட அதிகம், எனவே காப்பீட்டு நிறுவனம் அதைச் செலுத்தாது.`,
    waived: a => `ஆட்சேபனைக்குப் பிறகு மருத்துவமனை ${a} செலவைத் திரும்பப் பெற்றது. அந்தத் தொகையை இனி செலுத்த வேண்டியதில்லை.`,
    withdrawn: 'மருத்துவமனை இந்தச் செலவைத் திரும்பப் பெற்றது.',
    askHospital: 'பில்லிங் தவறாக இருக்கலாம் எனக் குறிக்கப்பட்ட செலவுகளைப் பற்றி நீங்கள் மருத்துவமனையிடம் கேட்கலாம். குறி என்றால் அந்தச் செலவைச் சரிபார்ப்பது நல்லது என்று பொருள்; அது தவறுக்கான சான்று அல்ல.'
  },
  te: {
    billed: a => `మొత్తం బిల్లు ${a}.`,
    insurerPays: a => `బీమా సంస్థ ${a} చెల్లిస్తుంది.`,
    youPay: a => `మీరు ${a} చెల్లించాలి.`,
    patientPays: a => `రోగి ${a} చెల్లించాలి.`,
    allAccepted: 'బిల్లులోని అన్ని ఖర్చులు అంగీకరించబడ్డాయి.',
    notPaid: (n, a) => `బీమా సంస్థ ${a} విలువైన ${n} ${n === 1 ? 'ఖర్చును' : 'ఖర్చులను'} చెల్లించలేదు:`,
    copay: a => `${a} కో-పే: అంగీకరించిన ఖర్చులలో పాలసీ ప్రకారం రోగి చెల్లించాల్సిన వాటా.`,
    cap: a => `${a} పాలసీ గరిష్ఠ పరిమితి కంటే ఎక్కువ, కాబట్టి బీమా సంస్థ దాన్ని చెల్లించదు.`,
    waived: a => `అభ్యంతరం తర్వాత ఆసుపత్రి ${a} ఖర్చును ఉపసంహరించుకుంది. ఆ మొత్తాన్ని ఇక చెల్లించాల్సిన అవసరం లేదు.`,
    withdrawn: 'ఆసుపత్రి ఈ ఖర్చును ఉపసంహరించుకుంది.',
    askHospital: 'బిల్లింగ్ లోపం ఉండవచ్చని గుర్తించిన ఖర్చుల గురించి మీరు ఆసుపత్రిని అడగవచ్చు. గుర్తు అంటే ఆ ఖర్చును పరిశీలించడం మంచిదని అర్థం; అది పొరపాటుకు రుజువు కాదు.'
  },
  mr: {
    billed: a => `एकूण बिल ${a} होते.`,
    insurerPays: a => `विमा कंपनी ${a} देईल.`,
    youPay: a => `तुम्हाला ${a} भरायचे आहेत.`,
    patientPays: a => `रुग्णाला ${a} भरायचे आहेत.`,
    allAccepted: 'बिलातील सर्व खर्च मान्य झाले.',
    notPaid: (n, a) => (n === 1 ? `विमा कंपनीने ${a} किमतीचा ${n} खर्च दिला नाही:` : `विमा कंपनीने ${a} किमतीचे ${n} खर्च दिले नाहीत:`),
    copay: a => `${a} हा को-पे आहे: मान्य खर्चातील तो हिस्सा जो पॉलिसीनुसार रुग्णाला भरावा लागतो.`,
    cap: a => `${a} पॉलिसीच्या कमाल मर्यादेपेक्षा जास्त आहे, म्हणून विमा कंपनी ते देणार नाही.`,
    waived: a => `हरकतीनंतर रुग्णालयाने ${a} चा खर्च मागे घेतला आहे. ती रक्कम आता भरायची नाही.`,
    withdrawn: 'रुग्णालयाने हा खर्च मागे घेतला आहे.',
    askHospital: 'ज्या खर्चांवर बिलिंगमध्ये चूक असल्याची शंका आहे, त्याबद्दल तुम्ही रुग्णालयाला विचारू शकता. खूण म्हणजे तो खर्च तपासण्यासारखा आहे; ती चूक झाल्याचा पुरावा नाही.'
  },
  bn: {
    billed: a => `মোট বিল ছিল ${a}।`,
    insurerPays: a => `বিমা সংস্থা ${a} দেবে।`,
    youPay: a => `আপনাকে ${a} দিতে হবে।`,
    patientPays: a => `রোগীকে ${a} দিতে হবে।`,
    allAccepted: 'বিলের সব খরচ মেনে নেওয়া হয়েছে।',
    notPaid: (n, a) => `বিমা সংস্থা ${a} মূল্যের ${n}টি খরচ দেয়নি:`,
    copay: a => `${a} হল কো-পে: মেনে নেওয়া খরচের যে অংশ পলিসি অনুযায়ী রোগীকে দিতে হয়।`,
    cap: a => `${a} পলিসির সর্বোচ্চ সীমার বেশি, তাই বিমা সংস্থা তা দেবে না।`,
    waived: a => `আপত্তির পর হাসপাতাল ${a} খরচ তুলে নিয়েছে। ওই টাকা আর দিতে হবে না।`,
    withdrawn: 'হাসপাতাল এই খরচ তুলে নিয়েছে।',
    askHospital: 'যে খরচগুলিতে বিলিংয়ের গোলমাল থাকতে পারে বলে চিহ্নিত করা হয়েছে, সেগুলি নিয়ে আপনি হাসপাতালকে জিজ্ঞাসা করতে পারেন। চিহ্ন মানে খরচটি যাচাই করা ভালো; এটি ভুলের প্রমাণ নয়।'
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
