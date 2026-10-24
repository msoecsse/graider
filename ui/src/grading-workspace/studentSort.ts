import type { GradingStudentListEntry } from "./GradingStudentListPane";

export type StudentSortKey = "default" | "section" | "firstName" | "lastName";
export interface StudentSort {
  readonly key: StudentSortKey;
  readonly direction: "ascending" | "descending";
}

// Session-local preference: never written to shared course configuration.
let sessionSort: StudentSort = { key: "default", direction: "ascending" };
export const getStudentSort = (): StudentSort => sessionSort;
export const rememberStudentSort = (sort: StudentSort): void => {
  sessionSort = sort;
};
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export const sortGradingStudents = <T extends GradingStudentListEntry>(
  entries: readonly T[],
  sort: StudentSort
): readonly T[] => {
  if (sort.key === "default") return entries;
  const keys =
    sort.key === "section"
      ? (["section", "lastName", "firstName"] as const)
      : sort.key === "firstName"
        ? (["firstName", "lastName"] as const)
        : (["lastName", "firstName"] as const);
  return [...entries].sort((left, right) => {
    let comparison = 0;
    keys.some((key) => {
      const a = left.student[key]?.trim() ?? "";
      const b = right.student[key]?.trim() ?? "";
      // Missing values sort last in either direction, including secondary keys.
      comparison =
        a === "" || b === ""
          ? Number(a === "") - Number(b === "")
          : collator.compare(a, b) * (sort.direction === "ascending" ? 1 : -1);
      return comparison !== 0;
    });
    return comparison || left.index - right.index;
  });
};
