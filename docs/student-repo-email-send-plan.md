# Student Repository Email Sending Plan

## Purpose

Plan a later, explicit-send feature for repository notification emails. This
document does not add Microsoft authentication, Graph calls, SMTP, send logs,
or runtime UI behavior.

## Current Preview Capability

Slice J provides a read-only Assignment Detail preview through a narrow
Electron API. It reads `assignment.yml`, `course.yml`, term sections, canonical
rosters, and `terms/<term-code>/manifests/<assignment-slug>/manifest.yml`.

The canonical roster columns are:

```text
student_id,github_username,email,first_name,last_name,section,status
```

Only active students with an email address and a manifest-backed repository
URL are ready. Dropped and hold students are skipped. A missing manifest is a
normal `not_ready`/repositories-not-created state, not a blocked assignment.

## Recommended Transport

Use Microsoft Graph `sendMail` in a campus-approved Entra ID configuration.
The preferred first implementation is Graph sending from an approved shared or
no-reply mailbox. It centralizes sender identity and avoids requiring each
faculty member to use a personal mailbox.

| Option                                         | Assessment                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Graph delegated, shared/no-reply mailbox       | Preferred when IT grants the signed-in faculty member Send As or Send on Behalf rights and approves the app permission.          |
| Graph delegated, faculty mailbox               | Practical fallback; sender is the faculty user and requires interactive organizational sign-in.                                  |
| Graph application permission, approved mailbox | Consider only with explicit IT approval, least-privilege mailbox scoping, secure app credential operations, and audit ownership. |
| SMTP AUTH or relay                             | Do not make this the default. It introduces password/relay policy concerns and may be disabled by the tenant.                    |
| Preview/export/manual send                     | Required fallback when campus policy or tenant configuration does not permit app-based sending.                                  |

Confirm current Graph permission names, tenant policy, and endpoints against
Microsoft documentation before implementation; this plan does not treat them
as final.

## Sender Model

Resolve the sender in this order:

1. Approved no-reply or shared mailbox.
2. Approved course mailbox.
3. Delegated faculty mailbox.
4. Preview/export only.

Graider must not assume it can send as a no-reply mailbox. Sender availability
depends on mailbox existence, tenant policy, app registration, consent, and
Send As/Send on Behalf authorization.

## Microsoft / Campus IT Requirements

Before implementation, obtain decisions on:

- Approved sender mailbox address and mailbox owner.
- Shared-mailbox Send As versus Send on Behalf rules for faculty.
- Whether Graider may be registered as an Entra ID application and which
  organizational tenant it targets.
- Delegated versus application permissions, admin-consent requirements, and
  any mailbox-scoping controls.
- External application restrictions, conditional access, account-selection UX,
  and whether messages are saved to Sent Items.
- Token lifetime, revocation, device/browser sign-in requirements, throttling,
  retention, and audit requirements.

## Authentication and Token Handling

Prefer organizational browser/OS sign-in with delegated Graph access for the
first implementation. Keep access and refresh tokens in the main process only;
never return, render, log, or persist them in the renderer, course files,
registry, or notification log. Do not store Microsoft passwords or request SMTP
passwords. Persistent refresh-token storage requires a separate explicit
security decision and OS-backed storage design.

## Sending Flow

```text
Assignment Detail
-> Preview repository emails (Slice J data)
-> review ready, skipped, and diagnostic rows
-> select all ready recipients initially
-> Preview send
-> sender, recipients, subject/body summary, duplicate warnings
-> Confirm send
-> per-recipient provider results
-> write local send log
```

The first send slice should support all-ready only. Selective send and resend
should follow after duplicate protection and send history are established.

## Duplicate Prevention and Send Log

Use a course-local, assignment-scoped generated log:

```text
terms/<term-code>/notifications/<assignment-slug>/student-repo-emails.json
```

This matches the existing term-scoped manifest and report artifact layout while
keeping notification state separate from immutable configuration. The future
implementation must confirm whether the log is committed, gitignored, or kept
outside the course repository based on IT retention and FERPA-related policy.

Before send, create a deterministic notification key from assignment path/slug,
student ID, recipient email, and repository URL. Existing successful keys
produce `already_sent` and block by default. A later explicit resend action may
override this with a recorded reason.

