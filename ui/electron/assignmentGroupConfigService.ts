import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import type {
  AssignmentGroupConfigRequest,
  AssignmentGroupConfigResult,
  AssignmentGroupConfigSaveRequest,
  CourseSetupDiagnostic
} from "./ipc.js";

const ASSIGNMENT_PATH_PATTERN =
  /^terms\/(\d{2}s[123])\/assignments\/([A-Za-z0-9][A-Za-z0-9._-]*)\/assignment\.yml$/;
const GROUP_HEADERS = ["group_id", "student_id"] as const;
const GROUP_FILE = "groups.csv";
const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const emptyResult = (
  diagnostics: readonly CourseSetupDiagnostic[]
): AssignmentGroupConfigResult => ({
  status: "failure",
  repositoryMode: "individual",
  groupsFile: GROUP_FILE,
  groupsCsv: "",
  groupCount: 0,
  groupedStudentCount: 0,
  ungroupedActiveStudentCount: 0,
  diagnostics
});

const isContained = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

const assignmentPaths = (courseFolderPath: string, assignmentFile: string) => {
  const match = assignmentFile.replaceAll("\\", "/").match(ASSIGNMENT_PATH_PATTERN);
  const root = path.resolve(courseFolderPath);
  const assignmentPath = path.resolve(root, assignmentFile);
  return match === null || !isContained(root, assignmentPath)
    ? null
    : {
        root,
        assignmentPath,
        termCode: match[1] ?? "",
        assignmentDirectory: path.dirname(assignmentPath)
      };
};

interface RosterStudent {
  readonly id: string;
  readonly section: string;
  readonly status: string;
}

const loadStudents = (
  root: string,
  termCode: string,
  sections: readonly string[]
): RosterStudent[] =>
  sections.flatMap((section) => {
    const rosterPath = path.join(root, "terms", termCode, "rosters", `section-${section}.csv`);
    try {
      const [header, ...lines] = fs.readFileSync(rosterPath, "utf8").split(/\r?\n/u);
      const columns = header.split(",").map((value) => value.trim());
      const idIndex = columns.indexOf("student_id");
      const sectionIndex = columns.indexOf("section");
      const statusIndex = columns.indexOf("status");
      return lines
        .filter((line) => line.trim() !== "")
        .map((line) => line.split(",").map((value) => value.trim()))
        .map((values) => ({
          id: values[idIndex] ?? "",
          section: values[sectionIndex] ?? section,
          status: (values[statusIndex] ?? "").toLowerCase()
        }));
    } catch {
      return [];
    }
  });

const validateGroups = (
  csv: string,
  students: readonly RosterStudent[]
): Pick<
  AssignmentGroupConfigResult,
  "groupCount" | "groupedStudentCount" | "ungroupedActiveStudentCount" | "diagnostics"
> => {
  const lines = csv.split(/\r?\n/u).filter((line) => line.trim() !== "");
  const diagnostics: CourseSetupDiagnostic[] = [];
  if ((lines[0] ?? "").trim() !== GROUP_HEADERS.join(","))
    return {
      groupCount: 0,
      groupedStudentCount: 0,
      ungroupedActiveStudentCount: 0,
      diagnostics: [diagnostic("Group CSV must begin with group_id,student_id.")]
    };
  const known = new Map(students.map((student) => [student.id, student]));
  const groups = new Map<string, RosterStudent[]>();
  const memberships = new Set<string>();
  const assignedStudents = new Set<string>();
  lines.slice(1).forEach((line, index) => {
    const [rawGroupId = "", rawStudentId = "", ...extra] = line.split(",");
    const groupId = rawGroupId.trim();
    const studentId = rawStudentId.trim();
    if (extra.length > 0 || groupId === "" || studentId === "") {
      diagnostics.push(
        diagnostic(`Group CSV row ${String(index + 2)} requires group_id and student_id.`)
      );
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(groupId)) {
      diagnostics.push(diagnostic(`Group ID ${groupId} is not safe for repository naming.`));
      return;
    }
    const membership = `${groupId}\u0000${studentId}`;
    if (memberships.has(membership)) {
      diagnostics.push(diagnostic(`Student ${studentId} is duplicated in group ${groupId}.`));
      return;
    }
    memberships.add(membership);
    if (assignedStudents.has(studentId)) {
      diagnostics.push(diagnostic(`Student ${studentId} appears in more than one group.`));
      return;
    }
    const student = known.get(studentId);
    if (student === undefined) {
      diagnostics.push(
        diagnostic(`Student ${studentId} is not in this assignment's selected sections.`)
      );
      return;
    }
    if (student.status !== "active") {
      diagnostics.push(
        diagnostic(
          `Student ${studentId} is ${student.status || "not active"} and cannot be assigned to a group.`
        )
      );
      return;
    }
    assignedStudents.add(studentId);
    groups.set(groupId, [...(groups.get(groupId) ?? []), student]);
  });
  groups.forEach((members, groupId) => {
    if (new Set(members.map((student) => student.section)).size > 1)
      diagnostics.push(
        diagnostic(`Group ${groupId} contains students from more than one section.`)
      );
  });
  const ungrouped = students.filter(
    (student) => student.status === "active" && !assignedStudents.has(student.id)
  );
  if (ungrouped.length > 0)
    diagnostics.push(
      diagnostic(
        `${String(ungrouped.length)} active student(s) in selected sections are not assigned to a group.`
      )
    );
  return {
    groupCount: groups.size,
    groupedStudentCount: assignedStudents.size,
    ungroupedActiveStudentCount: ungrouped.length,
    diagnostics
  };
};

