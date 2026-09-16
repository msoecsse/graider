import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";
import { renderManagedWorkflowMarker } from "./managed-workflow-policy.js";

export const JAVA_JUNIT_CHECKSTYLE_PRESET = "java-junit-checkstyle";

export interface JavaJunitCheckstyleWorkflowInput {
  readonly grading: EffectiveAssignmentGrading;
}

const DOLLAR_TOKEN = "__GRAIDER_DOLLAR__";

const outputPath = (resultFile: string): string =>
  resultFile.includes("/") ? resultFile : `graider-output/${resultFile}`;

/** Renders the shell-based managed workflow used to grade Java submissions. */
export const renderJavaJunitCheckstyleWorkflow = ({
  grading
}: JavaJunitCheckstyleWorkflowInput): string => {
  const artifact = grading.artifact ?? "grading-results";
  const result = outputPath(grading.result_file ?? "grading-results.json");
  // The token prevents TypeScript from interpreting GitHub and shell expressions.
  const workflow = String.raw`name: AutoGrading Tests

"on":
  push:
    paths-ignore:
      - .github/workflows/grade.yml
  repository_dispatch:
  workflow_dispatch:
    inputs:
      submission_sha:
        description: Canonical student submission commit SHA
        required: false
        type: string

permissions:
  contents: read
  actions: read

jobs:
  run-autograding-tests:
    if: >-
      github.actor != 'github-classroom[bot]' &&
      !(
        github.event_name == 'push' &&
        github.event.before == '0000000000000000000000000000000000000000' &&
        github.ref_name == github.event.repository.default_branch
      )
    runs-on: ubuntu-24.04
    env:
      JAVA_VERSION: "25"
      CHECKSTYLE_VERSION: "14.1.0"
      CHECKSTYLE_CONFIG_URL: "https://csse.msoe.us/csc1110/MSOE_checkStyle.xml"
      JUNIT_PLATFORM_CONSOLE_VERSION: "6.1.2"
      MOCKITO_VERSION: "5.18.0"
      BYTE_BUDDY_VERSION: "1.17.5"
      OBJENESIS_VERSION: "3.3"
      JAVAFX_VERSION: "25.0.2"
      TOOLS_DIR: __GRAIDER_DOLLAR__{{ github.workspace }}/graider-tools
      JAVAFX_LIB: __GRAIDER_DOLLAR__{{ github.workspace }}/graider-tools/javafx
      BUILD_DIR: __GRAIDER_DOLLAR__{{ github.workspace }}/.graider-build
      EVIDENCE_DIR: __GRAIDER_DOLLAR__{{ github.workspace }}/grading-evidence
      OUTPUT_DIR: __GRAIDER_DOLLAR__{{ github.workspace }}/graider-output
      EFFECTIVE_SUBMISSION_SHA: __GRAIDER_DOLLAR__{{ inputs.submission_sha || github.sha }}

    steps:
      - name: Check out repository
        uses: actions/checkout@v7
        with:
          ref: __GRAIDER_DOLLAR__{{ env.EFFECTIVE_SUBMISSION_SHA }}

      - name: Prepare grading directories
        shell: bash
        run: |
          set -euo pipefail
          rm -rf "__GRAIDER_DOLLAR__TOOLS_DIR" "__GRAIDER_DOLLAR__BUILD_DIR" "__GRAIDER_DOLLAR__EVIDENCE_DIR" "__GRAIDER_DOLLAR__OUTPUT_DIR"
          mkdir -p "__GRAIDER_DOLLAR__TOOLS_DIR" "__GRAIDER_DOLLAR__JAVAFX_LIB" "__GRAIDER_DOLLAR__BUILD_DIR" "__GRAIDER_DOLLAR__EVIDENCE_DIR" "__GRAIDER_DOLLAR__OUTPUT_DIR"

      - name: Set up Java
        uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: __GRAIDER_DOLLAR__{{ env.JAVA_VERSION }}

      - name: Install headless JavaFX dependencies
        shell: bash
        run: |
          set -euo pipefail
          sudo apt-get update
          sudo apt-get install -y xvfb libgtk-3-0t64 libasound2t64

      - name: Download grading tools
        id: tools
        shell: bash
        run: |
          set -euo pipefail
          download() {
            local url="__GRAIDER_DOLLAR__1"
            local destination="__GRAIDER_DOLLAR__2"
            echo "Downloading __GRAIDER_DOLLAR__(basename "__GRAIDER_DOLLAR__destination")"
            curl --fail --location --silent --show-error --retry 3 --retry-delay 2 --retry-all-errors --output "__GRAIDER_DOLLAR__destination" "__GRAIDER_DOLLAR__url"
            if [[ ! -s "__GRAIDER_DOLLAR__destination" ]]; then
              echo "::error::Downloaded file is missing or empty: __GRAIDER_DOLLAR__destination"
              return 1
            fi
          }
          download "https://github.com/checkstyle/checkstyle/releases/download/checkstyle-__GRAIDER_DOLLAR__{CHECKSTYLE_VERSION}/checkstyle-__GRAIDER_DOLLAR__{CHECKSTYLE_VERSION}-all.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.jar"
          download "__GRAIDER_DOLLAR__CHECKSTYLE_CONFIG_URL" "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.xml"
          download "https://repo.maven.apache.org/maven2/org/junit/platform/junit-platform-console-standalone/__GRAIDER_DOLLAR__{JUNIT_PLATFORM_CONSOLE_VERSION}/junit-platform-console-standalone-__GRAIDER_DOLLAR__{JUNIT_PLATFORM_CONSOLE_VERSION}.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/junit-platform-console-standalone.jar"
          download "https://repo.maven.apache.org/maven2/org/mockito/mockito-core/__GRAIDER_DOLLAR__{MOCKITO_VERSION}/mockito-core-__GRAIDER_DOLLAR__{MOCKITO_VERSION}.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/mockito-core.jar"
          download "https://repo.maven.apache.org/maven2/net/bytebuddy/byte-buddy/__GRAIDER_DOLLAR__{BYTE_BUDDY_VERSION}/byte-buddy-__GRAIDER_DOLLAR__{BYTE_BUDDY_VERSION}.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy.jar"
          download "https://repo.maven.apache.org/maven2/net/bytebuddy/byte-buddy-agent/__GRAIDER_DOLLAR__{BYTE_BUDDY_VERSION}/byte-buddy-agent-__GRAIDER_DOLLAR__{BYTE_BUDDY_VERSION}.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy-agent.jar"
          download "https://repo.maven.apache.org/maven2/org/objenesis/objenesis/__GRAIDER_DOLLAR__{OBJENESIS_VERSION}/objenesis-__GRAIDER_DOLLAR__{OBJENESIS_VERSION}.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/objenesis.jar"
          for javafx_module in base graphics controls fxml; do
            download "https://repo.maven.apache.org/maven2/org/openjfx/javafx-__GRAIDER_DOLLAR__javafx_module/__GRAIDER_DOLLAR__{JAVAFX_VERSION}/javafx-__GRAIDER_DOLLAR__javafx_module-__GRAIDER_DOLLAR__{JAVAFX_VERSION}-linux.jar" "__GRAIDER_DOLLAR__JAVAFX_LIB/javafx-__GRAIDER_DOLLAR__javafx_module.jar"
          done
          JARS=("__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/junit-platform-console-standalone.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/mockito-core.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy-agent.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/objenesis.jar" "__GRAIDER_DOLLAR__JAVAFX_LIB/javafx-base.jar" "__GRAIDER_DOLLAR__JAVAFX_LIB/javafx-graphics.jar" "__GRAIDER_DOLLAR__JAVAFX_LIB/javafx-controls.jar" "__GRAIDER_DOLLAR__JAVAFX_LIB/javafx-fxml.jar")
          for jar_file in "__GRAIDER_DOLLAR__{JARS[@]}"; do
            if ! jar tf "__GRAIDER_DOLLAR__jar_file" >/dev/null; then echo "::error::Downloaded JAR is invalid: __GRAIDER_DOLLAR__jar_file"; exit 1; fi
          done
          if ! grep -q '<module' "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.xml"; then echo "::error::Downloaded Checkstyle configuration is not valid XML configuration."; exit 1; fi

      - name: CheckStyle
        id: checkstyle
        continue-on-error: true
        shell: bash
        run: |
          set -uo pipefail
          if [[ ! -d src ]]; then echo "::error::Required source directory 'src' does not exist."; exit 1; fi
          mapfile -d '' JAVA_FILES < <(find src -type f -name '*.java' -print0)
          if (( __GRAIDER_DOLLAR__{#JAVA_FILES[@]} == 0 )); then echo "::error::No Java source files were found under src/."; exit 1; fi
          mkdir -p "__GRAIDER_DOLLAR__EVIDENCE_DIR"
          set +e
          java -jar "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.jar" -c "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.xml" "__GRAIDER_DOLLAR__{JAVA_FILES[@]}"; text_status=__GRAIDER_DOLLAR__?
          java -jar "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.jar" -f xml -o "__GRAIDER_DOLLAR__EVIDENCE_DIR/checkstyle.xml" -c "__GRAIDER_DOLLAR__TOOLS_DIR/checkstyle.xml" "__GRAIDER_DOLLAR__{JAVA_FILES[@]}"; xml_status=__GRAIDER_DOLLAR__?
          set -e
          if [[ ! -s "__GRAIDER_DOLLAR__EVIDENCE_DIR/checkstyle.xml" ]]; then echo "::error::Checkstyle did not produce grading-evidence/checkstyle.xml."; exit 1; fi
          if (( text_status != 0 || xml_status != 0 )); then exit 1; fi

      - name: Compile Java sources
        id: compile
        continue-on-error: true
        shell: bash
        run: |
          set -euo pipefail
          SOURCE_ROOTS=()
          if [[ -d src ]]; then SOURCE_ROOTS+=(src); fi
          if [[ -d test ]]; then SOURCE_ROOTS+=(test); fi
          if [[ -d tests ]]; then SOURCE_ROOTS+=(tests); fi
          if (( __GRAIDER_DOLLAR__{#SOURCE_ROOTS[@]} == 0 )); then echo "::error::No Java source roots were found. Expected src/, test/, or tests/."; exit 1; fi
          mapfile -d '' JAVA_FILES < <(find "__GRAIDER_DOLLAR__{SOURCE_ROOTS[@]}" -type f -name '*.java' -print0)
          if (( __GRAIDER_DOLLAR__{#JAVA_FILES[@]} == 0 )); then echo "::error::No Java source files were found."; exit 1; fi
          REPOSITORY_JARS=()
          if [[ -d lib ]]; then mapfile -d '' REPOSITORY_JARS < <(find lib -type f -name '*.jar' -print0); fi
          CLASSPATH_PARTS=("__GRAIDER_DOLLAR__TOOLS_DIR/junit-platform-console-standalone.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/mockito-core.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy-agent.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/objenesis.jar" "__GRAIDER_DOLLAR__{REPOSITORY_JARS[@]}")
          CLASSPATH=__GRAIDER_DOLLAR__(IFS=:; echo "__GRAIDER_DOLLAR__{CLASSPATH_PARTS[*]}")
          rm -rf "__GRAIDER_DOLLAR__BUILD_DIR"
          mkdir -p "__GRAIDER_DOLLAR__BUILD_DIR"
          javac --module-path "__GRAIDER_DOLLAR__JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -cp "__GRAIDER_DOLLAR__CLASSPATH" -d "__GRAIDER_DOLLAR__BUILD_DIR" "__GRAIDER_DOLLAR__{JAVA_FILES[@]}"

      - name: Unit Tests
        id: unittests
        if: steps.compile.outcome == 'success'
        continue-on-error: true
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p "__GRAIDER_DOLLAR__EVIDENCE_DIR/junit"
          REPOSITORY_JARS=()
          if [[ -d lib ]]; then mapfile -d '' REPOSITORY_JARS < <(find lib -type f -name '*.jar' -print0); fi
          TEST_CLASSPATH_PARTS=("__GRAIDER_DOLLAR__BUILD_DIR" "__GRAIDER_DOLLAR__TOOLS_DIR/mockito-core.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/byte-buddy-agent.jar" "__GRAIDER_DOLLAR__TOOLS_DIR/objenesis.jar" "__GRAIDER_DOLLAR__{REPOSITORY_JARS[@]}")
          TEST_CLASSPATH=__GRAIDER_DOLLAR__(IFS=:; echo "__GRAIDER_DOLLAR__{TEST_CLASSPATH_PARTS[*]}")
          TAG_ARGS=()
          JUNIT_TAGS_PRESENT=false
          while IFS= read -r -d '' class_file; do
            if grep -a -q -E 'org/junit/jupiter/api/Tag(s)?' "__GRAIDER_DOLLAR__class_file"; then
              JUNIT_TAGS_PRESENT=true
              break
            fi
          done < <(find "__GRAIDER_DOLLAR__BUILD_DIR" -type f -name '*.class' -print0)
          if [[ "__GRAIDER_DOLLAR__JUNIT_TAGS_PRESENT" == true ]]; then
            COMMIT_MSG=__GRAIDER_DOLLAR__(git log -1 --pretty=%s "__GRAIDER_DOLLAR__EFFECTIVE_SUBMISSION_SHA")
            case "__GRAIDER_DOLLAR__COMMIT_MSG" in
              COMMIT[0-9]*|DONE[0-9]*) TAG="__GRAIDER_DOLLAR__{COMMIT_MSG%% *}"; TAG_ARGS=(--include-tag "__GRAIDER_DOLLAR__TAG");;
            esac
          fi
          xvfb-run -a -s "-screen 0 1280x1024x24" java -Dprism.order=sw --module-path "__GRAIDER_DOLLAR__JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -jar "__GRAIDER_DOLLAR__TOOLS_DIR/junit-platform-console-standalone.jar" execute "__GRAIDER_DOLLAR__{TAG_ARGS[@]}" --scan-class-path --class-path "__GRAIDER_DOLLAR__TEST_CLASSPATH" --reports-dir "__GRAIDER_DOLLAR__EVIDENCE_DIR/junit" --fail-if-no-tests

      - name: Write Graider grading result and evidence metadata
        if: always()
        shell: bash
        env:
          CHECKSTYLE_OUTCOME: __GRAIDER_DOLLAR__{{ steps.checkstyle.outcome }}
          COMPILE_OUTCOME: __GRAIDER_DOLLAR__{{ steps.compile.outcome }}
          UNIT_TESTS_OUTCOME: __GRAIDER_DOLLAR__{{ steps.unittests.outcome }}
          SUBMISSION_COMMIT_SHA: __GRAIDER_DOLLAR__{{ env.EFFECTIVE_SUBMISSION_SHA }}
          WORKFLOW_RUN_ID: __GRAIDER_DOLLAR__{{ github.run_id }}
          WORKFLOW_RUN_ATTEMPT: __GRAIDER_DOLLAR__{{ github.run_attempt }}
          RESULT_OUTPUT_PATH: __RESULT_PATH__
        run: |
          set -euo pipefail
          mkdir -p "__GRAIDER_DOLLAR__OUTPUT_DIR" "__GRAIDER_DOLLAR__EVIDENCE_DIR"
          python3 - <<'PY'
          import json
          import os
          from pathlib import Path
          VALID_EVIDENCE_OUTCOMES = {"success", "failure", "skipped"}
          def evidence_outcome(name):
              value = os.environ.get(name, "").strip().lower()
              if value == "cancelled": return "failure"
              return value if value in VALID_EVIDENCE_OUTCOMES else "failure"
          checkstyle = evidence_outcome("CHECKSTYLE_OUTCOME")
          compile_result = evidence_outcome("COMPILE_OUTCOME")
          junit = evidence_outcome("UNIT_TESTS_OUTCOME")
          checkstyle_status = "passed" if checkstyle == "success" else "failed"
          unit_tests_status = "passed" if compile_result == "success" and junit == "success" else "failed"
          overall_status = "passed" if checkstyle_status == "passed" and unit_tests_status == "passed" else "failed"
          grading_result = {"schema_version": 1, "status": overall_status, "checks": [{"name": "CheckStyle", "status": checkstyle_status}, {"name": "Unit Tests", "status": unit_tests_status}]}
          metadata = {"schemaVersion": 1, "submissionCommitSha": os.environ["SUBMISSION_COMMIT_SHA"], "workflowRunId": os.environ["WORKFLOW_RUN_ID"], "workflowRunAttempt": os.environ["WORKFLOW_RUN_ATTEMPT"], "compile": {"outcome": compile_result}, "junit": {"outcome": junit}, "checkstyle": {"outcome": checkstyle}}
          output_path = Path(os.environ["RESULT_OUTPUT_PATH"])
          output_path.parent.mkdir(parents=True, exist_ok=True)
          output_path.write_text(json.dumps(grading_result, indent=2) + "\n", encoding="utf-8")
          evidence_path = Path(os.environ["EVIDENCE_DIR"]) / "metadata.json"
          evidence_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
          PY

      - name: Upload Graider grading result
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: __ARTIFACT__
          path: |
            __RESULT_PATH__
            grading-evidence/
          if-no-files-found: error
`;

  return [...renderManagedWorkflowMarker(), workflow]
    .join("\n")
    .replaceAll(DOLLAR_TOKEN, "$")
    .replaceAll("__ARTIFACT__", artifact)
    .replaceAll("__RESULT_PATH__", result);
};
