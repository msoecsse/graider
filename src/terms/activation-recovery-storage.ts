import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type { RawTermConfigV2 } from "../config/config-models.js";
import { TERM_CODE_PATTERN } from "../config/config-schemas.js";
import { CourseTermLifecycle } from "./course-term-lifecycle.js";
import {
  ACTIVATION_RECOVERY_FILE,
  activationRecoveryCheckpointSchema,
  validateRecoveryCheckpoint,
  TermRecoveryNeedsAttention,
  type ActivationRecoveryCheckpoint
} from "./activation-recovery-checkpoint.js";

export const activationRecoveryPath = (termCode: string): string => {
  if (!TERM_CODE_PATTERN.test(termCode)) throw new Error("Invalid recovery term path.");
  return `terms/${termCode}/${ACTIVATION_RECOVERY_FILE}`;
};
export const readRecoveryCheckpoints = (
  root: string,
  terms: readonly RawTermConfigV2[],
  repositoryId?: number
): readonly ActivationRecoveryCheckpoint[] => {
  const lifecycle = new CourseTermLifecycle(terms);
  const records: ActivationRecoveryCheckpoint[] = [];
  for (const term of terms) {
    const file = path.join(root, activationRecoveryPath(term.term.code));
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new TermRecoveryNeedsAttention("checkpoint_invalid");
    try {
      const record = activationRecoveryCheckpointSchema.parse(parse(fs.readFileSync(file, "utf8")));
      records.push(
        validateRecoveryCheckpoint(
          record,
          lifecycle,
          repositoryId ?? record.course_repository_id,
          term.term.code
        )
      );
    } catch (error) {
      if (error instanceof TermRecoveryNeedsAttention) throw error;
      throw new TermRecoveryNeedsAttention("checkpoint_invalid");
    }
  }
  if (records.length > 1) throw new TermRecoveryNeedsAttention("checkpoint_invalid");
  return Object.freeze(records);
};
export const writeRecoveryCheckpoint = (
  root: string,
  input: ActivationRecoveryCheckpoint
): void => {
  const record = activationRecoveryCheckpointSchema.parse(input);
  fs.writeFileSync(
    path.join(root, activationRecoveryPath(record.target_term_code)),
    stringify(record)
  );
};
