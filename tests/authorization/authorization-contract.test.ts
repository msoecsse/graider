import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_ACTION_IDS,
  AUTHORIZATION_DECISIONS,
  AUTHORIZATION_MATRIX_TRACES,
  AUTHORIZATION_SCENARIO_IDS,
  authorizationContractCases,
  deferredAuthorizationDecisions,
  type AuthorizationActionId,
  type AuthorizationContractCase,
  type AuthorizationQualifier,
  type AuthorizationScenarioId
} from "./authorization-contract.js";

const EXPECTED_SCENARIOS = [
  "current_section_faculty",
  "current_cofaculty",
  "current_other_section_faculty",
  "current_coordinator_teaching_target",
  "current_coordinator_not_teaching_target",
  "former_section_faculty_removed_mid_term",
  "normally_completed_historical_faculty",
  "former_coordinator_removed_mid_term",
  "normally_completed_historical_coordinator",
  "course_fallback_administrator",
  "draft_term_faculty",
  "draft_term_coordinator",
  "unrelated_historical_faculty",
  "assignment_owner",
  "assignment_editor_not_owner"
] as const satisfies readonly AuthorizationScenarioId[];

const EXPECTED_ACTIONS = [
  "discover_course",
  "see_active_term",
  "see_draft_term",
  "see_historical_term",
  "see_target_section_students",
  "inspect_target_section_operational_state",
  "edit_target_roster",
  "edit_another_section_roster",
  "add_remove_sections",
  "assign_faculty",
  "create_term",
  "activate_term",
  "archive_unarchive_term",
  "archive_unarchive_course",
  "perform_coordinator_wide_action",
  "create_assignment",
  "edit_shared_assignment_definition",
  "delete_draft_assignment",
  "activate_assignment",
  "archive_unarchive_assignment",
  "manage_assignment_ownership",
  "set_section_due_date_late_policy",
  "mark_assignment_not_using",
  "apply_provision",
  "adopt_review_assignment_update",
  "propagate_student_repository_update",
  "see_grading_student_state",
  "grade",
  "regrade",
  "mark_complete",
  "publish_republish_report",
  "use_shared_reusable_comments",
  "create_reusable_comment",
  "edit_delete_own_reusable_comment",
  "edit_delete_another_faculty_comment",
  "correct_student_identity",
  "replace_student_github_account",
  "remove_drop_student",
  "view_organization_migration_plan_status",
  "initiate_organization_migration",
  "resume_reconcile_organization_migration",
  "modify_unrelated_organization_teams"
] as const satisfies readonly AuthorizationActionId[];

const sort = <T extends string>(values: Iterable<T>): T[] =>
  [...values].sort((left, right) => left.localeCompare(right));

const qualifierKey = (qualifier: AuthorizationQualifier | undefined): string =>
  JSON.stringify(qualifier ?? {});

const findCase = (
  scenario: AuthorizationScenarioId,
  action: AuthorizationActionId,
  qualifier: Partial<AuthorizationQualifier> = {}
): AuthorizationContractCase => {
  const match = authorizationContractCases.find(
    (testCase) =>
      testCase.scenario === scenario &&
      testCase.action === action &&
      Object.entries(qualifier).every(
        ([key, value]) => testCase.qualifier?.[key as keyof AuthorizationQualifier] === value
      )
  );
  expect(match, `${scenario}:${action}:${JSON.stringify(qualifier)}`).toBeDefined();
  if (match === undefined) throw new Error("Expected authorization contract case was absent.");
  return match;
};

const expectDecision = (
  scenario: AuthorizationScenarioId,
  action: AuthorizationActionId,
  decision: AuthorizationContractCase["expected"]["decision"],
  qualifier: Partial<AuthorizationQualifier> = {}
): void => {
  expect(findCase(scenario, action, qualifier).expected.decision).toBe(decision);
};

