# Contract-Only Workflow

Use this example when faculty or course infrastructure owns the grading workflow
end to end. Graider does not generate or understand the grading implementation;
faculty owns the grading semantics.

Graider only relies on the artifact contract:

- the configured workflow exists
- the workflow supports `workflow_dispatch`
- the configured artifact exists after a run
- the artifact contains the configured `grading-results.json`
- the result JSON validates against Graider's result contract

This mode is useful when grading happens in an external tool, container, hosted
runner, or course-owned action. The included workflow is deliberately generic and
only illustrates the contract file Graider expects.
