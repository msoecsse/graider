import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";

export const GRADING_EVIDENCE_SCHEMA_VERSION = 1;

export type GradingEvidenceOutcome = "success" | "failure" | "skipped";

export interface GradingEvidenceArtifactInput {
  readonly metadataJson: string;
  readonly junitReports: readonly GradingEvidenceTextFile[];
  readonly checkstyleXml?: string;
}

export interface GradingEvidenceTextFile {
  readonly name: string;
  readonly content: string;
}

export interface GradingEvidenceMetadata {
  readonly schemaVersion: typeof GRADING_EVIDENCE_SCHEMA_VERSION;
  readonly submissionCommitSha: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: string;
  readonly compile: GradingEvidencePhase;
  readonly junit: GradingEvidencePhase;
  readonly checkstyle: GradingEvidencePhase;
}

export interface GradingEvidencePhase {
  readonly outcome: GradingEvidenceOutcome;
}

export interface GradingEvidence {
  readonly metadata: GradingEvidenceMetadata;
  readonly junit: JunitEvidence;
  readonly checkstyle: CheckstyleEvidence;
}

export interface JunitEvidence {
  readonly available: boolean;
  readonly outcome: GradingEvidenceOutcome;
  readonly summary: JunitSummary;
  readonly failures: readonly JunitFailure[];
}

export interface JunitSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly skipped: number;
}

export interface JunitFailure {
  readonly name: string;
  readonly className?: string;
  readonly kind: "failure" | "error";
  readonly message?: string;
  readonly details?: string;
}

export interface CheckstyleEvidence {
  readonly available: boolean;
  readonly outcome: GradingEvidenceOutcome;
  readonly violationCount: number;
  readonly violations: readonly CheckstyleViolation[];
}

export interface CheckstyleViolation {
  readonly file: string;
  readonly fileKind: "repository_relative" | "noncanonical";
  readonly line?: number;
  readonly column?: number;
  readonly severity: string;
  readonly message: string;
  readonly source?: string;
}

export type GradingEvidenceParseErrorCode =
  | "metadata_invalid"
  | "metadata_version_unsupported"
  | "junit_report_invalid"
  | "checkstyle_report_invalid"
  | "evidence_inconsistent";

export interface GradingEvidenceParseError {
  readonly code: GradingEvidenceParseErrorCode;
  readonly message: string;
  readonly reportName?: string;
}

export type GradingEvidenceParseResult =
  | { readonly status: "success"; readonly value: GradingEvidence }
  | { readonly status: "failure"; readonly error: GradingEvidenceParseError };

interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlContent[];
}

type XmlContent = XmlElement | string;

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  processEntities: false,
  trimValues: false
} as const;

const SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/u;
const OUTCOMES = new Set<GradingEvidenceOutcome>(["success", "failure", "skipped"]);

const emptyJunitSummary = (): JunitSummary => ({
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  skipped: 0
});

const parseError = (
  code: GradingEvidenceParseErrorCode,
  message: string,
  reportName?: string
): GradingEvidenceParseResult => ({
  status: "failure",
  error: { code, message, ...(reportName === undefined ? {} : { reportName }) }
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const textContent = (contents: readonly XmlContent[]): string | undefined =>
  optionalText(
    contents
      .map((content) =>
        typeof content === "string" ? content : (textContent(content.children) ?? "")
      )
      .join("")
  );

const isXmlElement = (content: XmlContent): content is XmlElement => typeof content !== "string";

const directElements = (element: XmlElement, name: string): readonly XmlElement[] =>
  element.children.filter(
    (content): content is XmlElement => isXmlElement(content) && content.name === name
  );

const descendants = (element: XmlElement, name: string): readonly XmlElement[] =>
  element.children.flatMap((content) => {
    if (!isXmlElement(content)) {
      return [];
    }
    return [...(content.name === name ? [content] : []), ...descendants(content, name)];
  });

const hasForbiddenXmlDeclaration = (content: string): boolean =>
  /<!\s*(DOCTYPE|ENTITY)\b/iu.test(content);

const isWellFormedXml = (content: string): boolean => {
  try {
    SyntaxValidator.validate(content);
    return true;
  } catch {
    return false;
  }
};

const attributesFrom = (value: unknown): Readonly<Record<string, string>> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, attributeValue]) => typeof attributeValue === "string")
      .map(([name, attributeValue]) => [name, attributeValue])
  ) as Readonly<Record<string, string>>;
};

