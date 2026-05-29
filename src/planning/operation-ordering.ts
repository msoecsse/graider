import {
  PLAN_OPERATION_TYPES,
  type PlanOperation,
  type PlanOperationType
} from "./operation-models.js";

const OPERATION_ID_SEPARATOR = ":";
const UNKNOWN_OPERATION_INDEX = PLAN_OPERATION_TYPES.length;

const operationOrderIndex = (type: PlanOperationType): number => {
  const index = PLAN_OPERATION_TYPES.indexOf(type);

  return index < 0 ? UNKNOWN_OPERATION_INDEX : index;
};

export const createOperationId = (
  section: string,
  studentId: string,
  type: PlanOperationType
): string => [section, studentId, type].join(OPERATION_ID_SEPARATOR);

export const comparePlanOperations = (left: PlanOperation, right: PlanOperation): number =>
  (left.section ?? "").localeCompare(right.section ?? "") ||
  (left.student_id ?? "").localeCompare(right.student_id ?? "") ||
  operationOrderIndex(left.type) - operationOrderIndex(right.type);
