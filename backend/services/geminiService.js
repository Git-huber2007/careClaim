import { GoogleGenAI, Type } from '@google/genai';
import { config, missingEnv } from '../config.js';
import { adjudicationResultSchema } from '../validation/schemas.js';
import { HttpError } from '../utils/http.js';

const ai = missingEnv.includes('GEMINI_API_KEY') ? null : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const SYSTEM_PROMPT = `You are CareClaim AI, an autonomous medical insurance adjudication agent. 
Your job is to analyze hospital discharge bills against the patient's insurance policy constraints.
You must:
1. Cross-reference every billed item against the 'covered_treatments' and 'excluded_treatments'.
2. Identify fraudulent or explicitly excluded charges and deny them.
3. Calculate the final approved payout based on the policy's max coverage limit and copay percentage.
4. Provide a step-by-step 'chain_of_thought' log detailing exactly how you arrived at the decision, which will be streamed to a terminal UI.
You must strictly return data in the provided JSON schema.`;

/** Spec output schema, expressed in the SDK's schema format. */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chain_of_thought: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Step-by-step internal reasoning (e.g., 'Analyzing item 1...', 'Item 2 is excluded...')",
    },
    final_status: {
      type: Type.STRING,
      enum: ['APPROVED', 'PARTIAL', 'DENIED'],
    },
    approved_amount: {
      type: Type.NUMBER,
      description: 'Final calculated payout after copay and exclusions',
    },
    denied_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item_name: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['item_name', 'reason'],
      },
    },
  },
  required: ['chain_of_thought', 'final_status', 'approved_amount', 'denied_items'],
  propertyOrdering: ['chain_of_thought', 'final_status', 'approved_amount', 'denied_items'],
};

function buildUserPrompt(claim, policy) {
  const items = claim.raw_bill_data
    .map((it, i) => `  ${i + 1}. "${it.item_name}" — ${Number(it.cost).toFixed(2)}`)
    .join('\n');

  return `## CLAIM UNDER REVIEW
Claim ID: ${claim.id}
Patient ID: ${claim.patient_id}
Diagnosis Code (ICD-10): ${claim.diagnosis_code || 'N/A'}
Total Billed: ${Number(claim.total_billed).toFixed(2)}

Itemized Bill:
${items}

## PATIENT POLICY
Policy Number: ${policy.policy_number}
Policy Holder Patient ID: ${policy.patient_id}
Max Coverage Limit: ${Number(policy.max_coverage_limit).toFixed(2)}
Copay Percentage: ${Number(policy.copay_percentage)}%
Covered Treatments: ${JSON.stringify(policy.covered_treatments)}
Excluded Treatments: ${JSON.stringify(policy.excluded_treatments)}

## ADJUDICATION RULES
- If the claim's Patient ID does not match the Policy Holder Patient ID, flag it as potential fraud and DENY every item.
- Evaluate EVERY line item individually. Map it semantically to the closest covered or excluded treatment category.
- Deny an item if it matches an excluded treatment, is not reasonably covered by any covered treatment, is clinically unrelated to the diagnosis code, or appears duplicated / grossly overpriced (possible fraud or out-of-network overcharge).
- In denied_items, item_name MUST be copied EXACTLY as written in the bill. If an item appears twice and both are denied, list it twice.
- Payout math, in this exact order:
    eligible = total_billed - sum(denied item costs)
    copay    = eligible * copay_percentage / 100
    payable  = eligible - copay
    approved_amount = min(payable, max_coverage_limit), rounded to 2 decimals
- final_status: APPROVED if no items are denied and no cap applies; DENIED if approved_amount is 0; otherwise PARTIAL.

## CHAIN OF THOUGHT FORMAT
Write 10-25 concise terminal-style lines. Start with ingestion/verification steps (e.g. "Extracting itemized bill: N line items detected", "Cross-referencing Policy ${policy.policy_number}..."), then one line per item ("Item 3 'X' ($Y): COVERED under 'Z'" or "Rejecting line item 4: Cosmetic surgery not covered"), then the math steps, then the final decision.`;
}

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new HttpError(504, 'Gemini request timed out.')), ms)),
  ]);

/**
 * Runs the Gemini adjudication agent. Retries once on transient / malformed output.
 */
export async function runAdjudicationAgent(claim, policy) {
  if (!ai) throw new HttpError(503, 'GEMINI_API_KEY is not configured on the server.');

  const contents = buildUserPrompt(claim, policy);
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: config.geminiModel,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1,
          },
        }),
        60_000
      );

      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini');

      const parsed = adjudicationResultSchema.parse(JSON.parse(text));
      return { result: parsed, model: config.geminiModel, attempts: attempt };
    } catch (err) {
      lastError = err;
      const status = err?.status ?? err?.code;
      const retryable = !status || status === 429 || status >= 500 || err instanceof SyntaxError || err?.name === 'ZodError';
      console.warn(`[gemini] attempt ${attempt} failed:`, err?.message || err);
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  if (lastError instanceof HttpError) throw lastError;
  throw new HttpError(502, `AI adjudication failed: ${lastError?.message || 'unknown error'}`);
}
