import { describe, expect, it } from "vitest";
import { renderJavaJunitCheckstyleWorkflow } from "../../../src/workflows/java-junit-checkstyle-workflow.js";

const grading = {
  enabled: true,
  mode: "preset",
  preset: "java-junit-checkstyle",
  workflow: ".github/workflows/grade.yml",
  artifact: "grading-results",
  result_file: "grading-results.json"
} as const;

describe("java-junit-checkstyle workflow", () => {
  it("renders the proven shell-based Java grading workflow", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({ grading });

    expect(workflow).toContain("# Managed by Graider");
    expect(workflow).toContain("# graider-workflow-version: 1");
    expect(workflow).not.toContain("classroom-resources/autograding-command-grader");
    expect(workflow).not.toContain("classroom-resources/autograding-grading-reporter");
    expect(workflow).not.toContain("runners:");
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).toContain("uses: actions/setup-java@v6");
    expect(workflow).toContain("distribution: temurin");
    expect(workflow).toContain('JAVA_VERSION: "25"');
    expect(workflow).toContain("checkstyle/checkstyle/releases/download/checkstyle-");
    expect(workflow).toContain(
      "junit-platform-console-standalone/${JUNIT_PLATFORM_CONSOLE_VERSION}"
    );
    expect(workflow).toContain("mockito-core/${MOCKITO_VERSION}");
    expect(workflow).toContain("byte-buddy-agent/${BYTE_BUDDY_VERSION}");
    expect(workflow).toContain("objenesis/${OBJENESIS_VERSION}");
    expect(workflow).toContain("org/openjfx/javafx-");
    expect(workflow).toContain('download "$CHECKSTYLE_CONFIG_URL" "$TOOLS_DIR/checkstyle.xml"');
    expect(workflow).toContain("- name: CheckStyle");
    expect(workflow).toContain("- name: Compile Java sources");
    expect(workflow).toContain("- name: Unit Tests");
    expect(workflow).toContain("SOURCE_ROOTS=()");
    expect(workflow).toContain("if [[ -d test ]]; then SOURCE_ROOTS+=(test); fi");
    expect(workflow).toContain("if [[ -d tests ]]; then SOURCE_ROOTS+=(tests); fi");
    expect(workflow).not.toContain("find src test");
    expect(workflow).toContain("REPOSITORY_JARS=()");
    expect(workflow).toContain("find lib -type f -name '*.jar' -print0");
    expect(workflow).toContain('"$EVIDENCE_DIR/checkstyle.xml"');
    expect(workflow).toContain('"$EVIDENCE_DIR/junit"');
    expect(workflow).toContain("metadata.json");
    expect(workflow).toContain("graider-output/grading-results.json");
    expect(workflow).toContain("grading-evidence/");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("submission_sha:");
    expect(workflow).toContain("${{ inputs.submission_sha || github.sha }}");
    expect(workflow).toContain("ref: ${{ env.EFFECTIVE_SUBMISSION_SHA }}");
    expect(workflow).toContain("SUBMISSION_COMMIT_SHA: ${{ env.EFFECTIVE_SUBMISSION_SHA }}");
    expect(workflow).toContain('COMMIT_MSG=$(git log -1 --pretty=%s "$EFFECTIVE_SUBMISSION_SHA")');
    expect(workflow).not.toContain('COMMIT_MSG=$(git log -1 --pretty=%s "$GITHUB_SHA")');
    expect(workflow).toContain("find \"$BUILD_DIR\" -type f -name '*.class' -print0");
    expect(workflow).toContain("org/junit/jupiter/api/Tag(s)?");
    expect(workflow).toContain('if [[ "$JUNIT_TAGS_PRESENT" == true ]]; then');
    expect(workflow).toContain("COMMIT[0-9]*|DONE[0-9]*)");
    expect(workflow).toContain('TAG_ARGS=(--include-tag "$TAG")');
    expect(workflow).toContain('"${TAG_ARGS[@]}" --scan-class-path');
    expect(workflow).toContain('xvfb-run -a -s "-screen 0 1280x1024x24"');
    expect(workflow).toContain('--reports-dir "$EVIDENCE_DIR/junit"');
    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("paths-ignore:");
    expect(workflow).toContain("- .github/workflows/grade.yml");
  });

  it("substitutes only the configured artifact and result file locations", () => {
    const workflow = renderJavaJunitCheckstyleWorkflow({
      grading: { ...grading, artifact: "custom-results", result_file: "custom-result.json" }
    });

    expect(workflow).toContain("name: custom-results");
    expect(workflow).toContain("graider-output/custom-result.json");
  });
});
