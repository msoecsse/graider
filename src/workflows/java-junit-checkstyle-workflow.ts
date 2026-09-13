import {
  RESULT_WRITER_SCRIPT_PATH,
  renderGradingResultWriterScript
} from "./result-writer-template.js";
import {
  GRAIDER_MANAGED_WORKFLOW_PATH,
  renderManagedWorkflowMarker
} from "./managed-workflow-policy.js";
import type { EffectiveAssignmentGrading } from "../config/effective-grading.js";

export const JAVA_JUNIT_CHECKSTYLE_PRESET = "java-junit-checkstyle";

const WORKFLOW_NAME = "AutoGrading Tests";
const JAVA_VERSION = "25";
const JAVA_DISTRIBUTION = "oracle";
const CHECKSTYLE_VERSION = "14.1.0";
const CHECKSTYLE_CONFIG_URL = "https://csse.msoe.us/csc1110/MSOE_checkStyle.xml";
const JUNIT_PLATFORM_CONSOLE_VERSION = "6.1.2";
const MOCKITO_VERSION = "5.18.0";
const BYTE_BUDDY_VERSION = "1.17.5";
const JAVAFX_VERSION = "25";
const OUTPUT_DIRECTORY = "graider-output";
const EVIDENCE_DIRECTORY = "grading-evidence";
const JUNIT_EVIDENCE_DIRECTORY = `${EVIDENCE_DIRECTORY}/junit`;
const CHECKSTYLE_EVIDENCE_FILE = `${EVIDENCE_DIRECTORY}/checkstyle.xml`;
const EVIDENCE_METADATA_FILE = `${EVIDENCE_DIRECTORY}/metadata.json`;

export interface JavaJunitCheckstyleWorkflowInput {
  readonly grading: EffectiveAssignmentGrading;
}

const indentWorkflowRunLine = (line: string): string => `          ${line}`;

const renderResultWriterInstallLines = (): string[] =>
  renderGradingResultWriterScript().trimEnd().split("\n").map(indentWorkflowRunLine);

const createResultOutputPath = (resultFile: string): string =>
  resultFile.includes("/") ? resultFile : `${OUTPUT_DIRECTORY}/${resultFile}`;

