import type { RawCourseConfig } from "../config/config-models.js";

export const JAVA_JUNIT_CHECKSTYLE_PRESET = "java-junit-checkstyle";

const WORKFLOW_NAME = "AutoGrading Tests";
const JAVA_VERSION = "25";
const JAVA_DISTRIBUTION = "oracle";
const CHECKSTYLE_VERSION = "13.4.1";
const CHECKSTYLE_CONFIG_URL = "https://csse.msoe.us/csc1110/MSOE_checkStyle.xml";
const JUNIT_PLATFORM_CONSOLE_VERSION = "6.1.0";
const MOCKITO_VERSION = "5.18.0";
const BYTE_BUDDY_VERSION = "1.17.5";
const JAVAFX_VERSION = "25";

export interface JavaJunitCheckstyleWorkflowInput {
  readonly grading: RawCourseConfig["grading"];
}

export const renderJavaJunitCheckstyleWorkflow = ({
  grading
}: JavaJunitCheckstyleWorkflowInput): string => {
  const artifactName = grading.artifact ?? "grading-results";
  const resultFile = grading.result_file ?? "grading-results.json";

  return [
    `name: ${WORKFLOW_NAME}`,
    "",
    "on:",
    "  - push",
    "  - repository_dispatch",
    "  - workflow_dispatch",
    "",
    "permissions:",
    "  checks: write",
    "  actions: read",
    "  contents: read",
    "",
    "jobs:",
    "  grade:",
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
    "      - name: Run CheckStyle",
    "        id: checkstyle",
    "        continue-on-error: true",
    "        run: |",
    '          java -jar "$TOOLS_DIR/checkstyle.jar" -c "$CHECKSTYLE_CONFIG_URL" $(find src test -name \'*.java\' -print)',
    "",
    "      - name: Compile Java sources",
    "        id: compile",
    "        continue-on-error: true",
    "        run: |",
    "          mkdir -p build/classes",
    "          JAVAFX_LIB=$(find \"$TOOLS_DIR/javafx\" -type d -path '*/lib' | head -n 1)",
    '          javac --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -cp "$TOOLS_DIR/junit-platform-console-standalone.jar:$TOOLS_DIR/mockito-core.jar:$TOOLS_DIR/byte-buddy.jar:$TOOLS_DIR/byte-buddy-agent.jar" -d build/classes $(find src test -name \'*.java\' -print)',
    "",
    "      - name: Run Unit Tests",
    "        id: unit-tests",
    "        continue-on-error: true",
    "        run: |",
    "          JAVAFX_LIB=$(find \"$TOOLS_DIR/javafx\" -type d -path '*/lib' | head -n 1)",
    '          xvfb-run -a java --module-path "$JAVAFX_LIB" --add-modules javafx.controls,javafx.fxml -jar "$TOOLS_DIR/junit-platform-console-standalone.jar" execute --class-path build/classes --scan-class-path',
    "",
    "      - name: Run GitHub Classroom autograding reporter",
    "        if: always()",
    "        continue-on-error: true",
    "        uses: education/autograding@v1",
    "",
    "      - name: Write Graider grading result",
    "        if: always()",
    "        uses: actions/github-script@v7",
    "        env:",
    `          GRAIDER_RESULT_FILE: ${resultFile}`,
    "          CHECKSTYLE_OUTCOME: ${{ steps.checkstyle.outcome }}",
    "          UNIT_TESTS_OUTCOME: ${{ steps.unit-tests.outcome }}",
    "        with:",
    "          script: |",
    '            const fs = require("fs");',
    '            const path = require("path");',
    "            const outcomeMap = {",
    '              success: "passed",',
    '              failure: "failed",',
    '              cancelled: "failed",',
    '              skipped: "skipped"',
    "            };",
    '            const mapOutcome = (outcome) => outcomeMap[outcome] || "failed";',
    "            const checks = [",
    '              { name: "CheckStyle", status: mapOutcome(process.env.CHECKSTYLE_OUTCOME) },',
    '              { name: "Unit Tests", status: mapOutcome(process.env.UNIT_TESTS_OUTCOME) }',
    "            ];",
    '            const status = checks.every((check) => check.status === "passed") ? "passed" : "failed";',
    "            const result = { schema_version: 1, status, checks };",
    '            const resultFile = process.env.GRAIDER_RESULT_FILE || "grading-results.json";',
    "            fs.mkdirSync(path.dirname(resultFile), { recursive: true });",
    "            fs.writeFileSync(resultFile, `${JSON.stringify(result, undefined, 2)}\\n`);",
    "",
    "      - name: Upload Graider grading result",
    "        if: always()",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    `          name: ${artifactName}`,
    `          path: ${resultFile}`,
    ""
  ].join("\n");
};