describe("schema-v2 authorization contract integrity", () => {
  it("contains every approved matrix scenario", () => {
    expect(AUTHORIZATION_SCENARIO_IDS).toEqual(EXPECTED_SCENARIOS);
    expect(sort(new Set(authorizationContractCases.map((testCase) => testCase.scenario)))).toEqual(
      sort(EXPECTED_SCENARIOS)
    );
  });

  it("covers every intentionally captured action with a settled case or explicit deferral", () => {
    expect(AUTHORIZATION_ACTION_IDS).toEqual(EXPECTED_ACTIONS);
    const coveredActions = new Set([
      ...authorizationContractCases.map((testCase) => testCase.action),
      ...deferredAuthorizationDecisions.map((item) => item.action)
    ]);
    expect(sort(coveredActions)).toEqual(sort(EXPECTED_ACTIONS));
  });

  it("has unique scenario, action, and qualifier combinations", () => {
    const keys = authorizationContractCases.map(
      (testCase) => `${testCase.scenario}:${testCase.action}:${qualifierKey(testCase.qualifier)}`
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(authorizationContractCases.map((testCase) => testCase.id)).size).toBe(
      authorizationContractCases.length
    );
  });

  it("uses valid decisions and explains every conditional result", () => {
    const validDecisions = new Set<string>(AUTHORIZATION_DECISIONS);
    for (const testCase of authorizationContractCases) {
      expect(validDecisions.has(testCase.expected.decision), testCase.id).toBe(true);
      if (testCase.expected.decision === "conditional") {
        expect(testCase.expected.guard?.trim().length, testCase.id).toBeGreaterThan(0);
      }
    }
  });

  it("traces every settled and deferred item to an authorization matrix table", () => {
    const validTraces = new Set<string>(Object.values(AUTHORIZATION_MATRIX_TRACES));
    for (const testCase of authorizationContractCases) {
      expect(validTraces.has(testCase.trace), testCase.id).toBe(true);
    }
    for (const deferred of deferredAuthorizationDecisions) {
      expect(validTraces.has(deferred.trace), deferred.action).toBe(true);
    }
  });

  it("keeps unresolved product decisions out of settled authorization outcomes", () => {
    const deferredActions = deferredAuthorizationDecisions.map((item) => item.action);
    expect(sort(deferredActions)).toEqual(
      sort([
        "view_organization_migration_plan_status",
        "initiate_organization_migration",
        "resume_reconcile_organization_migration"
      ])
    );
    expect(
      authorizationContractCases.some((testCase) => deferredActions.includes(testCase.action))
    ).toBe(false);
    expect(new Set(deferredAuthorizationDecisions.map((item) => item.status))).toEqual(
      new Set(["deferred"])
    );
  });
});

