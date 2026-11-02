import fs from "node:fs";
import path from "node:path";
import { parse, parseDocument } from "yaml";
import {
  rawCourseConfigV2Schema,
  rawTermConfigV2Schema,
  TERM_CODE_PATTERN
} from "../config/config-schemas.js";
import { AuthorizationResolver } from "../faculty/authorization-resolver.js";
import { CourseTermLifecycle } from "./course-term-lifecycle.js";
import { planTermActivation } from "./term-activation.js";

/** Internal v2 metadata policy for the existing isolated managed transaction, never the v1 inspector. */
export const readActivationMetadata = (root: string, organization: string) => {
  const course = rawCourseConfigV2Schema.parse(
    parse(fs.readFileSync(path.join(root, "course.yml"), "utf8"))
  );
  if (course.github.organization.toLowerCase() !== organization.toLowerCase())
    throw new Error("Activation course organization mismatch.");
  const terms = fs
    .readdirSync(path.join(root, "terms"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      if (!TERM_CODE_PATTERN.test(entry.name)) throw new Error("Invalid activation term path.");
      const term = rawTermConfigV2Schema.parse(
        parse(fs.readFileSync(path.join(root, "terms", entry.name, "term.yml"), "utf8"))
      );
      if (term.term.code !== entry.name) throw new Error("Activation term path/code mismatch.");
      new AuthorizationResolver(course, term, course.fallback_administrator.github_user_id);
      return term;
    });
  new CourseTermLifecycle(terms);
  return { course, terms };
};

/** Replans from the exact cloned revision. All writes remain unpublished until the shared transaction commits. */
export const prepareTermActivation = (
  root: string,
  organization: string,
  targetCode: string,
  actorId: number
) => {
  const state = readActivationMetadata(root, organization);
  const plan = planTermActivation(state.course, state.terms, targetCode, actorId);
  for (const code of plan.changedTermCodes) {
    const term = plan.after.find((entry) => entry.term.code === code);
    if (!term) throw new Error("Incomplete activation plan.");
    const file = path.join(root, "terms", code, "term.yml");
    const document = parseDocument(fs.readFileSync(file, "utf8"), { strict: true });
    if (document.errors.length) throw new Error("Invalid activation YAML.");
    document.setIn(["term", "status"], term.term.status);
    document.setIn(["term", "has_ever_been_active"], term.term.has_ever_been_active);
    fs.writeFileSync(file, document.toString());
  }
  const after = readActivationMetadata(root, organization);
  if (JSON.stringify(after.terms) !== JSON.stringify(plan.after))
    throw new Error("Activation changed unrelated domain fields.");
  return { course: state.course, plan };
};
