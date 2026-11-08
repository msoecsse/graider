import { useEffect, useState, type ReactElement } from "react";
import type { GithubOAuthState } from "../../electron/githubOAuthTypes";
import type {
  NewRemoteCourseRequest,
  RemoteCourseSetupPreview,
  RemoteCourseSetupResult,
  SetupFacultySelection
} from "../../electron/remoteCourseSetupTypes";

const emptyFaculty = (): SetupFacultySelection => ({ institutionalUsername: "", githubLogin: "" });
export const RemoteCourseSetupPage = ({
  account,
  onBack,
  onCreated
}: {
  readonly account: GithubOAuthState | null;
  readonly onBack: () => void;
  readonly onCreated: () => void;
}): ReactElement => {
  const [request, setRequest] = useState<NewRemoteCourseRequest>({
    organization: "",
    repositoryName: "",
    courseCode: "",
    courseTitle: "",
    creatorInstitutionalUsername: "",
    termCode: "",
    coordinators: [emptyFaculty()],
    sections: [{ id: "001", faculty: [] }]
  });
  const [preview, setPreview] = useState<RemoteCourseSetupPreview | null>(null);
  const [reviewUserId, setReviewUserId] = useState<number>();
  const [result, setResult] = useState<RemoteCourseSetupResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      void window.graiderUI.remoteCourseSetup?.close?.().catch(() => {});
    },
    [account?.identity?.id]
  );
  const update = (next: NewRemoteCourseRequest) => {
    setRequest(next);
    setPreview(null);
    setMessage(null);
  };
  const facultyEditor = (
    faculty: readonly SetupFacultySelection[],
    replace: (next: readonly SetupFacultySelection[]) => void,
    label: string
  ) => (
    <fieldset>
      <legend>{label}</legend>
      {faculty.map((person, index) => (
        <div key={index}>
          <label>
            Institutional username{" "}
            <input
              aria-label={`${label} ${index + 1} institutional username`}
              value={person.institutionalUsername}
              onChange={(event) =>
                replace(
                  faculty.map((item, offset) =>
                    offset === index ? { ...item, institutionalUsername: event.target.value } : item
                  )
                )
              }
            />
          </label>
          <label>
            GitHub username{" "}
            <input
              aria-label={`${label} ${index + 1} GitHub username`}
              value={person.githubLogin}
              onChange={(event) =>
                replace(
                  faculty.map((item, offset) =>
                    offset === index ? { ...item, githubLogin: event.target.value } : item
                  )
                )
              }
            />
          </label>
          <button
            type="button"
            onClick={() => replace(faculty.filter((_, offset) => offset !== index))}
          >
            Remove {label.toLowerCase()} {index + 1}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => replace([...faculty, emptyFaculty()])}>
        Add {label.toLowerCase()}
      </button>
    </fieldset>
  );
  return (
    <main className="dashboard-shell">
      <h1>Create remote course</h1>
      <p>
        Create a private course in an existing GitHub organization. You become its fallback
        administrator. Select at least one coordinator explicitly; section teaching assignments are
        separate.
      </p>
      {!account?.identity ? (
        <p>Sign in to GitHub before creating a course.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setMessage(null);
            void window.graiderUI.remoteCourseSetup
              ?.preview(request)
              .then((review) => {
                setPreview(review);
                setReviewUserId(account.identity!.id);
              })
              .catch(() =>
                setMessage(
                  "Setup could not be verified. Check organization owner access, GitHub usernames, unique institutional usernames and explicit coordinator selections."
                )
              )
              .finally(() => setBusy(false));
          }}
        >
          <fieldset disabled={busy || result !== null}>
            <label>
              GitHub organization{" "}
              <select
                value={request.organization}
                onChange={(event) => update({ ...request, organization: event.target.value })}
                required
              >
                <option value="">Select an organization</option>
                {account.organizationDiscovery.organizations
                  .filter(
                    (org) =>
                      org.accessStatus === "accessible" &&
                      org.membershipState === "active" &&
                      org.membershipRole === "admin"
                  )
                  .map((org) => (
                    <option key={org.organizationId} value={org.login}>
                      {org.login}
                    </option>
                  ))}
              </select>
            </label>
            {(
              [
                ["repositoryName", "New private repository name"],
                ["courseCode", "Course code"],
                ["courseTitle", "Course title"],
                ["creatorInstitutionalUsername", "Your institutional username"],
                ["termCode", "Initial term code (YYs1, YYs2 or YYs3)"]
              ] as const
            ).map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  value={request[field]}
                  required
                  onChange={(event) => update({ ...request, [field]: event.target.value })}
                />
              </label>
            ))}
            {facultyEditor(
              request.coordinators,
              (coordinators) => update({ ...request, coordinators }),
              "Coordinator"
            )}
            <button
              type="button"
              onClick={() =>
                update({
                  ...request,
                  coordinators: [
                    ...request.coordinators.filter(
                      (person) =>
                        person.githubLogin.trim() !== "" &&
                        person.githubLogin !== account.identity!.login
                    ),
                    {
                      institutionalUsername: request.creatorInstitutionalUsername,
                      githubLogin: account.identity!.login
                    }
                  ]
                })
              }
            >
              Select me as a coordinator
            </button>
            {request.sections.map((section, index) => (
              <fieldset key={index}>
                <legend>Section {index + 1}</legend>
                <label>
                  Section ID
                  <input
                    value={section.id}
                    onChange={(event) =>
                      update({
                        ...request,
                        sections: request.sections.map((item, offset) =>
                          offset === index ? { ...item, id: event.target.value } : item
                        )
                      })
                    }
                    required
                  />
                </label>
                {facultyEditor(
                  section.faculty,
                  (faculty) =>
                    update({
                      ...request,
                      sections: request.sections.map((item, offset) =>
                        offset === index ? { ...item, faculty } : item
                      )
                    }),
                  `Section ${section.id} faculty`
                )}
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                update({ ...request, sections: [...request.sections, { id: "", faculty: [] }] })
              }
            >
              Add section
            </button>
            <button type="submit">Verify setup</button>
          </fieldset>
        </form>
      )}
      {preview && reviewUserId === account?.identity?.id && !result ? (
        <section aria-label="Verified remote setup">
          <h2>Verified selections</h2>
          <p>
            Fallback administrator: {preview.creator.githubLogin} (GitHub ID{" "}
            {preview.creator.githubUserId})
          </p>
          <p>
            Coordinators:{" "}
            {preview.coordinators
              .map((person) => `${person.githubLogin} (GitHub ID ${person.githubUserId})`)
              .join(", ")}
          </p>
          {preview.sections.map((section) => (
            <p key={section.id}>
              Section {section.id} faculty:{" "}
              {section.faculty.length
                ? section.faculty
                    .map((person) => `${person.githubLogin} (GitHub ID ${person.githubUserId})`)
                    .join(", ")
                : "No faculty selected"}
            </p>
          ))}
          <p>
            The initial term is Draft. Apply, grading and student repository operations remain
            unavailable until their required services and readiness evidence are available.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMessage(null);
              void window.graiderUI.remoteCourseSetup
                ?.create(preview.previewId, true)
                .then((created) => {
                  setResult(created);
                  onCreated();
                })
                .catch(() => {
                  setPreview(null);
                  setMessage(
                    "Creation was not confirmed. Refresh courses and check whether the repository exists before reviewing setup again."
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            Create private course
          </button>
        </section>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {result ? (
        <p role="status">
          {result.message} <a href={result.repositoryUrl}>Open course repository</a>
        </p>
      ) : null}
      <button type="button" disabled={busy} onClick={onBack}>
        Back to courses
      </button>
    </main>
  );
};
