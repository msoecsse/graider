import type { GradingEvidenceOutcome, JunitFailure } from "./grading-evidence-parser.js";
import { parseCommentContent, type CommentInlineNode } from "../shared/comment-content.js";
import type {
  GradingReportComment,
  GradingReportModel,
  GradingReportSourceFile
} from "./grading-report-model.js";

const REPORT_STYLES = `
:root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #fff; }
* { box-sizing: border-box; }
body { margin: 0; line-height: 1.45; }
main { width: min(1100px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }
h1, h2, h3, h4 { line-height: 1.2; }
h1 { margin-bottom: .25rem; }
h2 { margin-top: 2rem; border-bottom: 2px solid #cbd5e1; padding-bottom: .35rem; }
h3 { margin-top: 1.5rem; }
.course, .secondary, .technical { color: #475569; }
.score { font-size: 1.4rem; font-weight: 700; }
.status { font-weight: 600; }
.technical { font-size: .85rem; }
table { width: 100%; border-collapse: collapse; margin: .75rem 0; }
th, td { border: 1px solid #cbd5e1; padding: .45rem .55rem; text-align: left; vertical-align: top; }
thead th { background: #f1f5f9; }
.number { text-align: right; font-variant-numeric: tabular-nums; }
.feedback-list, .finding-list, .commit-list { padding-left: 1.4rem; }
.feedback { border-left: 4px solid #64748b; padding: .55rem .75rem; margin: .65rem 0; background: #f8fafc; }
.preserve-text, .failure-details { white-space: pre-wrap; overflow-wrap: anywhere; }
.comment-content__paragraph { margin: .35rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.comment-content__inline-code { border-radius: 3px; background: #e2e8f0; padding: 0 .22em; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.comment-content__code-block { max-width: 100%; overflow-x: auto; margin: .65rem 0 0; border: 1px solid #cbd5e1; border-radius: 4px; background: #f1f5f9; padding: .65rem; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9em; line-height: 1.5; white-space: pre; }
.comment-content__code-block code { font-family: inherit; }
.source-file { break-inside: avoid; }
.source-scroll { max-width: 100%; overflow-x: auto; border: 1px solid #cbd5e1; }
.source-code { margin: 0; border: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .875rem; }
.source-code th, .source-code td { border: 0; border-bottom: 1px solid #e2e8f0; padding: .15rem .4rem; }
.source-code th { width: 1%; color: #64748b; background: #f8fafc; text-align: right; user-select: none; }
.source-code code { display: block; min-height: 1.25em; white-space: pre; }
.source-code .has-feedback { background: #fff7ed; }
.source-code .inline-feedback-row td { padding: 0; background: #fff7ed; }
.inline-source-feedback { margin: .45rem; }
.source-feedback-index { margin: .75rem 0 1rem; }
.phase-grid { display: grid; grid-template-columns: max-content 1fr; gap: .3rem 1rem; }
.phase-grid dt { font-weight: 700; }
.phase-grid dd { margin: 0; }
.outcome { font-weight: 700; }
.unavailable { padding: .65rem; border-left: 4px solid #a16207; background: #fffbeb; }
.commit-list li { margin-bottom: .65rem; }
.commit-message { overflow-wrap: anywhere; }
code.sha { font-size: .85em; }
@media print { main { width: 100%; padding: 0; } a { color: inherit; } .source-scroll { overflow: visible; } .feedback, tr, .comment-content__code-block { break-inside: avoid; } .comment-content__code-block { overflow: visible; white-space: pre-wrap; } }
`;

const COMMIT_SHA_DISPLAY_LENGTH = 8;
const SUBMISSION_SHA_DISPLAY_LENGTH = 12;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatNumber = (value: number): string => String(value);
const formatSignedNumber = (value: number): string =>
  value >= 0 ? `+${formatNumber(value)}` : formatNumber(value);

