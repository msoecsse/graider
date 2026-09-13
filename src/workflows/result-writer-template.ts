const RESULT_SCHEMA_VERSION = 1;
const RESULT_SCHEMA_VERSION_TEXT = String(RESULT_SCHEMA_VERSION);

export const RESULT_WRITER_SCRIPT_PATH = ".graider/write-grading-result.py";

export const renderGradingResultWriterScript = (): string => `#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys

SCHEMA_VERSION = ${RESULT_SCHEMA_VERSION_TEXT}
STATUS_PASSED = "passed"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"
STATUS_MAP = {
    "pass": STATUS_PASSED,
    "passed": STATUS_PASSED,
    "success": STATUS_PASSED,
    "fail": STATUS_FAILED,
    "failed": STATUS_FAILED,
    "failure": STATUS_FAILED,
    "error": STATUS_FAILED,
    "cancelled": STATUS_FAILED,
    "timed_out": STATUS_FAILED,
    "timed-out": STATUS_FAILED,
    "skip": STATUS_SKIPPED,
    "skipped": STATUS_SKIPPED,
}
EVIDENCE_OUTCOME_SUCCESS = "success"
EVIDENCE_OUTCOME_FAILURE = "failure"
EVIDENCE_OUTCOME_SKIPPED = "skipped"
EVIDENCE_OUTCOME_MAP = {
    "success": EVIDENCE_OUTCOME_SUCCESS,
    "failure": EVIDENCE_OUTCOME_FAILURE,
    "cancelled": EVIDENCE_OUTCOME_FAILURE,
    "timed_out": EVIDENCE_OUTCOME_FAILURE,
    "timed-out": EVIDENCE_OUTCOME_FAILURE,
    "skipped": EVIDENCE_OUTCOME_SKIPPED,
}


def map_status(value):
    normalized = (value or "").strip().lower()
    return STATUS_MAP.get(normalized, STATUS_FAILED)


def map_evidence_outcome(value):
    normalized = (value or "").strip().lower()
    if not normalized:
        return EVIDENCE_OUTCOME_SKIPPED
    return EVIDENCE_OUTCOME_MAP.get(normalized, EVIDENCE_OUTCOME_FAILURE)


def decode_classroom_result(encoded):
    if not encoded:
        return None

    try:
        decoded_bytes = base64.b64decode(encoded)
        decoded_text = decoded_bytes.decode("utf-8")
        return json.loads(decoded_text)
    except Exception:
        return None


def status_from_classroom_or_outcome(classroom_env_name, outcome_env_name):
    classroom_result = decode_classroom_result(os.environ.get(classroom_env_name))

    if isinstance(classroom_result, dict):
        top_level_status = classroom_result.get("status")
        if top_level_status:
            return map_status(top_level_status)

        tests = classroom_result.get("tests")
        if isinstance(tests, list) and tests:
            test_statuses = [
                map_status(test.get("status"))
                for test in tests
                if isinstance(test, dict)
            ]

            if STATUS_FAILED in test_statuses:
                return STATUS_FAILED

            if test_statuses and all(status == STATUS_SKIPPED for status in test_statuses):
                return STATUS_SKIPPED

            if test_statuses:
                return STATUS_PASSED

    return map_status(os.environ.get(outcome_env_name))


def parse_check(raw_check):
    name, separator, outcome = raw_check.partition("=")
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("check name must not be empty")
    normalized_outcome = outcome if separator else ""
    return {
        "name": normalized_name,
        "status": map_status(normalized_outcome),
    }


def parse_classroom_check(raw_check):
    name, separator, env_names = raw_check.partition("=")
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("check name must not be empty")
    if not separator:
        raise ValueError("classroom check must include environment variable names")
    classroom_env_name, env_separator, outcome_env_name = env_names.partition(":")
    if not env_separator or not classroom_env_name.strip() or not outcome_env_name.strip():
        raise ValueError("classroom check must include classroom and outcome environment names")
    return {
        "name": normalized_name,
        "status": status_from_classroom_or_outcome(
            classroom_env_name.strip(),
            outcome_env_name.strip(),
        ),
    }


def parse_evidence_outcome(raw_outcome):
    name, separator, outcome = raw_outcome.partition("=")
    normalized_name = name.strip()
    if not separator or not normalized_name:
        raise ValueError("evidence outcome must include a phase")
    return normalized_name, map_evidence_outcome(outcome)


def compute_overall_status(checks):
    if not checks:
        return STATUS_SKIPPED
    statuses = [check["status"] for check in checks]
    if STATUS_FAILED in statuses:
        return STATUS_FAILED
    if all(status == STATUS_SKIPPED for status in statuses):
        return STATUS_SKIPPED
    return STATUS_PASSED


def write_result(output_path, checks):
    parent = os.path.dirname(output_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    result = {
        "schema_version": SCHEMA_VERSION,
        "status": compute_overall_status(checks),
        "checks": checks,
    }
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(result, output_file, indent=2)
        output_file.write("\\n")


def write_evidence_metadata(output_path, submission_commit_sha, workflow_run_id, workflow_run_attempt, outcomes):
    parent = os.path.dirname(output_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    metadata = {
        "schemaVersion": SCHEMA_VERSION,
        "submissionCommitSha": submission_commit_sha,
        "workflowRunId": workflow_run_id,
        "workflowRunAttempt": workflow_run_attempt,
        "compile": {"outcome": outcomes.get("compile", EVIDENCE_OUTCOME_SKIPPED)},
        "junit": {"outcome": outcomes.get("junit", EVIDENCE_OUTCOME_SKIPPED)},
        "checkstyle": {"outcome": outcomes.get("checkstyle", EVIDENCE_OUTCOME_SKIPPED)},
    }
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(metadata, output_file, indent=2)
        output_file.write("\\n")


def main(argv):
    parser = argparse.ArgumentParser(description="Write Graider grading result JSON.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--check", action="append", default=[])
    parser.add_argument("--classroom-check", action="append", default=[])
    parser.add_argument("--evidence-metadata-output")
    parser.add_argument("--evidence-outcome", action="append", default=[])
    parser.add_argument("--submission-commit-sha", default="")
    parser.add_argument("--workflow-run-id", default="")
    parser.add_argument("--workflow-run-attempt", default="")
    args = parser.parse_args(argv)

    try:
        checks = [
            *[parse_check(raw_check) for raw_check in args.check],
            *[parse_classroom_check(raw_check) for raw_check in args.classroom_check],
        ]
        write_result(args.output, checks)
        if args.evidence_metadata_output:
            write_evidence_metadata(
                args.evidence_metadata_output,
                args.submission_commit_sha,
                args.workflow_run_id,
                args.workflow_run_attempt,
                dict(parse_evidence_outcome(raw_outcome) for raw_outcome in args.evidence_outcome),
            )
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
`;
