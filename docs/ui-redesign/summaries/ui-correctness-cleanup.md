# UI correctness cleanup

The UI correctness cleanup resolved items 13, 20, 21, 24, 25, and 52:

- Removed the duplicate assignment file path from Advanced details while keeping it in Technical details.
- Added a lightweight shared confirmation dialog before removing a registered course folder.
- Replaced invalid-date raw timestamp fallbacks with the established absence wording.
- Humanized `warning` and `info` diagnostic severities through the shared status formatter.
- Removed repository-download destination and local filesystem paths from the transient result panel. They were intentionally omitted rather than moved into Technical details because retaining transient target paths would require disproportionate new page state.
- Humanized Assignment Edit status option labels while preserving canonical submitted values.

Focused renderer tests cover each behavior, including cancellation/confirmation,
path visibility, malformed timestamps, shared severity labels, and canonical
status values. Older structural and test debt items were deliberately deferred.