Suggested log shape:

```json
{
  "schemaVersion": 1,
  "assignmentFile": "...",
  "termCode": "27s1",
  "assignmentSlug": "lab02",
  "sender": "no-reply@example.edu",
  "transport": "microsoft_graph",
  "createdAt": "...",
  "messages": [
    {
      "notificationKey": "...",
      "studentId": "...",
      "githubUsername": "...",
      "email": "...",
      "repositoryUrl": "...",
      "subjectHash": "...",
      "bodyHash": "...",
      "status": "sent",
      "providerMessageId": "...",
      "sentAt": "...",
      "errorCode": null,
      "errorMessage": null
    }
  ]
}
```

Store hashes rather than full bodies by default. If full bodies are required
for auditing, document access, retention, and privacy consequences first.

## Failure Handling

Use independent recipient outcomes: `ready`, `sent`, `skipped`, `failed`,
`already_sent`, `missing_email`, `missing_repository`, `inactive`,
`auth_required`, and `transport_unavailable`. One failure produces partial
success, not a failed batch. Mark `sent` only after Graph confirms success.
Keep unsent and failed rows visible, log safe provider diagnostics, and require
an explicit later retry/resend action.

## Privacy and Compliance Considerations

Student email addresses, repository URLs, and course/assignment identifiers
are sensitive operational data. Retention, access control, whether notification
logs are committed, and who may inspect them require campus IT and policy
review. These are product and policy considerations, not legal conclusions.
Logs must contain no credentials, authorization headers, or message content by
default.

## UI Plan

Extend the existing Slice J panel rather than creating a general mail client.
Future states are: mail not configured, signed in/not signed in, sender
available/unavailable, ready to send, duplicate warning, send confirmation,
sending, partial success, complete success, failure/auth/permission denied, and
sent history. When no sender is configured, show:

> Email sending is not configured yet. You can still preview and copy repository emails.

For a shared sender, show its actual address, for example `Sender:
no-reply@example.edu`. Do not show a Send control until transport status and a
successful send preview are available.

## API and IPC Plan

Add workflow-specific, typed main-process APIs only:

- `getStudentRepoEmailTransportStatus(...)`
- `previewStudentRepoEmailSend(...)`
- `sendStudentRepoEmails(...)`
- `getStudentRepoEmailSendHistory(...)`

They should reuse Slice J recipient data and accept the registered course folder
plus assignment file. Main process code owns sign-in, token handling, Graph
requests, local log access, request validation, and redacted diagnostics.
Preload exposes narrow methods through `window.graiderUI`; renderer code gets
only safe status/result metadata. Do not add generic email, Graph, token, or
file IPC.

## Configuration Plan

Do not add mail configuration to `course.yml` until sender policy is known.
The initial decision should be between tenant/app-registration configuration
only, local app settings plus course defaults, or an optional future course
section such as `notifications.email`. A course-level sender setting must be
validated against campus-approved senders and must not contain secrets.

## Test Strategy

Mock the Graph/transport adapter and token provider. Cover transport-unavailable
and auth-required states, sender authorization, send preview without mutation,
duplicate detection, per-recipient partial success, provider message IDs,
redaction, paths with spaces, and log conflict/retention behavior. Renderer
tests mock `window.graiderUI`; no live Microsoft, GitHub, or mail calls are
permitted.

## Implementation Slices

1. **Slice L:** transport-status model, campus configuration placeholder, and
   read-only sender availability UI.
2. **Slice M:** notification-log schema, read/write service, duplicate
   detection, and history API without sending.
3. **Slice N:** delegated Microsoft Graph adapter and main-process token flow,
   all mocked in tests.
4. **Slice O:** Assignment Detail send preview, explicit confirmation, and
   per-recipient send results.
5. **Slice P:** explicit resend/selective-send controls and history management.

## Open Questions

- Which sender mailbox and authorization model will MSOE IT approve?
- Is delegated faculty sending an acceptable fallback, and should sent messages
  be saved to Sent Items?
- Where may notification logs live and how long may they be retained?
- Are application permissions and mailbox scoping permitted, or must the first
  release be delegated-only?
