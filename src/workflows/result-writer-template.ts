const RESULT_SCHEMA_VERSION = 1;
const RESULT_SCHEMA_VERSION_TEXT = String(RESULT_SCHEMA_VERSION);

export const RESULT_WRITER_SCRIPT_PATH = ".graider/write-grading-result.py";

export const renderGradingResultWriterScript = (): string => `#!/usr/bin/env python3
import argparse
import json
import os
import sys

SCHEMA_VERSION = ${RESULT_SCHEMA_VERSION_TEXT}
STATUS_PASSED = "passed"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"
OUTCOME_MAP = {
    "success": STATUS_PASSED,
    "failure": STATUS_FAILED,
    "cancelled": STATUS_FAILED,
    "skipped": STATUS_SKIPPED,
}


def map_outcome(outcome):
    normalized = (outcome or "").strip().lower()
    return OUTCOME_MAP.get(normalized, STATUS_FAILED)


def parse_check(raw_check):
    name, separator, outcome = raw_check.partition("=")
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("check name must not be empty")
    normalized_outcome = outcome if separator else ""
    return {
        "name": normalized_name,
        "status": map_outcome(normalized_outcome),
    }


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


def main(argv):
    parser = argparse.ArgumentParser(description="Write Graider grading result JSON.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--check", action="append", default=[])
    args = parser.parse_args(argv)

    try:
        checks = [parse_check(raw_check) for raw_check in args.check]
        write_result(args.output, checks)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
`;