const outcomeLabel = (outcome: GradingEvidenceOutcome): string =>
  ({ success: "Passed", failure: "Failed", skipped: "Skipped" })[outcome];

const gradingStatusLabel = (status: GradingReportModel["gradingStatus"]): string =>
  ({
    not_started: "Not started",
    in_progress: "In progress",
    complete: "Complete",
    published: "Published"
  })[status];

const shortSha = (sha: string, length: number): string => sha.slice(0, length);

const formatIsoTimestamp = (timestamp: string): string => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})$/u.exec(
    timestamp
  );
  return match === null ? timestamp : match.slice(1).join(" ");
};

const commentCategory = (comment: GradingReportComment): string =>
  comment.rubricCategoryName === undefined
    ? "General score adjustment"
    : `Rubric: ${escapeHtml(comment.rubricCategoryName)}`;

const commentLabel = (comment: GradingReportComment): string =>
  comment.title === undefined
    ? `Feedback ${formatNumber(comment.reportIndex)}`
    : escapeHtml(comment.title);

const renderCommentInlineContent = (nodes: readonly CommentInlineNode[]): string =>
  nodes
    .map((node) =>
      node.kind === "inline_code"
        ? `<code class="comment-content__inline-code">${escapeHtml(node.text)}</code>`
        : escapeHtml(node.text)
    )
    .join("");

const renderFormattedCommentContent = (text: string): string =>
  parseCommentContent(text)
    .map((block) =>
      block.kind === "code_block"
        ? `<pre class="comment-content__code-block"><code>${escapeHtml(block.text)}</code></pre>`
        : `<p class="comment-content__paragraph">${renderCommentInlineContent(block.children)}</p>`
    )
    .join("\n");

const renderCommentBody = (comment: GradingReportComment): string => `
${renderFormattedCommentContent(comment.text)}
<p class="secondary">${commentCategory(comment)} · Score adjustment: ${formatSignedNumber(comment.deduction)}</p>`;

const sourceLocationText = (comment: GradingReportComment): string => {
  const location = comment.sourceLocation;
  if (location === undefined) return "";
  const lines =
    location.startLine === location.endLine
      ? `line ${formatNumber(location.startLine)}`
      : `lines ${formatNumber(location.startLine)}–${formatNumber(location.endLine)}`;
  return `${escapeHtml(location.file)}, ${lines}`;
};

const renderGeneralFeedback = (model: GradingReportModel): string => `
<section id="general-feedback" aria-labelledby="general-feedback-heading">
<h2 id="general-feedback-heading">General Feedback</h2>
${
  model.generalComments.length === 0
    ? '<p class="secondary">No general feedback was recorded.</p>'
    : `<ol class="feedback-list">${model.generalComments
        .map(
          (
            comment
          ) => `<li class="feedback" id="general-comment-${formatNumber(comment.reportIndex)}">
${renderCommentBody(comment)}
</li>`
        )
        .join("")}</ol>`
}
</section>`;

const commentsForLine = (
  comments: readonly GradingReportComment[],
  line: number
): readonly GradingReportComment[] =>
  comments.filter(
    (comment) =>
      comment.locationAvailable &&
      comment.sourceLocation !== undefined &&
      line >= comment.sourceLocation.startLine &&
      line <= comment.sourceLocation.endLine
  );

const renderInlineSourceComment = (comment: GradingReportComment): string =>
  `<article class="feedback inline-source-feedback" id="source-comment-${formatNumber(comment.reportIndex)}">
<h4>${commentLabel(comment)}</h4>
${renderCommentBody(comment)}
</article>`;

