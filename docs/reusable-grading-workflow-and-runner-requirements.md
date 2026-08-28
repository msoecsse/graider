Reusable Grading Workflow and Runner Requirements

1. Purpose
   Graider needs a reusable grading workflow system that lets faculty grade many different kinds of programming assignments without manually writing Graider-specific artifact/reporting logic for every assignment.

The goal is not to force every assignment into one grading model. The goal is to define a standard Graider result contract that can be used by many grading approaches.

Faculty should be able to use:

Java / JUnit / CheckStyle
JavaFX projects
Python / pytest
JavaScript / npm test
C / C++ / make / CMake
Maven
Gradle
GitHub Classroom autograders
custom shell scripts
custom GitHub Actions workflows
future hidden/private grading flows
assignments with no automated grading workflow

Graider should handle the common repository, reporting, and publishing requirements consistently.

2. Core Design Principle
   Graider should standardize the output contract, not the grading implementation.

Every automated grading workflow that wants Graider grading reports must eventually produce:

artifact name: grading-results
result file: grading-results.json

The result file must follow Graider’s grading result schema.

This allows faculty to choose how grading happens while Graider reliably handles:

workflow dispatch
artifact lookup
result parsing
faculty report generation
student report publishing

Graider must also support assignments where automated grading is disabled. In those cases, repository management, reporting, and optional student report publishing should still work.

3. Required Graider Result Contract
   Every Graider-compatible automated grading workflow must upload a GitHub Actions artifact with:

artifact: grading-results
result_file: grading-results.json

The result file must contain valid JSON:

{
"schema_version": 1,
"status": "passed",
"checks": [
{
"name": "CheckStyle",
"status": "passed"
},
{
"name": "Unit Tests",
"status": "passed"
}
]
}

Allowed overall statuses:

passed
failed
skipped

Allowed check statuses:

passed
failed
skipped

Graider should reject invalid status values and report clear diagnostics.

4. Supported Workflow Modes
   Graider should support four workflow modes.

4.1 Preset Workflow Mode
Graider generates a complete grade.yml for a known assignment type.

Example:

grading:
enabled: true
mode: preset
preset: java-junit-checkstyle

Preset workflows are useful for common course patterns.

Initial preset:

java-junit-checkstyle

Future presets may include:

java-junit
javafx-junit
python-pytest
node-npm-test
maven-test
gradle-test
c-make
custom-command

4.2 Custom Workflow with Graider Result Step
Faculty provide their own grade.yml, but Graider supplies a standard result-writing step that can be inserted into that workflow.

Example:

grading:
enabled: true
mode: custom-workflow
workflow: .github/workflows/grade.yml
artifact: grading-results
result_file: grading-results.json

In this mode, faculty control setup, dependencies, test execution, and custom logic, but Graider validates that the workflow:

has workflow_dispatch
uploads the expected artifact
produces valid grading-results.json

4.3 Fully Custom Contract Mode
Faculty write the entire workflow themselves.

Graider only requires that the workflow produces the expected artifact and result file.

Example:

grading:
enabled: true
mode: contract-only
workflow: .github/workflows/grade.yml
artifact: grading-results
result_file: grading-results.json

This mode gives maximum flexibility while preserving compatibility with Graider reports.

4.4 No-Grading Mode
Graider must support assignments with no automated grading workflow.

Example:

grading:
enabled: false

This mode is for assignments such as:

manual review assignments
project milestones
design documents
presentations
participation/lab setup tasks
assignments graded directly in an LMS
assignments where faculty only want repository creation/access management

Expected behavior:

validate -> succeeds without requiring workflow/artifact/result_file
apply -> creates repos and permissions normally
grade -> no-op success with result_status not_configured and no workflow dispatch
report -> generates reports with grading status not_configured
publish -> may still publish Graider-generated or faculty-provided student reports if configured

Automated grading must be optional. Repository management, reporting, and student report publishing must remain usable for assignments with no grading workflow.

5. Assignment Configuration Requirements
   Preset grading example:

grading:
enabled: true
mode: preset
preset: java-junit-checkstyle
workflow: .github/workflows/grade.yml
artifact: grading-results
result_file: grading-results.json

Custom workflow example:

grading:
enabled: true
mode: custom-workflow
workflow: .github/workflows/grade.yml
artifact: grading-results
result_file: grading-results.json

Contract-only example:

grading:
enabled: true
mode: contract-only
workflow: .github/workflows/grade.yml
artifact: grading-results
result_file: grading-results.json

No-grading example:

grading:
enabled: false

6. Workflow Generation Requirements
   Graider should provide a command to generate a starter workflow.

Proposed command:

graider workflow generate terms/27s1/assignments/lab01/assignment.yml

The command should generate a workflow file such as:

terms/27s1/generated-workflows/lab01/grade.yml

or optionally write directly to a template repository working tree when explicitly requested.

Current implementation status:

graider workflow generate terms/27s1/assignments/lab01/assignment.yml

generates the first local preset workflow for:

java-junit-checkstyle

