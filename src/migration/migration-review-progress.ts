import { z } from "zod";
import { facultyIdentitySchema } from "../config/config-schemas.js";
import { migrationReviewSubmissionSchema } from "./migration-review-validation.js";
import { graderAccessSubmissionSchema } from "./grader-access-review.js";
const MAX_REVIEW_ID_LENGTH = 256;
/** Strict local decision hints. This codec contains no live completion or publication authority. */
export const migrationReviewProgressSchema = z
  .object({
    version: z.literal(1),
    organizationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reviewIdentity: z.string().min(1).max(MAX_REVIEW_ID_LENGTH),
    submission: migrationReviewSubmissionSchema,
    identities: z.array(facultyIdentitySchema),
    choices: z.array(facultyIdentitySchema),
    grader: z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
        submission: graderAccessSubmissionSchema
      })
      .strict()
      .nullable()
  })
  .strict();
