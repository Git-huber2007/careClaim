import { z } from 'zod';

const round2 = (n) => Math.round(n * 100) / 100;

/** Spec-mandated schema for claim submission. */
export const claimSubmissionSchema = z
  .object({
    patient_id: z.string().trim().min(1),
    policy_id: z.string().uuid(),
    diagnosis_code: z.string().trim().min(1),
    raw_bill_data: z
      .array(
        z.object({
          item_name: z.string().trim().min(1),
          cost: z.number().positive(),
        })
      )
      .min(1, 'Bill must contain at least one line item'),
    total_billed: z.number().positive().max(99_999_999.99, 'total_billed exceeds the supported maximum'), // DECIMAL(10, 2)
  })
  .refine(
    (d) => Math.abs(round2(d.raw_bill_data.reduce((s, i) => s + i.cost, 0)) - round2(d.total_billed)) < 0.01,
    { message: 'total_billed must equal the sum of all line item costs', path: ['total_billed'] }
  );

export const uuidParamSchema = z.object({ id: z.string().uuid() });

/** Validates the structured JSON returned by Gemini. */
export const adjudicationResultSchema = z.object({
  chain_of_thought: z.array(z.string()).min(1),
  final_status: z.enum(['APPROVED', 'PARTIAL', 'DENIED']),
  approved_amount: z.number().nonnegative(),
  denied_items: z.array(
    z.object({
      item_name: z.string(),
      reason: z.string(),
    })
  ),
});
