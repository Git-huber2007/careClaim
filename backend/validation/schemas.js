import { z } from 'zod';
import { FLAGS } from '../services/adjudicationMath.js';

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

/** Account setup: a patient must name the policy they hold. */
export const profileSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('HOSPITAL') }),
  z.object({
    role: z.literal('PATIENT'),
    policy_number: z
      .string()
      .trim()
      .min(1, 'Policy number is required')
      .max(255)
      .regex(/^[A-Za-z0-9 ._/-]+$/, 'Policy number contains unsupported characters'),
    patient_id: z.string().trim().min(1, 'Patient ID is required').max(255),
  }),
]);

export const disputeSubmissionSchema = z.object({
  line_number: z.number().int().positive(),
  note: z.string().trim().max(1000).optional(),
});

export const disputeResponseSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
  response: z.string().trim().min(1, 'A response is required').max(1000),
});

/** Validates the structured JSON returned by Gemini. */
export const adjudicationResultSchema = z.object({
  chain_of_thought: z.array(z.string()).min(1),
  line_items: z.array(
    z.object({
      line: z.number(),
      item_name: z.string(),
      flag: z.enum(FLAGS),
      reason: z.string(),
    })
  ),
  final_status: z.enum(['APPROVED', 'PARTIAL', 'DENIED']),
  approved_amount: z.number().nonnegative(),
});
