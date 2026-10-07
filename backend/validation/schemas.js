import { z } from 'zod';
import { FLAGS } from '../services/adjudicationMath.js';

const round2 = (n) => Math.round(n * 100) / 100;

const MAX_AMOUNT = 99_999_999.99; // DECIMAL(10, 2)

/**
 * Text copied from a bill. It is stored, shown on screen and placed inside the
 * model prompt, so it is one bounded line with no control characters.
 */
const billText = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]*$/, 'Must be a single line of plain text');

const billLines = z
  .array(
    z.object({
      item_name: billText(200),
      cost: z.number().positive().max(MAX_AMOUNT),
    })
  )
  .min(1, 'Bill must contain at least one line item')
  .max(200, 'A bill can have at most 200 line items');

/** A planned bill to estimate against a policy; nothing is stored. */
export const estimateSchema = z.object({ policy_id: z.string().uuid(), raw_bill_data: billLines });

/** Spec-mandated schema for claim submission. */
export const claimSubmissionSchema = z
  .object({
    patient_id: billText(255), // VARCHAR(255)
    policy_id: z.string().uuid(),
    diagnosis_code: billText(100), // VARCHAR(100)
    raw_bill_data: billLines,
    total_billed: z.number().positive().max(MAX_AMOUNT, 'total_billed exceeds the supported maximum'),
  })
  .refine(
    (d) => Math.abs(round2(d.raw_bill_data.reduce((s, i) => s + i.cost, 0)) - round2(d.total_billed)) < 0.01,
    { message: 'total_billed must equal the sum of all line item costs', path: ['total_billed'] }
  );

// Lower-cased, so the ID compares equal to the one the database returns.
export const uuidParamSchema = z.object({ id: z.string().uuid().toLowerCase() });

const policyNumber = z
  .string()
  .trim()
  .min(1, 'Policy number is required')
  .max(255)
  .regex(/^[A-Za-z0-9 ._/-]+$/, 'Policy number contains unsupported characters');

/** A hospital looks a policy up by the number on the patient's card. */
export const policyLookupSchema = z.object({ policy_number: policyNumber.optional() });

export const profileSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('HOSPITAL'),
    hospital_org: z.string().trim().max(255).optional(),
    access_code: z.string().trim().max(200).optional(),
  }),
  z.object({
    role: z.literal('PATIENT'),
    policy_number: policyNumber,
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

export const billExtractionSchema = z.object({
  fileBase64: z.string().min(1, 'File base64 data is required'),
  mimeType: z
    .enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/jpg'])
    // Some browsers report image/jpg, which is not a registered type and the model rejects.
    .transform((type) => (type === 'image/jpg' ? 'image/jpeg' : type)),
});

