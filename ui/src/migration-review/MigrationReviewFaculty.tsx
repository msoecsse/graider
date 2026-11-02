import { useState, type ReactElement } from "react";
import type { MigrationReviewSessionView } from "../../electron/migrationReviewService";

export const MigrationReviewFaculty = ({
  view,
  busy,
  onVerify
}: {
  readonly view: MigrationReviewSessionView;
  readonly busy: boolean;
  readonly onVerify: (username: string, login: string, addFaculty: boolean) => Promise<void>;
}): ReactElement => {
  const [logins, setLogins] = useState<Readonly<Record<string, string>>>({});
  const [newUsername, setNewUsername] = useState("");
  const [newLogin, setNewLogin] = useState("");
  return (
    <section className="detail-panel" aria-label="Faculty identity review">
      <h2>Faculty identities</h2>
      <p>
        Choose a GitHub login and verify it remotely. Names and similar logins are suggestions,
        never proof. Numeric GitHub IDs cannot be entered as identity authority.
      </p>
      {view.analysis.faculty.map((faculty) => (
        <fieldset key={faculty.institutionalUsername}>
          <legend>{faculty.institutionalUsername}</legend>
          <p>Original spelling: {faculty.originalSpellings.join(", ")}</p>
          <p>
            Resolution:{" "}
            {faculty.resolution.value
              ? `${faculty.resolution.value.github_login} · GitHub ID ${faculty.resolution.value.github_user_id}`
              : faculty.resolution.classification}
          </p>
          <ul>
            {faculty.references.map((reference) => (
              <li key={`${reference.provenance}/${reference.location}`}>
                {reference.provenance}: {reference.location} · term {reference.termCode}
                {reference.sectionId ? ` / section ${reference.sectionId}` : ""}
                {reference.assignmentSlug
                  ? ` / assignment ownership ${reference.assignmentSlug}`
                  : ""}
              </li>
            ))}
          </ul>
          <label>
            GitHub login for {faculty.institutionalUsername}
            <input
              value={logins[faculty.institutionalUsername] ?? ""}
              disabled={busy}
              onChange={(event) =>
                setLogins({ ...logins, [faculty.institutionalUsername]: event.target.value })
              }
            />
          </label>
          {faculty.suggestions.map((suggestion) => (
            <p key={suggestion.githubLogin}>
              Suggestion: {suggestion.githubLogin} — {suggestion.reason}. Requires verification.{" "}
              <button
                className="secondary-action"
                type="button"
                disabled={busy}
                onClick={() =>
                  setLogins({ ...logins, [faculty.institutionalUsername]: suggestion.githubLogin })
                }
              >
                Use suggestion {suggestion.githubLogin}
              </button>
            </p>
          ))}
          <button
            className="secondary-action"
            type="button"
            disabled={busy || !logins[faculty.institutionalUsername]?.trim()}
            onClick={() => {
              void onVerify(
                faculty.institutionalUsername,
                logins[faculty.institutionalUsername]?.trim() ?? "",
                false
              );
            }}
          >
            Verify {faculty.institutionalUsername}
          </button>
        </fieldset>
      ))}
      <h3>Explicitly added faculty</h3>
      <ul>
        {view.verifiedFaculty
          .filter((entry) => entry.origin === "explicit_addition")
          .map((entry) => (
            <li key={entry.identity.institutional_username}>
              {entry.identity.institutional_username} → {entry.identity.github_login} · GitHub ID{" "}
              {entry.identity.github_user_id}. Added for review; no historical role is created.
            </li>
          ))}
      </ul>
      <fieldset>
        <legend>Add faculty</legend>
        <p>
          Add someone needed as fallback or coordinator even when they are absent from v1 section
          faculty.
        </p>
        <label>
          New institutional username
          <input
            value={newUsername}
            disabled={busy}
            onChange={(event) => setNewUsername(event.target.value)}
          />
        </label>
        <label>
          New faculty GitHub login
          <input
            value={newLogin}
            disabled={busy}
            onChange={(event) => setNewLogin(event.target.value)}
          />
        </label>
        <button
          className="secondary-action"
          type="button"
          disabled={busy || !newUsername || !newLogin.trim()}
          onClick={() => {
            void onVerify(newUsername, newLogin.trim(), true);
          }}
        >
          Verify and add faculty
        </button>
      </fieldset>
    </section>
  );
};
