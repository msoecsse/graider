const EMPTY_COUNT = 0;

export interface RosterRecord {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly status: string;
}

// Row identity across a diff is student_id alone (trimmed, case-insensitive),
// matching the key roster-validation.ts already uses for duplicate
// detection. github_username is not used for identity because it is the
// field most likely to be corrected in place (a student renames their
// GitHub account) without the row being a different student.
//
// A consequence, deliberately accepted: if student_id itself is edited, the
// old id is not recognized as "the same row renamed" — it reads as one row
// dropped (old id) and one row added (new id). Any single-field identity
// key has this property; student_id is Graider's existing natural key, so
// it is the one used here.
const COMPARABLE_FIELDS = ["githubUsername", "section", "status"] as const;
type ComparableField = (typeof COMPARABLE_FIELDS)[number];

// A student's `status` field changing (including to "dropped") is a
// "changed" row, not a "dropped" row. "Dropped" in this diff means the row
// itself is absent from the current set -- a student removed from the
// roster entirely, not a status edit. This matches §5.6's amber/red split:
// editing status is a benign field edit (amber); a row disappearing is the
// stronger signal (red), and per the roster manager feasibility pass, it
// still leaves the student's repository and published reports untouched.
export type RosterRowChangeType = "added" | "dropped" | "changed";

export interface RosterRowDiff {
  readonly changeType: RosterRowChangeType;
  readonly studentId: string;
  readonly baseline: RosterRecord | null;
  readonly current: RosterRecord | null;
  readonly changedFields: readonly ComparableField[];
}

export interface RosterDiffResult {
  readonly addedCount: number;
  readonly droppedCount: number;
  readonly changedCount: number;
  readonly unchangedCount: number;
  readonly totalChangeCount: number;
  readonly rows: readonly RosterRowDiff[];
}

const normalizeIdentity = (studentId: string): string => studentId.trim().toLowerCase();

const getChangedFields = (baseline: RosterRecord, current: RosterRecord): ComparableField[] =>
  COMPARABLE_FIELDS.filter((field) => baseline[field] !== current[field]);

const indexByIdentity = (records: readonly RosterRecord[]): Map<string, RosterRecord> =>
  new Map(records.map((record) => [normalizeIdentity(record.studentId), record]));

// A row present in the current set but not the baseline is "added". A row
// present in the baseline but not the current set is "dropped" -- not
// silently ignored -- so a re-uploaded roster that omits an existing
// student is surfaced to faculty rather than quietly removing them on save.
export const diffRosterRows = (
  baseline: readonly RosterRecord[],
  current: readonly RosterRecord[]
): RosterDiffResult => {
  const baselineByIdentity = indexByIdentity(baseline);
  const currentByIdentity = indexByIdentity(current);
  const identities = new Set([...baselineByIdentity.keys(), ...currentByIdentity.keys()]);

  const rows: RosterRowDiff[] = [];
  let addedCount = EMPTY_COUNT;
  let droppedCount = EMPTY_COUNT;
  let changedCount = EMPTY_COUNT;
  let unchangedCount = EMPTY_COUNT;

  for (const identity of identities) {
    const baselineRecord = baselineByIdentity.get(identity) ?? null;
    const currentRecord = currentByIdentity.get(identity) ?? null;

    if (baselineRecord === null && currentRecord !== null) {
      addedCount += 1;
      rows.push({
        changeType: "added",
        studentId: currentRecord.studentId,
        baseline: null,
        current: currentRecord,
        changedFields: []
      });
    } else if (baselineRecord !== null && currentRecord === null) {
      droppedCount += 1;
      rows.push({
        changeType: "dropped",
        studentId: baselineRecord.studentId,
        baseline: baselineRecord,
        current: null,
        changedFields: []
      });
    } else if (baselineRecord !== null && currentRecord !== null) {
      const changedFields = getChangedFields(baselineRecord, currentRecord);

      if (changedFields.length > EMPTY_COUNT) {
        changedCount += 1;
        rows.push({
          changeType: "changed",
          studentId: currentRecord.studentId,
          baseline: baselineRecord,
          current: currentRecord,
          changedFields
        });
      } else {
        unchangedCount += 1;
      }
    }
  }

  return {
    addedCount,
    droppedCount,
    changedCount,
    unchangedCount,
    totalChangeCount: addedCount + droppedCount + changedCount,
    rows
  };
};