The command writes only to the local filesystem. It does not write to GitHub,
commit to template repositories, or overwrite existing files unless explicitly
requested with --force.

The generated workflow must include:

on:

- push
- repository_dispatch
- workflow_dispatch

It must also include a reliable Graider result writer that always uploads:

grading-results.json

even when grading checks fail.

Current generated workflows embed a self-contained Python helper during the
workflow run:

.graider/write-grading-result.py

The helper writes:

graider-output/grading-results.json

and the workflow uploads that file as the configured grading artifact. The
student repository does not need Graider installed, does not need npm
dependencies for Graider, and does not need access to the course-admin
repository.

Workflow generation should not be required for custom workflows or no-grading assignments.

7. Custom Workflow Support Requirements
   Faculty must be able to write their own GitHub Actions workflow.

Graider should not require faculty to use generated workflows.

For custom workflows, Graider should provide:

documentation
copyable result-writer snippets
validation checks
clear diagnostics
examples

Graider should validate that the custom workflow is compatible with the configured grading contract.

Validation should check:

workflow file exists
workflow_dispatch is present
configured artifact name is present or likely present
configured result file path is documented or verified after a run
result file parses as valid Graider JSON after grading

Static validation may not be able to prove every custom workflow is correct, so report-time diagnostics must remain clear.

8. Result Writer Requirements
   Graider should provide a standard result writer for custom workflows.

The result writer should:

map workflow/check outcomes to passed / failed / skipped
write valid JSON
avoid shell heredoc formatting bugs
upload the expected artifact
work even when checks fail
avoid including raw logs unless explicitly configured

The preferred implementation should avoid fragile shell heredocs.

A Python or Node-based result writer is acceptable inside GitHub Actions if it is generated or provided by Graider, even though Graider itself remains TypeScript/Node.

Current generated workflows use a Python standard-library helper rather than a
Graider CLI call inside student repositories. The helper accepts named
`name=outcome` checks, creates the output directory, maps unknown or missing
outcomes to `failed`, and writes the Graider result schema. For GitHub Classroom
grader steps, the helper can also accept a base64 `outputs.result` payload plus
the step outcome, decode the Classroom JSON, prefer the internal Classroom
status, and fall back to the step outcome only when the payload is unavailable
or unparseable. This is an embedded workflow helper, not a reusable GitHub
Action package.

Long-term, the result writer could become:

a checked-in script
a reusable GitHub Action
an npm package
a Graider CLI subcommand

9. Faculty-Provided Student Report Publishing
   Faculty may want to generate their own student-facing reports.

Graider must support publishing faculty-provided student report files without requiring Graider to generate or understand the report content.

Artifact-based faculty-provided report publishing is implemented. In this mode,
Graider does not create the report content. It only:

finds the configured report file
verifies that the file exists
publishes it to the correct student repository path
ensures only that student's report is published to that student's repo
reports clear diagnostics if the file is missing

Example configuration:

reports:
student_publish:
enabled: true
mode: faculty-provided
artifact: grading-results
source_file: student-report.md
destination_file: grading/report.md

If the workflow writes the report inside a folder:

reports:
student_publish:
enabled: true
mode: faculty-provided
artifact: grading-results
source_file: graider-output/student-report.md
destination_file: grading/report.md

Supported publishing modes should include:

graider-generated
faculty-provided
both
disabled

Example for Graider-generated student reports:

reports:
student_publish:
enabled: true
mode: graider-generated
destination_file: grading/report.md

Example for both:

reports:
student_publish:
enabled: true
mode: both
graider_report_destination: grading/graider-report.md
artifact: grading-results
faculty_report_source: graider-output/student-report.md
faculty_report_destination: grading/report.md

Graider should not parse grades from faculty-provided reports. The source of truth for faculty summaries remains:

grading-results.json

Faculty-provided reports are student-facing feedback documents only.

10. No-Grading Assignment Publishing
    No-grading assignments may still publish reports.

Graider must support these combinations:

No automated grading, no student reports
No automated grading, Graider-generated placeholder reports
No automated grading, faculty-provided student reports from a future local source
Automated grading, Graider-generated reports
Automated grading, faculty-provided reports
Automated grading, both reports

Example:

grading:
enabled: false

reports:
student_publish:
enabled: true
mode: faculty-provided
source: local
source_file: terms/27s1/reports/lab01/students/{section}/{student_id}.md
destination_file: grading/report.md

Local-source faculty-provided reports are future work. Current runtime support
copies faculty-provided student reports from the configured GitHub Actions
artifact.

Artifact-based faculty-provided reports require a workflow artifact source. For
no-grading assignments without a workflow run, Graider reports the configured
student report artifact as missing rather than attempting to synthesize report
content.

If no grading workflow exists, Graider should not require:

workflow
artifact
result_file

unless those fields are needed for faculty-provided report publishing from an artifact.

11. Validation Requirements
    graider validate should check grading and publishing configuration.

It should detect:

