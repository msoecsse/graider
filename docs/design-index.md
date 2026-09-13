# Graider Design Index

Use this index to find the authoritative design and implementation documents before changing Graider. When documents overlap, follow the more specific document; feature specifications take precedence over general architecture guidance for their feature.

## Current Feature Specifications

- [Grading Module Specification](graider-grading-module-specification.md) — authoritative design for the faculty grading workflow, persisted grading state, reports, faculty section access, comment library, and IntelliJ package output.
- [Complete Requirements](graider_complete_requirements.md) — broad product requirements and repository conventions.
- [Reusable Grading Workflow and Runner Requirements](reusable-grading-workflow-and-runner-requirements.md) — GitHub Actions grading-workflow and runner behavior.

## Architecture and Development Contracts

- [MVP Architecture](graider-architecture.md) — system structure, technology choices, command pipeline, and package boundaries.
- [Repository Target Foundation](repository-target-foundation.md) — supported repository and target-layout foundations.
- [Codex Development Contract](codex-development-contract.md) — implementation constraints and development expectations.
- [Backend JSON Command Contract](codex-backend-json-command-contract.md) — JSON interface expectations for backend commands.
- [Error and Warning Catalog](error-warning-catalog.md) — canonical user-facing diagnostic behavior.

## CLI, UI, and Data Contracts

- [CLI JSON Contract](cli-json-contract.md) — CLI JSON output contract.
- [Grading Result Contract](grading-result-contract.md) — grading-result data contract.
- [Electron UI Contract](codex-electron-ui-contract.md) — Electron frontend/backend integration contract.
- [Generated Files](generated-files.md) — generated artifacts and their ownership.

## Implementation Plans and Verification

- [Implementation Plan](graider-implementation-plan.md) — staged implementation plan.
- [Traceability Matrix](graider-traceability-matrix.md) — requirements-to-implementation/test mapping.
- [Test Plan](graider-test-plan.md) — testing strategy and coverage expectations.
- [Runtime](runtime.md) — runtime behavior and operational details.
- [Troubleshooting](troubleshooting.md) — known operational diagnosis guidance.

## Feature-Specific References

- [Configuration Wizard Plan](config-wizard-plan.md)
- [Dashboard Requirements](electron-dashboard-requirements.md)
- [Dashboard Development](electron-dashboard-dev.md)
- [Assignment Detail Development](electron-assignment-detail-dev.md)
- [Grade Dispatch Development](electron-grade-dispatch-dev.md)
- [Grade Status Development](electron-grade-status-dev.md)
- [Faculty Report Development](electron-faculty-report-dev.md)
- [Apply Flow Development](electron-apply-flow-dev.md)
- [Electron Packaging](electron-packaging.md)
- [Electron Release Readiness](electron-release-readiness.md)

## User and Operations Guides

- [Faculty CLI User Guide](faculty-cli-user-guide.md)
- [Faculty UI User Guide](faculty-ui-user-guide.md)
- [GitHub Token Permissions](github-token-permissions.md)
- [Live Testing](live-testing.md)

## Command References

- [Assignment Detail](assignment-detail-command.md)
- [Dashboard](dashboard-command.md)
- [Grade Preview](grade-preview-command.md)
- [Grade Status](grade-status-command.md)
- [Apply Preview](apply-preview-command.md)
