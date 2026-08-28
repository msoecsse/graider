import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

export interface StudentAccessPagesConfigInput {
  readonly courseFolderPath: string;
  readonly repository: string;
  readonly baseUrl: string;
  readonly branch: string;
}

export interface StudentAccessPagesConfigResult {
  readonly status: "success" | "failure";
  readonly diagnostics: readonly { readonly message: string }[];
  readonly changed: boolean;
}

const diagnostic = (message: string) => ({ message });
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const contained = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

export const saveStudentAccessPagesConfig = (
  input: StudentAccessPagesConfigInput
): StudentAccessPagesConfigResult => {
  const repository = input.repository.trim();
  const baseUrl = input.baseUrl.trim();
  const branch = input.branch.trim();
  const diagnostics = [
    ...(REPOSITORY_PATTERN.test(repository)
      ? []
      : [diagnostic("Pages repository must be owner/repo.")]),
    ...(BRANCH_PATTERN.test(branch) && !branch.includes("..")
      ? []
      : [diagnostic("Pages branch must be a safe non-empty branch name.")])
  ];
  try {
    if (new URL(baseUrl).protocol !== "https:")
      diagnostics.push(diagnostic("Pages base URL must use HTTPS."));
  } catch {
    diagnostics.push(diagnostic("Pages base URL must use HTTPS."));
  }
  if (diagnostics.length > 0) return { status: "failure", diagnostics, changed: false };
  const root = path.resolve(input.courseFolderPath);
  const coursePath = path.resolve(root, "course.yml");
  if (!contained(root, coursePath))
    return {
      status: "failure",
      diagnostics: [diagnostic("Course config path is outside the selected course folder.")],
      changed: false
    };
  try {
    const document = parseDocument(fs.readFileSync(coursePath, "utf8"));
    if (document.errors.length > 0) throw new Error("Invalid YAML");
    document.setIn(["notifications", "student_access_pages"], {
      repository,
      base_url: baseUrl,
      branch
    });
    fs.writeFileSync(coursePath, document.toString(), "utf8");
    return {
      status: "success",
      diagnostics: [
        diagnostic(
          "Student Access Pages settings were saved locally. Commit and push course.yml manually when ready."
        )
      ],
      changed: true
    };
  } catch {
    return {
      status: "failure",
      diagnostics: [diagnostic("Unable to save Student Access Pages settings.")],
      changed: false
    };
  }
};