const xmlContents = (value: unknown): readonly XmlContent[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): readonly XmlContent[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const text = entry["#text"];
    const textNodes = typeof text === "string" ? [text] : [];
    const attributes = attributesFrom(entry[":@"]);
    const elements = Object.entries(entry)
      .filter(([name, child]) => name !== "#text" && name !== ":@" && Array.isArray(child))
      .map(([name, child]) => ({ name, attributes, children: xmlContents(child) }));

    return [...textNodes, ...elements];
  });
};

const parseXml = (content: string): readonly XmlElement[] | undefined => {
  if (hasForbiddenXmlDeclaration(content) || !isWellFormedXml(content)) {
    return undefined;
  }

  try {
    return xmlContents(new XMLParser(XML_OPTIONS).parse(content)).filter(
      (entry): entry is XmlElement => isXmlElement(entry) && !entry.name.startsWith("?")
    );
  } catch {
    return undefined;
  }
};

const parseOutcome = (value: unknown): GradingEvidenceOutcome | undefined =>
  typeof value === "string" && OUTCOMES.has(value as GradingEvidenceOutcome)
    ? (value as GradingEvidenceOutcome)
    : undefined;

const parsePhase = (value: unknown): GradingEvidencePhase | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const outcome = parseOutcome(value.outcome);
  return outcome === undefined ? undefined : { outcome };
};

const parseMetadata = (
  metadataJson: string
): GradingEvidenceMetadata | GradingEvidenceParseError => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson) as unknown;
  } catch {
    return { code: "metadata_invalid", message: "Grading evidence metadata is not valid JSON." };
  }

  if (!isRecord(parsed)) {
    return { code: "metadata_invalid", message: "Grading evidence metadata has an invalid shape." };
  }
  if (parsed.schemaVersion !== GRADING_EVIDENCE_SCHEMA_VERSION) {
    return typeof parsed.schemaVersion === "number"
      ? {
          code: "metadata_version_unsupported",
          message: "Grading evidence metadata uses an unsupported schema version."
        }
      : {
          code: "metadata_invalid",
          message: "Grading evidence metadata is missing schemaVersion."
        };
  }
  if (
    typeof parsed.submissionCommitSha !== "string" ||
    !SHA_PATTERN.test(parsed.submissionCommitSha) ||
    typeof parsed.workflowRunId !== "string" ||
    !POSITIVE_DECIMAL_PATTERN.test(parsed.workflowRunId) ||
    typeof parsed.workflowRunAttempt !== "string" ||
    !POSITIVE_DECIMAL_PATTERN.test(parsed.workflowRunAttempt)
  ) {
    return {
      code: "metadata_invalid",
      message: "Grading evidence metadata has invalid run identity."
    };
  }

  const compile = parsePhase(parsed.compile);
  const junit = parsePhase(parsed.junit);
  const checkstyle = parsePhase(parsed.checkstyle);
  if (compile === undefined || junit === undefined || checkstyle === undefined) {
    return {
      code: "metadata_invalid",
      message: "Grading evidence metadata has invalid phase outcomes."
    };
  }

  return {
    schemaVersion: GRADING_EVIDENCE_SCHEMA_VERSION,
    submissionCommitSha: parsed.submissionCommitSha,
    workflowRunId: parsed.workflowRunId,
    workflowRunAttempt: parsed.workflowRunAttempt,
    compile,
    junit,
    checkstyle
  };
};

const parseJunitReport = (
  report: GradingEvidenceTextFile
): { readonly summary: JunitSummary; readonly failures: readonly JunitFailure[] } | undefined => {
  const roots = parseXml(report.content);
  if (roots === undefined || roots.length !== 1) {
    return undefined;
  }
  const root = roots[0];
  if (root === undefined || (root.name !== "testsuite" && root.name !== "testsuites")) {
    return undefined;
  }

  const testcases = descendants(root, "testcase");
  const failures: JunitFailure[] = [];
  let failed = 0;
  let errors = 0;
  let skipped = 0;

  for (const testcase of testcases) {
    const error = directElements(testcase, "error")[0];
    const failure = directElements(testcase, "failure")[0];
    const skippedElement = directElements(testcase, "skipped")[0];
    const name = optionalText(testcase.attributes["@_name"]);
    if (name === undefined) {
      return undefined;
    }

    if (error !== undefined || failure !== undefined) {
      const detail = error ?? failure;
      if (detail === undefined) {
        return undefined;
      }
      const kind = error === undefined ? "failure" : "error";
      const className = optionalText(testcase.attributes["@_classname"]);
      const message = optionalText(detail.attributes["@_message"]);
      const details = textContent(detail.children);
      if (kind === "failure") {
        failed += 1;
      } else {
        errors += 1;
      }
      failures.push({
        name,
        ...(className === undefined ? {} : { className }),
        kind,
        ...(message === undefined ? {} : { message }),
        ...(details === undefined ? {} : { details })
      });
    } else if (skippedElement !== undefined) {
      skipped += 1;
    }
  }

  return {
    summary: {
      total: testcases.length,
      passed: testcases.length - failed - errors - skipped,
      failed,
      errors,
      skipped
    },
    failures
  };
};