export const renderJavaJunitCheckstyleWorkflow = ({
  grading
}: JavaJunitCheckstyleWorkflowInput): string => {
  const artifactName = grading.artifact ?? "grading-results";
  const resultFile = grading.result_file ?? "grading-results.json";
  const resultOutputPath = createResultOutputPath(resultFile);

  return [
    ...renderManagedWorkflowMarker(),
    `name: ${WORKFLOW_NAME}`,
    "",
    "on:",
    "  push:",
    "    paths-ignore:",
    `      - ${GRAIDER_MANAGED_WORKFLOW_PATH}`,
    "  repository_dispatch:",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  checks: write",
    "  actions: read",
    "  contents: read",
    "",
    "jobs:",
    "  run-autograding-tests:",
    "    if: >-",
    "      github.actor != 'github-classroom[bot]' &&",
    "      !(",
    "        github.event_name == 'push' &&",
    "        github.event.before == '0000000000000000000000000000000000000000' &&",
    "        github.ref_name == github.event.repository.default_branch",
    "      )",
    "    runs-on: ubuntu-latest",
    "    env:",
    `      JAVA_VERSION: "${JAVA_VERSION}"`,
    `      CHECKSTYLE_VERSION: "${CHECKSTYLE_VERSION}"`,
    `      CHECKSTYLE_CONFIG_URL: "${CHECKSTYLE_CONFIG_URL}"`,
    `      JUNIT_PLATFORM_CONSOLE_VERSION: "${JUNIT_PLATFORM_CONSOLE_VERSION}"`,
    `      MOCKITO_VERSION: "${MOCKITO_VERSION}"`,
    `      BYTE_BUDDY_VERSION: "${BYTE_BUDDY_VERSION}"`,
    `      JAVAFX_VERSION: "${JAVAFX_VERSION}"`,
    "      TOOLS_DIR: graider-tools",
    "    steps:",
    "      - name: Check out repository",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Set up Java",
    "        uses: actions/setup-java@v4",
    "        with:",
    `          distribution: ${JAVA_DISTRIBUTION}`,
    "          java-version: ${{ env.JAVA_VERSION }}",
    "",
    "      - name: Install JavaFX headless dependencies",
    "        run: |",
    "          sudo apt-get update",
    "          sudo apt-get install -y unzip xvfb",
    "",
    "      - name: Download grading tools",
    "        run: |",
    '          mkdir -p "$TOOLS_DIR"',
    '          curl -fsSL -o "$TOOLS_DIR/checkstyle.jar" "https://repo1.maven.org/maven2/com/puppycrawl/tools/checkstyle/${CHECKSTYLE_VERSION}/checkstyle-${CHECKSTYLE_VERSION}-all.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/junit-platform-console-standalone.jar" "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/${JUNIT_PLATFORM_CONSOLE_VERSION}/junit-platform-console-standalone-${JUNIT_PLATFORM_CONSOLE_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/mockito-core.jar" "https://repo1.maven.org/maven2/org/mockito/mockito-core/${MOCKITO_VERSION}/mockito-core-${MOCKITO_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/byte-buddy.jar" "https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy/${BYTE_BUDDY_VERSION}/byte-buddy-${BYTE_BUDDY_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/byte-buddy-agent.jar" "https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy-agent/${BYTE_BUDDY_VERSION}/byte-buddy-agent-${BYTE_BUDDY_VERSION}.jar"',
    '          curl -fsSL -o "$TOOLS_DIR/javafx.zip" "https://download2.gluonhq.com/openjfx/${JAVAFX_VERSION}/openjfx-${JAVAFX_VERSION}_linux-x64_bin-sdk.zip"',
    '          unzip -q "$TOOLS_DIR/javafx.zip" -d "$TOOLS_DIR/javafx"',
    "",
    "      - name: Install Graider result writer",
    "        run: |",
    "          mkdir -p .graider",
    `          cat > ${RESULT_WRITER_SCRIPT_PATH} <<'PY'`,
    ...renderResultWriterInstallLines(),
    "          PY",
    `          chmod +x ${RESULT_WRITER_SCRIPT_PATH}`,
    "",
    "      - name: CheckStyle",
    "        id: checkstyle",
    "        uses: classroom-resources/autograding-command-grader@v1",
    "        continue-on-error: true",
    "        with:",
    "          test-name: CheckStyle",
    "          command: |",
    "            set +e",
    '            java -jar "$TOOLS_DIR/checkstyle.jar" -c "$CHECKSTYLE_CONFIG_URL" $(find src -name \'*.java\' -print)',
    "            checkstyle_exit=$?",
    `            mkdir -p ${EVIDENCE_DIRECTORY}`,
    `            java -jar "$TOOLS_DIR/checkstyle.jar" -f xml -o ${CHECKSTYLE_EVIDENCE_FILE} -c "$CHECKSTYLE_CONFIG_URL" $(find src -name '*.java' -print)`,
    "            exit $checkstyle_exit",
    "",
    "      - name: Compile Java sources",
    "        id: compile",
    "        run: |",
    "          mkdir -p bin",
    "          JAVAFX_LIB=$(find \"$TOOLS_DIR/javafx\" -type d -path '*/lib' | head -n 1)",
    '          javac --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -cp "$TOOLS_DIR/junit-platform-console-standalone.jar:$TOOLS_DIR/mockito-core.jar:$TOOLS_DIR/byte-buddy.jar:$TOOLS_DIR/byte-buddy-agent.jar" -d bin $(find src test -name \'*.java\' -print)',
    "",
    "      - name: Unit Tests",
    "        id: unit-tests",
    "        uses: classroom-resources/autograding-command-grader@v1",
    "        continue-on-error: true",
    "        with:",
    "          test-name: Unit Tests",
    "          command: |",
    "            COMMIT_MSG='${{ github.event.head_commit.message }}'",
    '            case "$COMMIT_MSG" in',
    "              COMMIT[0-9]*|DONE[0-9]*)",
    '                TAG="${COMMIT_MSG%% *}"',
    '                TAG_ARGS="--include-tag $TAG"',
    "                ;;",
    "              *)",
    '                TAG_ARGS=""',
    "                ;;",
    "            esac",
    "            JAVAFX_LIB=$(find \"$TOOLS_DIR/javafx\" -type d -path '*/lib' | head -n 1)",
    `            mkdir -p ${JUNIT_EVIDENCE_DIRECTORY}`,
    `            xvfb-run -a java --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -jar "$TOOLS_DIR/junit-platform-console-standalone.jar" execute $TAG_ARGS --scan-class-path --class-path bin --reports-dir ${JUNIT_EVIDENCE_DIRECTORY}`,
    "",
    "      - name: AutoGrading Reporter",
    "        if: always()",
    "        uses: classroom-resources/autograding-grading-reporter@v1",
    "        env:",
    "          CHECKSTYLE_RESULTS: ${{ steps.checkstyle.outputs.result }}",
    "          UNIT-TESTS_RESULTS: ${{ steps.unit-tests.outputs.result }}",
    "        with:",
    "          runners: checkstyle,unit-tests",
    "",
    "      - name: Write Graider grading result",
    "        if: always()",
    "        env:",
    "          CHECKSTYLE_CLASSROOM_RESULT: ${{ steps.checkstyle.outputs.result }}",
    "          UNIT_TESTS_CLASSROOM_RESULT: ${{ steps.unit-tests.outputs.result }}",
    "          CHECKSTYLE_OUTCOME: ${{ steps.checkstyle.outcome }}",
    "          UNIT_TESTS_OUTCOME: ${{ steps.unit-tests.outcome }}",
    "          COMPILE_OUTCOME: ${{ steps.compile.outcome }}",
    "          SUBMISSION_COMMIT_SHA: ${{ github.sha }}",
    "          WORKFLOW_RUN_ID: ${{ github.run_id }}",
    "          WORKFLOW_RUN_ATTEMPT: ${{ github.run_attempt }}",
    "        run: |",
    `          python3 ${RESULT_WRITER_SCRIPT_PATH} \\`,
    `            --output ${resultOutputPath} \\`,
    '            --classroom-check "CheckStyle=CHECKSTYLE_CLASSROOM_RESULT:CHECKSTYLE_OUTCOME" \\',
    '            --classroom-check "Unit Tests=UNIT_TESTS_CLASSROOM_RESULT:UNIT_TESTS_OUTCOME" \\',
    `            --evidence-metadata-output ${EVIDENCE_METADATA_FILE} \\`,
    '            --submission-commit-sha "$SUBMISSION_COMMIT_SHA" \\',
    '            --workflow-run-id "$WORKFLOW_RUN_ID" \\',
    '            --workflow-run-attempt "$WORKFLOW_RUN_ATTEMPT" \\',
    '            --evidence-outcome "compile=${COMPILE_OUTCOME}" \\',
    '            --evidence-outcome "junit=${UNIT_TESTS_OUTCOME}" \\',
    '            --evidence-outcome "checkstyle=${CHECKSTYLE_OUTCOME}"',
    "",
    "      - name: Upload Graider grading result",
    "        if: always()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    `          name: ${artifactName}`,
    "          path: |",
    `            ${resultOutputPath}`,
    `            ${EVIDENCE_DIRECTORY}/`,
    ""
  ].join("\n");
};
