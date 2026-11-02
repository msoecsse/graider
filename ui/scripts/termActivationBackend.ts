export {
  prepareTermActivation,
  readActivationMetadata
} from "../../src/terms/term-activation-metadata.js";
export { reconcileTermActivation } from "../../src/terms/activation-reconciliation.js";
export { reconcileCourseTermLifecycle } from "../../src/terms/activation-reconciliation.js";
export {
  prepareDraftDeletion,
  prepareActivationRecovery,
  prepareStudentActivityMarker,
  inspectTermRecoveryCheckpoint,
  assertNoKnownStudentTargets
} from "../../src/terms/term-recovery-metadata.js";
export { TermRecoveryNeedsAttention } from "../../src/terms/activation-recovery-checkpoint.js";
export { rawTermConfigV2Schema } from "../../src/config/config-schemas.js";
export { prepareCourseLifecycleChange } from "../../src/courses/course-lifecycle-metadata.js";
