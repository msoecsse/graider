import { describe, expect, it } from "vitest";
import type { RawCourseConfig } from "../../../src/config/config-models.js";
import {
  GRAIDER_MANAGED_WORKFLOW_MARKER,
  GRAIDER_MANAGED_WORKFLOW_VERSION,
  classifyManagedWorkflow,
  planManagedWorkflowDeployment
} from "../../../src/workflows/managed-workflow-policy.js";
import { renderJavaJunitCheckstyleWorkflow } from "../../../src/workflows/java-junit-checkstyle-workflow.js";

const grading = {
  enabled: true,
  mode: "preset",
  preset: "java-junit-checkstyle",
  workflow: ".github/workflows/grade.yml",
  artifact: "grading-results",
  result_file: "grading-results.json"
} satisfies NonNullable<RawCourseConfig["grading"]>;

const canonicalWorkflow = (): string => renderJavaJunitCheckstyleWorkflow({ grading });

describe("managed workflow policy", () => {
  it("adds one stable, versioned ownership marker to deterministic canonical output", () => {
    const workflow = canonicalWorkflow();

    expect(workflow).toBe(canonicalWorkflow());
    expect(workflow.split(GRAIDER_MANAGED_WORKFLOW_MARKER)).toHaveLength(2);
    expect(workflow).toContain(
      `# graider-workflow-version: ${String(GRAIDER_MANAGED_WORKFLOW_VERSION)}`
    );
  });

  it("plans creation when no workflow content exists", () => {
    expect(planManagedWorkflowDeployment(null, canonicalWorkflow())).toEqual({
      classification: "absent",
      action: "create"
    });
  });

  it("plans no operation for exact canonical content, including CRLF transport", () => {
    const canonical = canonicalWorkflow();

    expect(planManagedWorkflowDeployment(canonical, canonical)).toEqual({
      classification: "identical",
      action: "noop"
    });
    expect(planManagedWorkflowDeployment(canonical.replaceAll("\n", "\r\n"), canonical)).toEqual({
      classification: "identical",
      action: "noop"
    });
  });

  it("allows an older marked Graider workflow to be updated", () => {
    const canonical = canonicalWorkflow();
    const earlierManagedWorkflow = canonical.replace(
      'CHECKSTYLE_VERSION: "14.1.0"',
      'CHECKSTYLE_VERSION: "10.23.1"'
    );

    expect(classifyManagedWorkflow(earlierManagedWorkflow, canonical)).toEqual({
      classification: "managed_outdated",
      ownershipVersion: GRAIDER_MANAGED_WORKFLOW_VERSION
    });
    expect(planManagedWorkflowDeployment(earlierManagedWorkflow, canonical)).toEqual({
      classification: "managed_outdated",
      action: "update_managed",
      ownershipVersion: GRAIDER_MANAGED_WORKFLOW_VERSION
    });
  });

  it("protects unmarked, manually supplied or edited workflows", () => {
    const canonical = canonicalWorkflow();
    const manualWorkflow = canonical
      .replace(`${GRAIDER_MANAGED_WORKFLOW_MARKER}\n`, "")
      .replace(`# graider-workflow-version: ${String(GRAIDER_MANAGED_WORKFLOW_VERSION)}\n`, "")
      .replace("name: AutoGrading Tests", "name: Faculty workflow");

    expect(planManagedWorkflowDeployment(manualWorkflow, canonical)).toEqual({
      classification: "unmanaged_conflict",
      action: "conflict_unmanaged"
    });
  });

  it("does not overwrite a workflow marked by an unsupported future contract", () => {
    const canonical = canonicalWorkflow();
    const futureWorkflow = canonical.replace(
      `# graider-workflow-version: ${String(GRAIDER_MANAGED_WORKFLOW_VERSION)}`,
      "# graider-workflow-version: 2"
    );

    expect(planManagedWorkflowDeployment(futureWorkflow, canonical)).toEqual({
      classification: "managed_version_unsupported",
      action: "conflict_unsupported_version",
      ownershipVersion: 2
    });
  });

  it("does not need existing content or a repository commit to plan an empty-repository deployment", () => {
    expect(classifyManagedWorkflow(null, canonicalWorkflow())).toEqual({
      classification: "absent"
    });
  });
});
