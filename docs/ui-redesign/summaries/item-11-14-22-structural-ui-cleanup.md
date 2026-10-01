# ITEM-11, ITEM-14, and ITEM-22 — Structural UI cleanup

## Outcome

PageHeader now has a typed optional blocked primary-action variant, so
Assignment Detail passes its lifecycle action through `primaryAction` rather
than rendering it in the overflow slot.

Assignment Detail's former **Advanced details** disclosure is now
**Configuration and tools**: secondary faculty-facing operational and
configuration controls. The existing sidebar **Technical details** disclosure
remains the one canonical home for raw implementation identifiers and plumbing.
Workflow path was removed from GradingPanel and GradeWorkflowPanel; Technical
details retains its canonical copyable path. Overflow menu commands still open
Configuration and tools and focus Group settings or Grade workflow.

Assignment Detail and Apply Preview now use the shared clipboard helper, and
the duplicate assignment-detail implementation is deleted.

## Validation

Focused PageHeader and Assignment Detail panel/page coverage verifies the
blocked action, renamed disclosure, canonical workflow path, and overflow
navigation behavior.