const renderSourceLines = (source: Extract<GradingReportSourceFile, { status: "found" }>): string =>
  source.lines
    .map((line, index) => {
      const lineNumber = index + 1;
      const comments = commentsForLine(source.comments, lineNumber);
      const startingComments = comments.filter(
        (comment) => comment.sourceLocation?.startLine === lineNumber
      );
      const sourceRow = `<tr id="source-file-${formatNumber(source.fileIndex)}-line-${formatNumber(lineNumber)}"${comments.length === 0 ? "" : ' class="has-feedback"'}><th scope="row">${formatNumber(lineNumber)}</th><td><code>${escapeHtml(line)}</code></td></tr>`;
      const inlineComments = startingComments
        .map(
          (comment) =>
            `<tr class="inline-feedback-row"><th aria-hidden="true"></th><td>${renderInlineSourceComment(comment)}</td></tr>`
        )
        .join("");
      return `${sourceRow}${inlineComments}`;
    })
    .join("\n");

const renderSourceFile = (source: GradingReportSourceFile): string => `
<article class="source-file" id="source-file-${formatNumber(source.fileIndex)}">
<h3>${escapeHtml(source.file)}</h3>
${
  source.status === "missing"
    ? '<p class="unavailable">Required file unavailable.</p>'
    : `<div class="source-scroll" role="region" aria-label="Source for ${escapeHtml(source.file)}" tabindex="0">
<table class="source-code"><thead><tr><th scope="col">Line</th><th scope="col">Source</th></tr></thead><tbody>
${renderSourceLines(source)}
</tbody></table>
</div>`
}
</article>`;

const mappedSourceComments = (model: GradingReportModel): readonly GradingReportComment[] =>
  model.sourceFiles.flatMap((source) =>
    source.status === "found" ? source.comments.filter((comment) => comment.locationAvailable) : []
  );

const renderSourceFeedbackIndex = (model: GradingReportModel): string => {
  const comments = mappedSourceComments(model);
  if (comments.length === 0) return "";
  return `<section class="source-feedback-index" aria-labelledby="source-feedback-index-heading">
<h3 id="source-feedback-index-heading">Source Feedback</h3>
<ol>${comments
    .map(
      (comment) =>
        `<li><a href="#source-comment-${formatNumber(comment.reportIndex)}">${commentLabel(comment)} — ${sourceLocationText(comment)}</a></li>`
    )
    .join("")}</ol>
</section>`;
};

const renderUnmappedSourceComments = (comments: readonly GradingReportComment[]): string =>
  comments.length === 0
    ? ""
    : `<section aria-labelledby="unmapped-feedback-heading">
<h3 id="unmapped-feedback-heading">Source Feedback with Unavailable Locations</h3>
<ol class="feedback-list">${comments
        .map(
          (
            comment
          ) => `<li class="feedback" id="source-comment-${formatNumber(comment.reportIndex)}">
<p>${sourceLocationText(comment)}</p>
<p class="unavailable">Location unavailable in the anchored submission source.</p>
${renderCommentBody(comment)}
</li>`
        )
        .join("")}</ol>
</section>`;

const renderSource = (model: GradingReportModel): string => `
<section id="source" aria-labelledby="source-heading">
<h2 id="source-heading">Submission Source and Feedback</h2>
${renderSourceFeedbackIndex(model)}
${
  model.sourceFiles.length === 0
    ? '<p class="secondary">No source files were supplied for this report.</p>'
    : model.sourceFiles.map(renderSourceFile).join("")
}
${renderUnmappedSourceComments(model.unmappedSourceComments)}
</section>`;

