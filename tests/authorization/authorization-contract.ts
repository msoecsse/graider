/**
 * Executable expectations for the future schema-v2 authorization resolver.
 *
 * This is test data, not a reference policy engine. The groups below state every
 * expected result explicitly; `expandGroup` only flattens those declarations for
 * table-driven Phase 6 tests. The current v1 `resolveFacultyScope` remains a
 * separate implementation. Phase 6 will bind these cases to the unified resolver.
 */

export const AUTHORIZATION_SCENARIO_IDS = [
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
] as const;

export type AuthorizationScenarioId = (typeof AUTHORIZATION_SCENARIO_IDS)[number];

export const AUTHORIZATION_ACTION_IDS = [
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
] as const;

export type AuthorizationActionId = (typeof AUTHORIZATION_ACTION_IDS)[number];

export const AUTHORIZATION_DECISIONS = [
  "allowed",
  "own_scope",
  "coordinator_expansion_required",
  "read_only",
  "not_visible",
  "not_allowed",
  "conditional"
] as const;

export type AuthorizationDecision = (typeof AUTHORIZATION_DECISIONS)[number];

export interface AuthorizationQualifier {
  readonly targetScope?: "own_section" | "another_section" | "whole_term";
  readonly termLifecycle?: "draft" | "active" | "archived";
  readonly assignmentLifecycle?: "draft" | "active" | "archived";
  readonly historicalRelationship?: "removed_mid_term" | "completed_normally";
  readonly coordinatorScope?: "section_focused" | "explicitly_expanded";
  readonly assignmentRelationship?: "owner" | "editor_only";
  readonly commentOwnership?: "own" | "another_faculty";
  readonly activeTermExists?: boolean;
}

export interface ExpectedAuthorizationDecision {
  readonly decision: AuthorizationDecision;
  readonly guard?: string;
}

export interface AuthorizationContractCase {
  readonly id: string;
  readonly scenario: AuthorizationScenarioId;
  readonly action: AuthorizationActionId;
  readonly qualifier?: AuthorizationQualifier;
  readonly expected: ExpectedAuthorizationDecision;
  readonly trace: AuthorizationMatrixTrace;
}

export const AUTHORIZATION_MATRIX_TRACES = {
  visibility: "§3 Course and term visibility",
  sectionAdministration: "§4 Section visibility and roster administration",
  courseTermLifecycle: "§5 Course and term lifecycle authority",
  assignmentAuthority: "§6 Shared assignment authority",
  sectionAssignmentGrading: "§7 Section assignment, repository, and grading actions",
  reusableComments: "§8 Shared reusable comments",
  migration: "§9 Organization migration and reconciliation"
} as const;

export type AuthorizationMatrixTrace =
  (typeof AUTHORIZATION_MATRIX_TRACES)[keyof typeof AUTHORIZATION_MATRIX_TRACES];

interface ExplicitExpectedAction {
  readonly action: AuthorizationActionId;
  readonly decision: AuthorizationDecision;
  readonly guard?: string;
}

interface AuthorizationContractGroup {
  readonly id: string;
  readonly scenario: AuthorizationScenarioId;
  readonly trace: AuthorizationMatrixTrace;
  readonly qualifier?: AuthorizationQualifier;
  readonly expectations: readonly ExplicitExpectedAction[];
}

const expectation = (
  action: AuthorizationActionId,
  decision: AuthorizationDecision,
  guard?: string
): ExplicitExpectedAction =>
  guard === undefined ? { action, decision } : { action, decision, guard };

const visibilityActions = [
  "discover_course",
  "see_active_term",
  "see_draft_term",
  "see_historical_term"
] as const satisfies readonly AuthorizationActionId[];

const sectionAdministrationActions = [
  "see_target_section_students",
  "inspect_target_section_operational_state",
  "edit_target_roster",
  "edit_another_section_roster",
  "add_remove_sections",
  "assign_faculty"
] as const satisfies readonly AuthorizationActionId[];

const gradingActions = [
  "see_grading_student_state",
  "grade",
  "regrade",
  "mark_complete",
  "publish_republish_report"
] as const satisfies readonly AuthorizationActionId[];