missing workflow path when grading is enabled
workflow without workflow_dispatch when grading is enabled
missing artifact configuration when grading requires artifacts
missing result_file configuration when grading requires result parsing
unsupported grading mode
unsupported preset
invalid status vocabulary in existing result files
template repo missing configured workflow
invalid student publish mode
missing faculty-provided source_file
missing publish destination_file
incompatible no-grading configuration

It should not block custom workflows merely because Graider cannot understand every custom grading command.

Current static validation is intentionally conservative. `graider validate`
checks that grading-enabled assignments configure a workflow, artifact, and
result file; that the workflow file is locally available; and that the workflow
declares `workflow_dispatch`. For preset workflows, the generated local workflow
path under `terms/<term>/generated-workflows/<assignment>/grade.yml` is accepted
as a local validation source.

Static validation does not fully prove that a custom workflow uploads the
configured artifact, writes the configured result file, or produces semantically
correct grades. Those cases remain runtime report diagnostics after a workflow
run.

Validation should distinguish between:

static workflow compatibility
runtime artifact/result availability
invalid result schema
missing artifact
missing result file
missing faculty-provided student report
missing publish destination

12. Reporting Requirements
    Graider reports should continue to use the standard result contract when automated grading is enabled.

For each active student, reports should show:

repository status
workflow status
artifact status
result file status
result status
checks
errors
warnings
student report publish status

Report diagnostics should clearly distinguish:

missing workflow
workflow dispatch failed
workflow completed but artifact missing
artifact found but result file missing
result file found but invalid
result file valid and passed
result file valid and failed
grading not configured
faculty-provided report missing
student report publish failed
student report published

For no-grading assignments, reports should show:

result_status: not_configured
workflow_status: not_configured
artifact_status: not_checked

or equivalent stable values.

13. Student Report Publishing Requirements
    Student report publishing should support both Graider-generated and faculty-provided reports.

Published student reports must include only that student’s information.

Student reports must not include:

other students' results
faculty summary data
raw private logs unless intentionally included by faculty in a faculty-provided report
GitHub tokens or secrets

For faculty-provided reports, Graider should not modify the contents except for publishing them to the configured destination.

Publishing diagnostics should distinguish:

student_report_published
student_report_artifact_missing
student_report_source_missing
student_report_repository_missing
student_report_publish_failed
student_report_publish_skipped

14. Initial Supported Preset
    The first preset should support the workflow already proven in live testing:

Java 25 + JavaFX + CheckStyle + JUnit Console

This preset should be treated as a default example, not as the only supported grading model.

The preset should support configuration for:

grading:
mode: preset
preset: java-junit-checkstyle
java:
version: "25"
distribution: oracle
javafx: true
checks:
checkstyle: true
unit_tests: true

Exact schema can be refined during implementation.

15. Out of Scope for First Slice
    The first slice should not implement:

full web UI
LMS integration
hidden/private grading
Dockerized grading
automatic migration of existing custom workflows
support for every language/framework
gradebook synchronization
student submission locking
archive/remove-access behavior

16. Acceptance Criteria
    This feature is ready when:

[ ] Graider documents the standard grading result contract.
[ ] Graider supports preset, custom-workflow, contract-only, and no-grading modes.
[ ] Graider can generate a known-good grade.yml for at least one preset.
[ ] The generated workflow produces valid grading-results.json.
[ ] The generated workflow uploads the grading-results artifact.
[ ] validate checks workflow compatibility.
[ ] custom workflows can be used without adopting Graider’s full generated workflow.
[ ] no-grading assignments can validate, apply, report, and optionally publish reports.
[ ] faculty-provided student reports can be published when configured.
[ ] missing faculty-provided reports produce clear diagnostics.
[ ] invalid result JSON produces clear diagnostics.
[ ] invalid status values produce clear diagnostics.
[ ] report works the same regardless of whether grading used a preset or custom workflow.
[ ] student report publishing works from the standard result contract.

17. Recommended Implementation Slices
    Slice 1 — Document the grading result contract
    Create documentation for the standard artifact, result file, status vocabulary, supported grading modes, no-grading mode, and student report publishing modes.

Slice 2 — Add grading mode schema
Extend config validation to support:

preset
custom-workflow
contract-only
no-grading

Slice 3 — Add Java/JUnit/CheckStyle preset workflow generation
Generate a workflow equivalent to the current working live-tested workflow.

Slice 4 — Add workflow validation
Check workflow path, workflow dispatch support, artifact config, and result file config when grading is enabled.

Slice 5 — Add reusable result writer
Replace fragile per-workflow JSON generation snippets with a reusable Graider result writer.

Slice 6 — Add faculty-provided student report publishing
Support publishing configured faculty-provided report files from artifact paths.
Local source paths can be added in a later slice.

Slice 7 — Add no-grading assignment support
Ensure assignments with grading.enabled: false can validate, apply, report, and publish configured reports.

Slice 8 — Add examples
Reusable grading examples live under:

```text
examples/grading/
```

They provide copyable faculty-facing examples for:

Java/JUnit/CheckStyle
custom shell command
GitHub Classroom autograder integration
contract-only workflow
faculty-provided student report
no-grading assignment with manual report publishing