const load = (request: AssignmentGroupConfigRequest): AssignmentGroupConfigResult => {
  const paths = assignmentPaths(request.courseFolderPath, request.assignmentFile);
  if (paths === null) return emptyResult([diagnostic("Assignment path is invalid.")]);
  try {
    const document = parseDocument(fs.readFileSync(paths.assignmentPath, "utf8"));
    const rootValue = document.toJS() as {
      repository_mode?: unknown;
      groups?: { file?: unknown };
      sections?: unknown;
    };
    const mode = rootValue.repository_mode === "group" ? "group" : "individual";
    const groupsFile =
      typeof rootValue.groups?.file === "string" ? rootValue.groups.file : GROUP_FILE;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/u.test(groupsFile))
      return emptyResult([diagnostic("Group CSV file name is invalid.")]);
    const groupsPath = path.resolve(paths.assignmentDirectory, groupsFile);
    if (!isContained(paths.assignmentDirectory, groupsPath))
      return emptyResult([diagnostic("Group CSV path is invalid.")]);
    const groupsCsv = fs.existsSync(groupsPath)
      ? fs.readFileSync(groupsPath, "utf8")
      : "group_id,student_id\n";
    const sections = Array.isArray(rootValue.sections)
      ? rootValue.sections.filter((value): value is string => typeof value === "string")
      : [];
    const summary = validateGroups(groupsCsv, loadStudents(paths.root, paths.termCode, sections));
    return { status: "ready", repositoryMode: mode, groupsFile, groupsCsv, ...summary };
  } catch {
    return emptyResult([diagnostic("Unable to load assignment group settings.")]);
  }
};

export const getAssignmentGroupConfig = load;

export const saveAssignmentGroupConfig = (
  request: AssignmentGroupConfigSaveRequest
): AssignmentGroupConfigResult => {
  const loaded = load(request);
  if (loaded.status === "failure") return loaded;
  const paths = assignmentPaths(request.courseFolderPath, request.assignmentFile);
  if (paths === null) return emptyResult([diagnostic("Assignment path is invalid.")]);
  const groupsCsv = request.groupsCsv.replace(/\r\n/gu, "\n");
  const summary = validateGroups(
    groupsCsv,
    (() => {
      const document = parseDocument(fs.readFileSync(paths.assignmentPath, "utf8"));
      const value = document.toJS() as { sections?: unknown };
      const sections = Array.isArray(value.sections)
        ? value.sections.filter((item): item is string => typeof item === "string")
        : [];
      return loadStudents(paths.root, paths.termCode, sections);
    })()
  );
  if (
    request.repositoryMode === "group" &&
    summary.diagnostics.some((item) => !item.message.includes("not assigned to a group"))
  )
    return {
      status: "failure",
      repositoryMode: request.repositoryMode,
      groupsFile: GROUP_FILE,
      groupsCsv,
      ...summary
    };
  try {
    const document = parseDocument(fs.readFileSync(paths.assignmentPath, "utf8"));
    document.set("repository_mode", request.repositoryMode);
    document.set("groups", { file: GROUP_FILE });
    if (request.repositoryMode === "group")
      fs.writeFileSync(
        path.join(paths.assignmentDirectory, GROUP_FILE),
        `${groupsCsv.replace(/\n*$/u, "")}\n`,
        "utf8"
      );
    fs.writeFileSync(paths.assignmentPath, document.toString(), "utf8");
    return {
      status: "success",
      repositoryMode: request.repositoryMode,
      groupsFile: GROUP_FILE,
      groupsCsv,
      ...summary,
      diagnostics: [
        ...summary.diagnostics,
        diagnostic(
          "Group assignment settings were saved locally. Use Publish Course Changes to share them to the admin repo."
        )
      ]
    };
  } catch {
    return emptyResult([diagnostic("Unable to save assignment group settings.")]);
  }
};