const renderRubric = (model: GradingReportModel): string => `
<section id="rubric" aria-labelledby="rubric-heading">
<h2 id="rubric-heading">Rubric and Scoring</h2>
<table><thead><tr><th scope="col">Category</th><th scope="col" class="number">Possible</th><th scope="col" class="number">Comment adjustments</th><th scope="col" class="number">Manual adjustments</th><th scope="col" class="number">Score</th></tr></thead><tbody>
${model.grade.categories
  .map(
    (category) =>
      `<tr><th scope="row">${escapeHtml(category.name)}</th><td class="number">${formatNumber(category.pointsPossible)}</td><td class="number">${formatSignedNumber(category.categorizedCommentAdjustmentTotal)}</td><td class="number">${formatSignedNumber(category.manualAdjustmentTotal)}</td><td class="number">${formatNumber(category.score)}</td></tr>`
  )
  .join("\n")}
</tbody><tfoot><tr><th scope="row">Final score</th><td class="number">${formatNumber(model.grade.pointsPossible)}</td><td class="number" colspan="2">Uncategorized comment adjustments: ${formatSignedNumber(model.grade.uncategorizedCommentAdjustmentTotal)}</td><td class="number">${formatNumber(model.grade.totalScore)}</td></tr></tfoot></table>
<h3>Manual Adjustments</h3>
${
  model.manualAdjustments.length === 0
    ? '<p class="secondary">No manual adjustments were recorded.</p>'
    : `<ul>${model.manualAdjustments
        .map(
          (adjustment) =>
            `<li><strong>${escapeHtml(adjustment.rubricCategoryName)}:</strong> ${formatSignedNumber(adjustment.amount)}${adjustment.note === undefined ? "" : ` — <span class="preserve-text">${escapeHtml(adjustment.note)}</span>`}</li>`
        )
        .join("")}</ul>`
}
</section>`;

const checkstyleLocation = (
  model: GradingReportModel,
  violation: NonNullable<GradingReportModel["evidence"]>["checkstyle"]["violations"][number]
): string => {
  if (violation.fileKind === "noncanonical")
    return `${escapeHtml(violation.file)} (Noncanonical location)`;
  const suffix = `${violation.line === undefined ? "" : `:${formatNumber(violation.line)}`}${violation.column === undefined ? "" : `:${formatNumber(violation.column)}`}`;
  const source = model.sourceFiles.find(
    (candidate) =>
      candidate.status === "found" &&
      candidate.file === violation.file &&
      violation.line !== undefined &&
      violation.line <= candidate.lines.length
  );
  const label = `${escapeHtml(violation.file)}${suffix}`;
  return source?.status === "found" && violation.line !== undefined
    ? `<a href="#source-file-${formatNumber(source.fileIndex)}-line-${formatNumber(violation.line)}">${label}</a>`
    : label;
};

const renderCheckstyle = (model: GradingReportModel): string => {
  const checkstyle = model.evidence?.checkstyle;
  if (checkstyle === undefined) return "";
  if (!checkstyle.available)
    return '<h3>Checkstyle</h3><p class="secondary">No Checkstyle details were reported.</p>';
  return `<h3>Checkstyle</h3>
<p>${formatNumber(checkstyle.violationCount)} ${checkstyle.violationCount === 1 ? "violation" : "violations"}</p>
${
  checkstyle.violations.length === 0
    ? '<p class="secondary">No Checkstyle violations were reported.</p>'
    : `<ol class="finding-list">${checkstyle.violations
        .map(
          (violation) =>
            `<li><p><strong>${checkstyleLocation(model, violation)}</strong> · ${escapeHtml(violation.severity)}${violation.source === undefined ? "" : ` · ${escapeHtml(violation.source)}`}</p><p class="preserve-text">${escapeHtml(violation.message)}</p></li>`
        )
        .join("")}</ol>`
}
`;
};

const renderJunitFailure = (failure: JunitFailure): string => `<li>
<p><strong>${failure.kind === "failure" ? "Failure" : "Error"}: ${escapeHtml(failure.name)}</strong>${failure.className === undefined ? "" : ` <span class="secondary">(${escapeHtml(failure.className)})</span>`}</p>
${failure.message === undefined ? "" : `<p class="preserve-text">${escapeHtml(failure.message)}</p>`}
${failure.details === undefined ? "" : `<details><summary>Details</summary><pre class="failure-details">${escapeHtml(failure.details)}</pre></details>`}
</li>`;