const isNoncanonicalFile = (file: string): boolean =>
  /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(file) || file.split(/[\\/]/u).includes("..");

const positiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!POSITIVE_DECIMAL_PATTERN.test(value)) {
    return undefined;
  }
  return Number(value);
};

const parseCheckstyle = (content: string): readonly CheckstyleViolation[] | undefined => {
  const roots = parseXml(content);
  if (roots === undefined || roots.length !== 1) {
    return undefined;
  }
  const root = roots[0];
  if (root === undefined || root.name !== "checkstyle") {
    return undefined;
  }

  const violations: CheckstyleViolation[] = [];
  for (const fileElement of directElements(root, "file")) {
    const file = optionalText(fileElement.attributes["@_name"]);
    if (file === undefined) {
      return undefined;
    }

    for (const error of directElements(fileElement, "error")) {
      const line = positiveInteger(error.attributes["@_line"]);
      const column = positiveInteger(error.attributes["@_column"]);
      const severity = optionalText(error.attributes["@_severity"]);
      const message = optionalText(error.attributes["@_message"]);
      const source = optionalText(error.attributes["@_source"]);
      if (
        (error.attributes["@_line"] !== undefined && line === undefined) ||
        (error.attributes["@_column"] !== undefined && column === undefined) ||
        severity === undefined ||
        message === undefined
      ) {
        return undefined;
      }
      violations.push({
        file,
        fileKind: isNoncanonicalFile(file) ? "noncanonical" : "repository_relative",
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
        severity,
        message,
        ...(source === undefined ? {} : { source })
      });
    }
  }
  return violations;
};

export const parseGradingEvidence = (
  input: GradingEvidenceArtifactInput
): GradingEvidenceParseResult => {
  const metadata = parseMetadata(input.metadataJson);
  if ("code" in metadata) {
    return { status: "failure", error: metadata };
  }

  if (metadata.junit.outcome === "skipped" && input.junitReports.length > 0) {
    return parseError(
      "evidence_inconsistent",
      "JUnit reports are present even though metadata says JUnit was skipped."
    );
  }
  if (metadata.checkstyle.outcome === "skipped" && input.checkstyleXml !== undefined) {
    return parseError(
      "evidence_inconsistent",
      "A Checkstyle report is present even though metadata says Checkstyle was skipped."
    );
  }

  const junitReports = [] as { summary: JunitSummary; failures: readonly JunitFailure[] }[];
  for (const report of input.junitReports) {
    const parsed = parseJunitReport(report);
    if (parsed === undefined) {
      return parseError("junit_report_invalid", "A JUnit evidence report is invalid.", report.name);
    }
    junitReports.push(parsed);
  }

  let checkstyleViolations: readonly CheckstyleViolation[] = [];
  if (input.checkstyleXml !== undefined) {
    const parsed = parseCheckstyle(input.checkstyleXml);
    if (parsed === undefined) {
      return parseError("checkstyle_report_invalid", "The Checkstyle evidence report is invalid.");
    }
    checkstyleViolations = parsed;
  }

  const junitSummary = junitReports.reduce<JunitSummary>(
    (summary, report) => ({
      total: summary.total + report.summary.total,
      passed: summary.passed + report.summary.passed,
      failed: summary.failed + report.summary.failed,
      errors: summary.errors + report.summary.errors,
      skipped: summary.skipped + report.summary.skipped
    }),
    emptyJunitSummary()
  );

  return {
    status: "success",
    value: {
      metadata,
      junit: {
        available: input.junitReports.length > 0,
        outcome: metadata.junit.outcome,
        summary: junitSummary,
        failures: junitReports.flatMap((report) => report.failures)
      },
      checkstyle: {
        available: input.checkstyleXml !== undefined,
        outcome: metadata.checkstyle.outcome,
        violationCount: checkstyleViolations.length,
        violations: checkstyleViolations
      }
    }
  };
};