const groups: readonly AuthorizationContractGroup[] = [
  {
    id: "current-faculty-visibility",
    scenario: "current_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "own_section", termLifecycle: "active" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "allowed"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "own_scope")
    ]
  },
  {
    id: "cofaculty-visibility",
    scenario: "current_cofaculty",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "own_section", termLifecycle: "active" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "allowed"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "own_scope")
    ]
  },
  {
    id: "other-section-faculty-visibility",
    scenario: "current_other_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "another_section", termLifecycle: "active" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "allowed"),
      expectation("see_draft_term", "not_visible"),
      expectation(
        "see_historical_term",
        "read_only",
        "Term metadata only; target section remains hidden"
      )
    ]
  },
  {
    id: "coordinator-teaching-visibility",
    scenario: "current_coordinator_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "own_section", coordinatorScope: "section_focused" },
    expectations: visibilityActions.map((action) => expectation(action, "allowed"))
  },
  {
    id: "coordinator-nonteaching-visibility",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "whole_term", coordinatorScope: "section_focused" },
    expectations: visibilityActions.map((action) => expectation(action, "allowed"))
  },
  {
    id: "removed-faculty-visibility",
    scenario: "former_section_faculty_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "own_section", historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "read_only"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "read_only")
    ]
  },
  {
    id: "completed-faculty-visibility",
    scenario: "normally_completed_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: {
      targetScope: "own_section",
      termLifecycle: "archived",
      historicalRelationship: "completed_normally"
    },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "not_visible"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "own_scope")
    ]
  },
  {
    id: "removed-coordinator-visibility",
    scenario: "former_coordinator_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "whole_term", historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "read_only"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "read_only")
    ]
  },
  {
    id: "completed-coordinator-visibility",
    scenario: "normally_completed_historical_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: {
      targetScope: "whole_term",
      termLifecycle: "archived",
      historicalRelationship: "completed_normally"
    },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "not_visible"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "allowed")
    ]
  },
  {
    id: "fallback-visibility",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "whole_term" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "allowed"),
      expectation("see_draft_term", "allowed"),
      expectation("see_historical_term", "allowed")
    ]
  },
  {
    id: "draft-faculty-visibility",
    scenario: "draft_term_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "own_section", termLifecycle: "draft" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "not_visible"),
      expectation("see_draft_term", "allowed"),
      expectation("see_historical_term", "not_visible")
    ]
  },
  {
    id: "draft-coordinator-visibility",
    scenario: "draft_term_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "whole_term", termLifecycle: "draft" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "not_visible"),
      expectation("see_draft_term", "allowed"),
      expectation("see_historical_term", "not_visible")
    ]
  },
  {
    id: "unrelated-history-visibility",
    scenario: "unrelated_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { targetScope: "another_section", termLifecycle: "archived" },
    expectations: [
      expectation("discover_course", "allowed"),
      expectation("see_active_term", "not_visible"),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "not_visible")
    ]
  },
  {
    id: "owner-visibility",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { assignmentRelationship: "owner" },
    expectations: visibilityActions.map((action) => expectation(action, "not_visible"))
  },
  {
    id: "editor-visibility",
    scenario: "assignment_editor_not_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.visibility,
    qualifier: { assignmentRelationship: "editor_only", termLifecycle: "active" },
    expectations: [
      expectation(
        "discover_course",
        "allowed",
        "Inherited from the active-term role, never from editor status"
      ),
      expectation(
        "see_active_term",
        "allowed",
        "Inherited from the active-term role, never from editor status"
      ),
      expectation("see_draft_term", "not_visible"),
      expectation("see_historical_term", "not_visible")
    ]
  },
  {
    id: "current-faculty-own-section",
    scenario: "current_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "own_section", termLifecycle: "active" },
    expectations: [
      expectation("see_target_section_students", "own_scope"),
      expectation("inspect_target_section_operational_state", "own_scope"),
      expectation("edit_target_roster", "own_scope"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "current-faculty-other-section",
    scenario: "current_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "another_section", termLifecycle: "active" },
    expectations: [
      expectation("see_target_section_students", "not_visible"),
      expectation("inspect_target_section_operational_state", "not_visible"),
      expectation("edit_another_section_roster", "not_visible")
    ]
  },
  {
    id: "cofaculty-own-section",
    scenario: "current_cofaculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "own_section", termLifecycle: "active" },
    expectations: [
      expectation("see_target_section_students", "own_scope"),
      expectation("inspect_target_section_operational_state", "own_scope"),
      expectation("edit_target_roster", "own_scope"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "other-section-isolation",
    scenario: "current_other_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "another_section", termLifecycle: "active" },
    expectations: [
      expectation("see_target_section_students", "not_visible"),
      expectation("inspect_target_section_operational_state", "not_visible"),
      expectation("edit_target_roster", "not_allowed"),
      expectation("edit_another_section_roster", "not_allowed"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "teaching-coordinator-normal-section",
    scenario: "current_coordinator_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: {
      targetScope: "own_section",
      coordinatorScope: "section_focused",
      termLifecycle: "active"
    },
    expectations: [
      expectation("see_target_section_students", "own_scope"),
      expectation("inspect_target_section_operational_state", "own_scope"),
      expectation("edit_target_roster", "own_scope"),
      expectation("edit_another_section_roster", "coordinator_expansion_required"),
      expectation("add_remove_sections", "coordinator_expansion_required"),
      expectation("assign_faculty", "coordinator_expansion_required")
    ]
  },
  {
    id: "nonteaching-coordinator-normal-scope",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: {
      targetScope: "another_section",
      coordinatorScope: "section_focused",
      termLifecycle: "active"
    },
    expectations: sectionAdministrationActions.map((action) =>
      expectation(action, "coordinator_expansion_required")
    )
  },
  {
    id: "nonteaching-coordinator-expanded-scope",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: {
      targetScope: "another_section",
      coordinatorScope: "explicitly_expanded",
      termLifecycle: "active"
    },
    expectations: sectionAdministrationActions.map((action) => expectation(action, "allowed"))
  },
  {
    id: "removed-faculty-section",
    scenario: "former_section_faculty_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "own_section", historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("see_target_section_students", "read_only"),
      expectation("inspect_target_section_operational_state", "read_only"),
      expectation("edit_target_roster", "not_allowed"),
      expectation("edit_another_section_roster", "not_allowed"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "completed-faculty-archived-section",
    scenario: "normally_completed_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: {
      targetScope: "own_section",
      termLifecycle: "archived",
      historicalRelationship: "completed_normally"
    },
    expectations: [
      expectation("see_target_section_students", "own_scope"),
      expectation("inspect_target_section_operational_state", "read_only"),
      expectation("edit_target_roster", "not_allowed"),
      expectation("edit_another_section_roster", "not_allowed"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "removed-coordinator-section",
    scenario: "former_coordinator_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "whole_term", historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("see_target_section_students", "read_only"),
      expectation("inspect_target_section_operational_state", "read_only"),
      expectation("edit_target_roster", "not_allowed"),
      expectation("edit_another_section_roster", "not_allowed"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "completed-coordinator-archived-section",
    scenario: "normally_completed_historical_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: {
      targetScope: "whole_term",
      termLifecycle: "archived",
      historicalRelationship: "completed_normally"
    },
    expectations: [
      expectation("see_target_section_students", "allowed"),
      expectation("inspect_target_section_operational_state", "read_only"),
      expectation(
        "edit_target_roster",
        "conditional",
        "Explicit audited Archived-term corrective-action path"
      ),
      expectation(
        "edit_another_section_roster",
        "conditional",
        "Explicit audited Archived-term corrective-action path"
      ),
      expectation(
        "add_remove_sections",
        "conditional",
        "Explicit audited Archived-term corrective-action path"
      ),
      expectation(
        "assign_faculty",
        "conditional",
        "Explicit audited Archived-term corrective-action path"
      )
    ]
  },
  {
    id: "fallback-section-boundary",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "another_section" },
    expectations: [
      expectation("see_target_section_students", "not_visible"),
      expectation(
        "inspect_target_section_operational_state",
        "read_only",
        "Administrative metadata only; no student operational state"
      ),
      expectation(
        "edit_target_roster",
        "conditional",
        "Explicit audited exceptional correction; no ordinary section UI"
      ),
      expectation(
        "edit_another_section_roster",
        "conditional",
        "Explicit audited exceptional correction"
      ),
      expectation(
        "add_remove_sections",
        "conditional",
        "Explicit administrative or recovery action"
      ),
      expectation("assign_faculty", "conditional", "Explicit administrative or recovery action")
    ]
  },
  {
    id: "draft-faculty-section-preparation",
    scenario: "draft_term_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "own_section", termLifecycle: "draft" },
    expectations: [
      expectation("see_target_section_students", "own_scope"),
      expectation("inspect_target_section_operational_state", "own_scope"),
      expectation("edit_target_roster", "own_scope"),
      expectation("edit_another_section_roster", "not_visible"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "draft-coordinator-section-preparation",
    scenario: "draft_term_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: {
      targetScope: "whole_term",
      termLifecycle: "draft",
      coordinatorScope: "section_focused"
    },
    expectations: [
      expectation("see_target_section_students", "coordinator_expansion_required"),
      expectation("inspect_target_section_operational_state", "coordinator_expansion_required"),
      expectation("edit_target_roster", "coordinator_expansion_required"),
      expectation("edit_another_section_roster", "coordinator_expansion_required"),
      expectation("add_remove_sections", "allowed"),
      expectation("assign_faculty", "allowed")
    ]
  },
  {
    id: "unrelated-history-section",
    scenario: "unrelated_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { targetScope: "another_section", termLifecycle: "archived" },
    expectations: [
      expectation("see_target_section_students", "not_visible"),
      expectation("inspect_target_section_operational_state", "not_visible"),
      expectation("edit_target_roster", "not_allowed"),
      expectation("edit_another_section_roster", "not_allowed"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "owner-section-boundary",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { assignmentRelationship: "owner" },
    expectations: sectionAdministrationActions.map((action) =>
      expectation(
        action,
        action === "see_target_section_students" ||
          action === "inspect_target_section_operational_state"
          ? "not_visible"
          : "not_allowed"
      )
    )
  },
  {
    id: "editor-section-boundary",
    scenario: "assignment_editor_not_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAdministration,
    qualifier: { assignmentRelationship: "editor_only", targetScope: "another_section" },
    expectations: [
      expectation("see_target_section_students", "not_visible"),
      expectation("inspect_target_section_operational_state", "not_visible"),
      expectation("edit_target_roster", "not_allowed"),
      expectation("edit_another_section_roster", "not_allowed"),
      expectation("add_remove_sections", "not_allowed"),
      expectation("assign_faculty", "not_allowed")
    ]
  },
  {
    id: "ordinary-faculty-course-lifecycle",
    scenario: "current_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "cofaculty-course-lifecycle",
    scenario: "current_cofaculty",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "other-section-faculty-course-lifecycle",
    scenario: "current_other_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "active", targetScope: "another_section" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "active-coordinator-course-lifecycle",
    scenario: "current_coordinator_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "active", coordinatorScope: "section_focused" },
    expectations: [
      expectation(
        "create_term",
        "conditional",
        "Actor coordinates the most recently created term and creating a successor is valid"
      ),
      expectation("activate_term", "conditional", "Explicit activation of a valid Draft successor"),
      expectation(
        "archive_unarchive_term",
        "conditional",
        "Archive only during successor activation; unarchive only through safe activation rollback"
      ),
      expectation(
        "archive_unarchive_course",
        "conditional",
        "Actor coordinates the most recent term and course archive guards pass"
      ),
      expectation("perform_coordinator_wide_action", "coordinator_expansion_required")
    ]
  },
  {
    id: "nonteaching-coordinator-course-lifecycle",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "active", coordinatorScope: "section_focused" },
    expectations: [
      expectation(
        "create_term",
        "conditional",
        "Actor coordinates the most recently created term and creating a successor is valid"
      ),
      expectation("activate_term", "conditional", "Explicit activation of a valid Draft successor"),
      expectation(
        "archive_unarchive_term",
        "conditional",
        "Archive only during successor activation; unarchive only through safe activation rollback"
      ),
      expectation(
        "archive_unarchive_course",
        "conditional",
        "Actor coordinates the most recent term and course archive guards pass"
      ),
      expectation("perform_coordinator_wide_action", "coordinator_expansion_required")
    ]
  },
  {
    id: "removed-faculty-course-lifecycle",
    scenario: "former_section_faculty_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "removed-coordinator-course-lifecycle",
    scenario: "former_coordinator_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "completed-faculty-course-lifecycle",
    scenario: "normally_completed_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "archived", historicalRelationship: "completed_normally" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "completed-coordinator-course-lifecycle",
    scenario: "normally_completed_historical_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "archived", historicalRelationship: "completed_normally" },
    expectations: [
      expectation("create_term", "conditional", "Actor coordinated the most recently created term"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation(
        "archive_unarchive_course",
        "conditional",
        "Actor coordinated the most recent term and course archive guards pass"
      ),
      expectation(
        "perform_coordinator_wide_action",
        "read_only",
        "Historical coordinated-term scope only; no future-term mutation authority"
      )
    ]
  },
  {
    id: "fallback-course-lifecycle",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    expectations: [
      expectation("create_term", "allowed"),
      expectation(
        "activate_term",
        "conditional",
        "Initial-term or recovery activation guards pass"
      ),
      expectation(
        "archive_unarchive_term",
        "conditional",
        "Archive only during successor activation; unarchive only through safe activation rollback"
      ),
      expectation(
        "archive_unarchive_course",
        "conditional",
        "No Active term, no unresolved Draft term, and course guards pass"
      ),
      expectation(
        "perform_coordinator_wide_action",
        "conditional",
        "Administrative recovery only; no implicit student scope"
      )
    ]
  },
  {
    id: "draft-faculty-course-lifecycle",
    scenario: "draft_term_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "draft", activeTermExists: true },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "draft-coordinator-course-lifecycle",
    scenario: "draft_term_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { termLifecycle: "draft", activeTermExists: true },
    expectations: [
      expectation(
        "create_term",
        "conditional",
        "Draft is the most recently created term and creating its successor is valid"
      ),
      expectation(
        "activate_term",
        "not_allowed",
        "Draft role alone cannot activate while another term is Active"
      ),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation(
        "archive_unarchive_course",
        "conditional",
        "Actor also coordinates the most recent term and course archive guards pass"
      ),
      expectation("perform_coordinator_wide_action", "coordinator_expansion_required")
    ]
  },
  {
    id: "unrelated-history-course-lifecycle",
    scenario: "unrelated_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "owner-course-lifecycle-boundary",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { assignmentRelationship: "owner" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "editor-course-lifecycle-boundary",
    scenario: "assignment_editor_not_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.courseTermLifecycle,
    qualifier: { assignmentRelationship: "editor_only" },
    expectations: [
      expectation("create_term", "not_allowed"),
      expectation("activate_term", "not_allowed"),
      expectation("archive_unarchive_term", "not_allowed"),
      expectation("archive_unarchive_course", "not_allowed"),
      expectation("perform_coordinator_wide_action", "not_allowed")
    ]
  },
  {
    id: "active-editor-assignment-authority",
    scenario: "assignment_editor_not_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: {
      assignmentRelationship: "editor_only",
      termLifecycle: "active",
      assignmentLifecycle: "draft"
    },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation("manage_assignment_ownership", "not_allowed")
    ]
  },
  {
    id: "active-owner-assignment-authority",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: {
      assignmentRelationship: "owner",
      termLifecycle: "active",
      assignmentLifecycle: "draft"
    },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation(
        "delete_draft_assignment",
        "conditional",
        "Assignment is still Draft and has no provisioning"
      ),
      expectation(
        "activate_assignment",
        "conditional",
        "At least one effective owner exists and assignment/term lifecycle guards pass"
      ),
      expectation(
        "archive_unarchive_assignment",
        "conditional",
        "Assignment and term/course lifecycle guards pass"
      ),
      expectation("manage_assignment_ownership", "allowed")
    ]
  },
  {
    id: "coordinator-assignment-authority",
    scenario: "current_coordinator_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { termLifecycle: "active", assignmentLifecycle: "draft" },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation(
        "delete_draft_assignment",
        "conditional",
        "Assignment is still Draft and has no provisioning"
      ),
      expectation(
        "activate_assignment",
        "conditional",
        "Assignment and term lifecycle guards pass"
      ),
      expectation(
        "archive_unarchive_assignment",
        "conditional",
        "Assignment and term/course lifecycle guards pass"
      ),
      expectation("manage_assignment_ownership", "allowed")
    ]
  },
  {
    id: "nonteaching-coordinator-assignment-authority",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { termLifecycle: "active", assignmentLifecycle: "draft" },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation(
        "delete_draft_assignment",
        "conditional",
        "Assignment is still Draft and has no provisioning"
      ),
      expectation(
        "activate_assignment",
        "conditional",
        "Assignment and term lifecycle guards pass"
      ),
      expectation(
        "archive_unarchive_assignment",
        "conditional",
        "Assignment and term/course lifecycle guards pass"
      ),
      expectation("manage_assignment_ownership", "allowed")
    ]
  },
  {
    id: "draft-owner-assignment-authority",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: {
      assignmentRelationship: "owner",
      termLifecycle: "draft",
      assignmentLifecycle: "draft"
    },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation(
        "delete_draft_assignment",
        "conditional",
        "Assignment is still Draft and has no provisioning"
      ),
      expectation(
        "activate_assignment",
        "conditional",
        "Draft-term and assignment lifecycle guards permit activation"
      ),
      expectation(
        "archive_unarchive_assignment",
        "conditional",
        "Assignment lifecycle guards pass"
      ),
      expectation("manage_assignment_ownership", "allowed")
    ]
  },
  {
    id: "removed-faculty-assignment-authority",
    scenario: "former_section_faculty_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("create_assignment", "not_allowed"),
      expectation("edit_shared_assignment_definition", "read_only"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation("manage_assignment_ownership", "not_allowed")
    ]
  },
  {
    id: "draft-faculty-assignment-authority",
    scenario: "draft_term_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: {
      targetScope: "own_section",
      termLifecycle: "draft",
      assignmentLifecycle: "draft"
    },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation("manage_assignment_ownership", "not_allowed")
    ]
  },
  {
    id: "draft-coordinator-assignment-authority",
    scenario: "draft_term_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: {
      targetScope: "whole_term",
      termLifecycle: "draft",
      assignmentLifecycle: "draft"
    },
    expectations: [
      expectation("create_assignment", "allowed"),
      expectation("edit_shared_assignment_definition", "allowed"),
      expectation(
        "delete_draft_assignment",
        "conditional",
        "Assignment is still Draft and has no provisioning"
      ),
      expectation(
        "activate_assignment",
        "conditional",
        "Assignment and Draft-term lifecycle guards permit activation"
      ),
      expectation(
        "archive_unarchive_assignment",
        "conditional",
        "Assignment lifecycle guards pass"
      ),
      expectation("manage_assignment_ownership", "allowed")
    ]
  },
  {
    id: "completed-faculty-assignment-authority",
    scenario: "normally_completed_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { termLifecycle: "archived", historicalRelationship: "completed_normally" },
    expectations: [
      expectation("create_assignment", "not_allowed"),
      expectation("edit_shared_assignment_definition", "read_only"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation("manage_assignment_ownership", "not_allowed")
    ]
  },
  {
    id: "removed-coordinator-assignment-authority",
    scenario: "former_coordinator_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("create_assignment", "not_allowed"),
      expectation("edit_shared_assignment_definition", "read_only"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation("manage_assignment_ownership", "not_allowed")
    ]
  },
  {
    id: "completed-coordinator-assignment-authority",
    scenario: "normally_completed_historical_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { termLifecycle: "archived", historicalRelationship: "completed_normally" },
    expectations: [
      expectation("create_assignment", "not_allowed"),
      expectation("edit_shared_assignment_definition", "read_only"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation(
        "archive_unarchive_assignment",
        "conditional",
        "Explicit audited Archived-term exceptional correction"
      ),
      expectation(
        "manage_assignment_ownership",
        "conditional",
        "Explicit audited exceptional ownership repair"
      )
    ]
  },
  {
    id: "fallback-assignment-boundary",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    expectations: [
      expectation("create_assignment", "not_allowed"),
      expectation(
        "edit_shared_assignment_definition",
        "read_only",
        "Visible for recovery, not editable by fallback role"
      ),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation(
        "manage_assignment_ownership",
        "conditional",
        "Coordinator handoff recovery only, not routine ownership management"
      )
    ]
  },
  {
    id: "unrelated-history-assignment-boundary",
    scenario: "unrelated_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.assignmentAuthority,
    qualifier: { termLifecycle: "archived", targetScope: "another_section" },
    expectations: [
      expectation("create_assignment", "not_allowed"),
      expectation("edit_shared_assignment_definition", "not_visible"),
      expectation("delete_draft_assignment", "not_allowed"),
      expectation("activate_assignment", "not_allowed"),
      expectation("archive_unarchive_assignment", "not_allowed"),
      expectation("manage_assignment_ownership", "not_allowed")
    ]
  },
  {
    id: "current-faculty-section-assignment",
    scenario: "current_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "own_section",
      termLifecycle: "active",
      assignmentLifecycle: "active"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "own_scope"),
      expectation(
        "mark_assignment_not_using",
        "conditional",
        "Own section and no provisioning has ever occurred"
      ),
      expectation("apply_provision", "conditional", "Own section; term and assignment are Active"),
      expectation("adopt_review_assignment_update", "own_scope"),
      expectation(
        "propagate_student_repository_update",
        "conditional",
        "Own section after explicit reviewed file/repository selection"
      ),
      ...gradingActions.map((action) => expectation(action, "own_scope")),
      expectation("correct_student_identity", "own_scope"),
      expectation(
        "replace_student_github_account",
        "conditional",
        "Own section with explicit faculty confirmation"
      ),
      expectation("remove_drop_student", "own_scope")
    ]
  },
  {
    id: "cofaculty-section-assignment",
    scenario: "current_cofaculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "own_section",
      termLifecycle: "active",
      assignmentLifecycle: "active"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "own_scope"),
      expectation(
        "mark_assignment_not_using",
        "conditional",
        "Shared own section and no provisioning has ever occurred"
      ),
      expectation(
        "apply_provision",
        "conditional",
        "Shared own section; term and assignment are Active"
      ),
      expectation("adopt_review_assignment_update", "own_scope"),
      expectation(
        "propagate_student_repository_update",
        "conditional",
        "Shared own section after explicit reviewed selection"
      ),
      ...gradingActions.map((action) => expectation(action, "own_scope")),
      expectation("correct_student_identity", "own_scope"),
      expectation(
        "replace_student_github_account",
        "conditional",
        "Shared own section with explicit faculty confirmation"
      ),
      expectation("remove_drop_student", "own_scope")
    ]
  },
  {
    id: "other-section-assignment-isolation",
    scenario: "current_other_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "another_section",
      termLifecycle: "active",
      assignmentLifecycle: "active"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "not_visible"),
      expectation("mark_assignment_not_using", "not_visible"),
      expectation("apply_provision", "not_visible"),
      expectation("adopt_review_assignment_update", "not_visible"),
      expectation("propagate_student_repository_update", "not_visible"),
      ...gradingActions.map((action) => expectation(action, "not_visible")),
      expectation("correct_student_identity", "not_visible"),
      expectation("replace_student_github_account", "not_visible"),
      expectation("remove_drop_student", "not_visible")
    ]
  },
  {
    id: "teaching-coordinator-section-assignment",
    scenario: "current_coordinator_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "own_section",
      coordinatorScope: "section_focused",
      termLifecycle: "active",
      assignmentLifecycle: "active"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "own_scope"),
      expectation(
        "mark_assignment_not_using",
        "conditional",
        "Own section and no provisioning has ever occurred"
      ),
      expectation("apply_provision", "conditional", "Own section; term and assignment are Active"),
      expectation("adopt_review_assignment_update", "own_scope"),
      expectation(
        "propagate_student_repository_update",
        "conditional",
        "Own section after explicit reviewed selection"
      ),
      ...gradingActions.map((action) => expectation(action, "own_scope")),
      expectation("correct_student_identity", "own_scope"),
      expectation(
        "replace_student_github_account",
        "conditional",
        "Own section with explicit faculty confirmation"
      ),
      expectation("remove_drop_student", "own_scope")
    ]
  },
  {
    id: "nonteaching-coordinator-section-assignment",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "another_section",
      coordinatorScope: "section_focused",
      termLifecycle: "active",
      assignmentLifecycle: "active"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "coordinator_expansion_required"),
      expectation("mark_assignment_not_using", "coordinator_expansion_required"),
      expectation("apply_provision", "coordinator_expansion_required"),
      expectation("adopt_review_assignment_update", "coordinator_expansion_required"),
      expectation("propagate_student_repository_update", "coordinator_expansion_required"),
      ...gradingActions.map((action) => expectation(action, "coordinator_expansion_required")),
      expectation("correct_student_identity", "coordinator_expansion_required"),
      expectation("replace_student_github_account", "coordinator_expansion_required"),
      expectation("remove_drop_student", "coordinator_expansion_required")
    ]
  },
  {
    id: "removed-faculty-section-assignment",
    scenario: "former_section_faculty_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: { targetScope: "own_section", historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("set_section_due_date_late_policy", "read_only"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "read_only"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation("correct_student_identity", "not_allowed"),
      expectation("replace_student_github_account", "not_allowed"),
      expectation("remove_drop_student", "not_allowed")
    ]
  },
  {
    id: "completed-faculty-archived-grading",
    scenario: "normally_completed_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "own_section",
      termLifecycle: "archived",
      assignmentLifecycle: "archived",
      historicalRelationship: "completed_normally"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "read_only"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      ...gradingActions.map((action) => expectation(action, "own_scope")),
      expectation("correct_student_identity", "not_allowed"),
      expectation("replace_student_github_account", "not_allowed"),
      expectation("remove_drop_student", "not_allowed")
    ]
  },
  {
    id: "removed-coordinator-section-assignment",
    scenario: "former_coordinator_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: { targetScope: "whole_term", historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("set_section_due_date_late_policy", "read_only"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "read_only"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation("correct_student_identity", "not_allowed"),
      expectation("replace_student_github_account", "not_allowed"),
      expectation("remove_drop_student", "not_allowed")
    ]
  },
  {
    id: "completed-coordinator-archived-grading",
    scenario: "normally_completed_historical_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "whole_term",
      termLifecycle: "archived",
      assignmentLifecycle: "archived",
      historicalRelationship: "completed_normally"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "read_only"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      ...gradingActions.map((action) => expectation(action, "allowed")),
      expectation(
        "correct_student_identity",
        "conditional",
        "Explicit audited Archived-term exceptional correction"
      ),
      expectation(
        "replace_student_github_account",
        "conditional",
        "Explicit audited Archived-term exceptional correction"
      ),
      expectation(
        "remove_drop_student",
        "conditional",
        "Explicit audited Archived-term exceptional correction"
      )
    ]
  },
  {
    id: "fallback-grading-boundary",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: { targetScope: "another_section" },
    expectations: [
      expectation("set_section_due_date_late_policy", "not_visible"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "not_visible"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation(
        "correct_student_identity",
        "conditional",
        "Explicit exceptional administrative correction; no ordinary student access"
      ),
      expectation(
        "replace_student_github_account",
        "conditional",
        "Explicit exceptional administrative correction; no ordinary student access"
      ),
      expectation(
        "remove_drop_student",
        "conditional",
        "Explicit exceptional administrative correction; no ordinary student access"
      )
    ]
  },
  {
    id: "draft-faculty-section-assignment",
    scenario: "draft_term_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: { targetScope: "own_section", termLifecycle: "draft", assignmentLifecycle: "draft" },
    expectations: [
      expectation("set_section_due_date_late_policy", "own_scope"),
      expectation("mark_assignment_not_using", "own_scope"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "own_scope"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "not_allowed"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation("correct_student_identity", "own_scope"),
      expectation(
        "replace_student_github_account",
        "conditional",
        "Own Draft roster with explicit faculty confirmation"
      ),
      expectation("remove_drop_student", "own_scope")
    ]
  },
  {
    id: "draft-coordinator-section-assignment",
    scenario: "draft_term_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "whole_term",
      termLifecycle: "draft",
      assignmentLifecycle: "draft",
      coordinatorScope: "section_focused"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "coordinator_expansion_required"),
      expectation("mark_assignment_not_using", "coordinator_expansion_required"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "coordinator_expansion_required"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "not_allowed"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation("correct_student_identity", "coordinator_expansion_required"),
      expectation("replace_student_github_account", "coordinator_expansion_required"),
      expectation("remove_drop_student", "coordinator_expansion_required")
    ]
  },
  {
    id: "owner-section-assignment-boundary",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: { assignmentRelationship: "owner", targetScope: "another_section" },
    expectations: [
      expectation("set_section_due_date_late_policy", "not_allowed"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "not_visible"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation("correct_student_identity", "not_allowed"),
      expectation("replace_student_github_account", "not_allowed"),
      expectation("remove_drop_student", "not_allowed")
    ]
  },
  {
    id: "unrelated-history-section-assignment",
    scenario: "unrelated_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: {
      targetScope: "another_section",
      termLifecycle: "archived",
      assignmentLifecycle: "archived"
    },
    expectations: [
      expectation("set_section_due_date_late_policy", "not_visible"),
      expectation("mark_assignment_not_using", "not_visible"),
      expectation("apply_provision", "not_visible"),
      expectation("adopt_review_assignment_update", "not_visible"),
      expectation("propagate_student_repository_update", "not_visible"),
      ...gradingActions.map((action) => expectation(action, "not_visible")),
      expectation("correct_student_identity", "not_visible"),
      expectation("replace_student_github_account", "not_visible"),
      expectation("remove_drop_student", "not_visible")
    ]
  },
  {
    id: "editor-section-assignment-boundary",
    scenario: "assignment_editor_not_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.sectionAssignmentGrading,
    qualifier: { assignmentRelationship: "editor_only", targetScope: "another_section" },
    expectations: [
      expectation("set_section_due_date_late_policy", "not_allowed"),
      expectation("mark_assignment_not_using", "not_allowed"),
      expectation("apply_provision", "not_allowed"),
      expectation("adopt_review_assignment_update", "not_allowed"),
      expectation("propagate_student_repository_update", "not_allowed"),
      expectation("see_grading_student_state", "not_visible"),
      expectation("grade", "not_allowed"),
      expectation("regrade", "not_allowed"),
      expectation("mark_complete", "not_allowed"),
      expectation("publish_republish_report", "not_allowed"),
      expectation("correct_student_identity", "not_allowed"),
      expectation("replace_student_github_account", "not_allowed"),
      expectation("remove_drop_student", "not_allowed")
    ]
  },
  {
    id: "current-faculty-comments",
    scenario: "current_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "cofaculty-comments",
    scenario: "current_cofaculty",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "other-section-faculty-comments",
    scenario: "current_other_section_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "coordinator-comments",
    scenario: "current_coordinator_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "allowed")
    ]
  },
  {
    id: "nonteaching-coordinator-comments",
    scenario: "current_coordinator_not_teaching_target",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "active" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "allowed")
    ]
  },
  {
    id: "draft-faculty-comments",
    scenario: "draft_term_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "draft" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "draft-coordinator-comments",
    scenario: "draft_term_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "draft" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "allowed"),
      expectation("edit_delete_own_reusable_comment", "allowed"),
      expectation("edit_delete_another_faculty_comment", "allowed")
    ]
  },
  {
    id: "historical-faculty-comments",
    scenario: "normally_completed_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "archived", historicalRelationship: "completed_normally" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "historical-coordinator-comments",
    scenario: "normally_completed_historical_coordinator",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { termLifecycle: "archived", historicalRelationship: "completed_normally" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "removed-faculty-comments",
    scenario: "former_section_faculty_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "removed-coordinator-comments",
    scenario: "former_coordinator_removed_mid_term",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { historicalRelationship: "removed_mid_term" },
    expectations: [
      expectation("use_shared_reusable_comments", "allowed"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "fallback-comments-boundary",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    expectations: [
      expectation("use_shared_reusable_comments", "not_visible"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "owner-comments-boundary",
    scenario: "assignment_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { assignmentRelationship: "owner" },
    expectations: [
      expectation("use_shared_reusable_comments", "not_visible"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "editor-comments-boundary",
    scenario: "assignment_editor_not_owner",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    qualifier: { assignmentRelationship: "editor_only" },
    expectations: [
      expectation("use_shared_reusable_comments", "not_visible"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "unrelated-history-comments",
    scenario: "unrelated_historical_faculty",
    trace: AUTHORIZATION_MATRIX_TRACES.reusableComments,
    expectations: [
      expectation("use_shared_reusable_comments", "not_visible"),
      expectation("create_reusable_comment", "not_allowed"),
      expectation("edit_delete_own_reusable_comment", "not_allowed"),
      expectation("edit_delete_another_faculty_comment", "not_allowed")
    ]
  },
  {
    id: "unrelated-team-protection",
    scenario: "course_fallback_administrator",
    trace: AUTHORIZATION_MATRIX_TRACES.migration,
    expectations: [expectation("modify_unrelated_organization_teams", "not_allowed")]
  }
];

const expandGroup = (group: AuthorizationContractGroup): readonly AuthorizationContractCase[] =>
  group.expectations.map((item) => ({
    id: `${group.id}:${item.action}`,
    scenario: group.scenario,
    action: item.action,
    ...(group.qualifier === undefined ? {} : { qualifier: group.qualifier }),
    expected:
      item.guard === undefined
        ? { decision: item.decision }
        : { decision: item.decision, guard: item.guard },
    trace: group.trace
  }));

export const authorizationContractCases: readonly AuthorizationContractCase[] =
  groups.flatMap(expandGroup);

export interface DeferredAuthorizationDecision {
  readonly action: AuthorizationActionId;
  readonly status: "deferred";
  readonly reason: string;
  readonly trace: AuthorizationMatrixTrace;
}

export const deferredAuthorizationDecisions: readonly DeferredAuthorizationDecision[] = [
  {
    action: "view_organization_migration_plan_status",
    status: "deferred",
    reason:
      "The approved architecture identifies least-privilege candidates but assigns no final role authority.",
    trace: AUTHORIZATION_MATRIX_TRACES.migration
  },
  {
    action: "initiate_organization_migration",
    status: "deferred",
    reason:
      "The approved architecture explicitly defers which role may initiate organization migration.",
    trace: AUTHORIZATION_MATRIX_TRACES.migration
  },
  {
    action: "resume_reconcile_organization_migration",
    status: "deferred",
    reason:
      "The approved architecture explicitly defers authority to resume or reconcile migration.",
    trace: AUTHORIZATION_MATRIX_TRACES.migration
  }
];