const renderJunit = (model: GradingReportModel): string => {
  const junit = model.evidence?.junit;
  if (junit === undefined) return "";
  if (!junit.available)
    return '<h3>Unit Tests</h3><p class="secondary">No JUnit details were reported.</p>';
  const allPassed = junit.outcome === "success" && junit.failures.length === 0;
  return `<h3>Unit Tests</h3>
<table><tbody><tr><th scope="row">Total</th><td>${formatNumber(junit.summary.total)}</td><th scope="row">Passed</th><td>${formatNumber(junit.summary.passed)}</td><th scope="row">Failed</th><td>${formatNumber(junit.summary.failed)}</td><th scope="row">Errors</th><td>${formatNumber(junit.summary.errors)}</td><th scope="row">Skipped</th><td>${formatNumber(junit.summary.skipped)}</td></tr></tbody></table>
${allPassed ? "<p>All reported tests passed.</p>" : ""}
${junit.failures.length === 0 ? "" : `<ol class="finding-list">${junit.failures.map(renderJunitFailure).join("")}</ol>`}`;
};

const renderEvidence = (model: GradingReportModel): string => {
  const evidence = model.evidence;
  if (evidence === undefined) return "";
  return `
<section id="automated-checks" aria-labelledby="automated-checks-heading">
<h2 id="automated-checks-heading">Automated Checks</h2>
<p class="secondary">Informational only; these results do not independently alter the score.</p>
<dl class="phase-grid"><dt>Compile</dt><dd><span class="outcome">${outcomeLabel(evidence.metadata.compile.outcome)}</span></dd><dt>Unit Tests</dt><dd><span class="outcome">${outcomeLabel(evidence.metadata.junit.outcome)}</span></dd><dt>Checkstyle</dt><dd><span class="outcome">${outcomeLabel(evidence.metadata.checkstyle.outcome)}</span></dd></dl>
${renderJunit(model)}
${renderCheckstyle(model)}
</section>`;
};

const renderCommitHistory = (model: GradingReportModel): string => {
  const commits = model.commitHistory;
  if (commits === undefined) return "";
  return `
<section id="commit-history" aria-labelledby="commit-history-heading">
<h2 id="commit-history-heading">Commit History</h2>
${
  commits.length === 0
    ? '<p class="secondary">No commits available.</p>'
    : `<ol class="commit-list">${commits
        .map(
          (commit) =>
            `<li><p class="commit-message">${escapeHtml(commit.message)}</p><p class="secondary"><code class="sha" title="${escapeHtml(commit.sha)}">${escapeHtml(shortSha(commit.sha, COMMIT_SHA_DISPLAY_LENGTH))}</code> · <time datetime="${escapeHtml(commit.committedAt)}">${escapeHtml(formatIsoTimestamp(commit.committedAt))}</time></p></li>`
        )
        .join("")}</ol>`
}
</section>`;
};

export const renderGradingReportHtml = (model: GradingReportModel): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(model.assignment.title)} — ${escapeHtml(model.studentId)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<main>
<header id="grade-summary" data-grading-status="${model.gradingStatus}">
<p class="course">${escapeHtml(model.course.code)} — ${escapeHtml(model.course.title)}</p>
<h1>${escapeHtml(model.assignment.title)}</h1>
<p>Student ${escapeHtml(model.studentId)}</p>
<p class="score">${formatNumber(model.grade.totalScore)} / ${formatNumber(model.grade.pointsPossible)} points</p>
<p class="status">Grading status: ${gradingStatusLabel(model.gradingStatus)}</p>
<p class="technical">Submission: <code class="sha" title="${escapeHtml(model.submissionCommitSha)}">${escapeHtml(shortSha(model.submissionCommitSha, SUBMISSION_SHA_DISPLAY_LENGTH))}</code></p>
</header>
${renderRubric(model)}
${renderGeneralFeedback(model)}
${renderSource(model)}
${renderEvidence(model)}
${renderCommitHistory(model)}
</main>
</body>
</html>
`;