describe("schema-v2 authorization critical invariants", () => {
  it("isolates ordinary faculty to their own section", () => {
    expectDecision("current_section_faculty", "see_target_section_students", "own_scope", {
      targetScope: "own_section"
    });
    expectDecision(
      "current_section_faculty",
      "inspect_target_section_operational_state",
      "own_scope",
      { targetScope: "own_section" }
    );
    expectDecision("current_section_faculty", "edit_target_roster", "own_scope", {
      targetScope: "own_section"
    });
    expectDecision("current_section_faculty", "see_target_section_students", "not_visible", {
      targetScope: "another_section"
    });
    expectDecision(
      "current_section_faculty",
      "inspect_target_section_operational_state",
      "not_visible",
      { targetScope: "another_section" }
    );
    expectDecision("current_section_faculty", "edit_another_section_roster", "not_visible", {
      targetScope: "another_section"
    });
    expectDecision("current_other_section_faculty", "apply_provision", "not_visible");
  });

  it("gives co-faculty equivalent shared-section authority", () => {
    for (const action of [
      "see_target_section_students",
      "inspect_target_section_operational_state",
      "edit_target_roster",
      "grade",
      "publish_republish_report"
    ] as const) {
      expectDecision("current_cofaculty", action, "own_scope", { targetScope: "own_section" });
    }
  });

  it("requires explicit expansion before a non-teaching coordinator enters a section", () => {
    for (const action of [
      "see_target_section_students",
      "inspect_target_section_operational_state",
      "edit_target_roster",
      "apply_provision",
      "grade"
    ] as const) {
      expectDecision(
        "current_coordinator_not_teaching_target",
        action,
        "coordinator_expansion_required",
        { coordinatorScope: "section_focused" }
      );
    }
    expectDecision(
      "current_coordinator_not_teaching_target",
      "see_target_section_students",
      "allowed",
      { coordinatorScope: "explicitly_expanded" }
    );
  });

  it("keeps fallback recovery authority separate from student and grading authority", () => {
    expectDecision("course_fallback_administrator", "see_target_section_students", "not_visible");
    expectDecision("course_fallback_administrator", "see_grading_student_state", "not_visible");
    expectDecision("course_fallback_administrator", "grade", "not_allowed");
    expectDecision("course_fallback_administrator", "create_term", "allowed");
    expectDecision("course_fallback_administrator", "assign_faculty", "conditional");
  });

  it("makes mid-term removal read-only and ends normal mutation authority", () => {
    expectDecision(
      "former_section_faculty_removed_mid_term",
      "see_target_section_students",
      "read_only"
    );
    expectDecision(
      "former_section_faculty_removed_mid_term",
      "inspect_target_section_operational_state",
      "read_only"
    );
    for (const action of ["edit_target_roster", "apply_provision", "grade", "regrade"] as const) {
      expectDecision("former_section_faculty_removed_mid_term", action, "not_allowed");
    }
  });

  it("preserves normal historical grading, regrading, completion, and publication", () => {
    for (const action of [
      "grade",
      "regrade",
      "mark_complete",
      "publish_republish_report"
    ] as const) {
      expectDecision("normally_completed_historical_faculty", action, "own_scope", {
        termLifecycle: "archived"
      });
    }
    expectDecision("normally_completed_historical_faculty", "edit_target_roster", "not_allowed", {
      termLifecycle: "archived"
    });
  });

  it("makes a removed coordinator historical/read-only without coordinator mutation", () => {
    expectDecision(
      "former_coordinator_removed_mid_term",
      "see_target_section_students",
      "read_only"
    );
    expectDecision(
      "former_coordinator_removed_mid_term",
      "inspect_target_section_operational_state",
      "read_only"
    );
    for (const action of [
      "perform_coordinator_wide_action",
      "edit_target_roster",
      "apply_provision",
      "grade"
    ] as const) {
      expectDecision("former_coordinator_removed_mid_term", action, "not_allowed");
    }
  });

  it("grants owners assignment lifecycle authority without section visibility", () => {
    expectDecision("assignment_owner", "see_target_section_students", "not_visible");
    expectDecision("assignment_owner", "inspect_target_section_operational_state", "not_visible");
    expectDecision("assignment_owner", "see_grading_student_state", "not_visible");
    expectDecision("assignment_owner", "manage_assignment_ownership", "allowed");
    expectDecision("assignment_owner", "activate_assignment", "conditional");
    expectDecision("assignment_owner", "delete_draft_assignment", "conditional");
  });

  it("allows Draft preparation while prohibiting student-facing work", () => {
    expectDecision("draft_term_faculty", "edit_target_roster", "own_scope");
    expectDecision("draft_term_faculty", "set_section_due_date_late_policy", "own_scope");
    for (const action of [
      "apply_provision",
      "grade",
      "mark_complete",
      "publish_republish_report"
    ] as const) {
      expectDecision("draft_term_faculty", action, "not_allowed");
    }
  });

  it("does not let an upcoming-term-only coordinator activate while another term is Active", () => {
    expectDecision("draft_term_coordinator", "activate_term", "not_allowed", {
      termLifecycle: "draft",
      activeTermExists: true
    });
  });

  it("hides another section's students, operations, and grading progress", () => {
    for (const action of [
      "see_target_section_students",
      "inspect_target_section_operational_state",
      "see_grading_student_state"
    ] as const) {
      expectDecision("current_other_section_faculty", action, "not_visible");
    }
  });

  it("freezes Archived structure while preserving approved historical grading", () => {
    expectDecision(
      "normally_completed_historical_faculty",
      "set_section_due_date_late_policy",
      "read_only",
      { termLifecycle: "archived" }
    );
    for (const action of ["edit_target_roster", "apply_provision"] as const) {
      expectDecision("normally_completed_historical_faculty", action, "not_allowed", {
        termLifecycle: "archived"
      });
    }
    for (const action of ["grade", "regrade", "publish_republish_report"] as const) {
      expectDecision("normally_completed_historical_faculty", action, "own_scope", {
        termLifecycle: "archived"
      });
    }
  });
});
