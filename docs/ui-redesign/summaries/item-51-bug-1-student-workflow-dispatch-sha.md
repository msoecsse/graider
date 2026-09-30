# ITEM-51-BUG-1 — single-student replace-and-run submission SHA fallback

## Summary

The single-student **Replace Graider workflow…** action could install the
workflow but could not start grading when grading state did not already contain
a submission SHA. It returned `submission_commit_unavailable` before it could
dispatch, while replacement-only worked because it deliberately requires no
submission SHA.

## Fix and trust boundary

For replace-and-run only, the single-student Electron service now mirrors bulk
repair's trusted local fallback. After normal preparation returns
`submission_commit_unavailable`, it resolves the registered local repository
using only the trusted course, term, assignment, and student identity; reads
local Git `HEAD`; and retries preparation with that SHA. GitHub authentication
and any repository mutation occur only after the retry succeeds.

The renderer still supplies neither a local path nor a SHA. Missing,
unavailable, or unreadable locator records return safe distinct failures; an
unverifiable local HEAD returns `submission_commit_unavailable`. No remote
branch-HEAD fallback was added. Replacement-only still skips local HEAD lookup
and dispatch entirely.

## UI and tests

`submission_commit_unavailable` now explains that workflow replacement remains
available but grading needs a verified submission commit, with a refresh,
re-download, or replacement-only remedy. A registry-read failure also has a
safe specific message without exposing paths.

Focused service and workspace tests cover the trusted retry, replacement-only
path, locator/HEAD failures, no GitHub authentication or mutation on failed
preparation, and the actionable UI message. Full validation is recorded with
this change.

## Manual retest

Live acceptance is complete: explicit Graider workflow replacement followed by
a grading rerun succeeded across a full course. This closes the documented
replace-and-run acceptance gap for the repaired path. The test result confirms
successful replacement followed by grading; it does not by itself establish a
new remote-branch-HEAD fallback or broader JavaFX module support.
