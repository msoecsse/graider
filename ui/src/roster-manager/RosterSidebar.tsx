import { useState, type ReactElement } from "react";
import type { RosterRow } from "../../electron/ipc";

export const RosterFacultyPanel = ({
  faculty,
  onAdd,
  onRemove
}: {
  readonly faculty: readonly string[];
  readonly onAdd: (username: string) => void;
  readonly onRemove: (username: string) => void;
}): ReactElement => {
  const [username, setUsername] = useState("");

  return (
    <section className="roster-sidebar-card" aria-labelledby="section-faculty-title">
      <h2 id="section-faculty-title">Section faculty</h2>
      <p>MSOE usernames assigned to this section.</p>
      {faculty.length === 0 ? (
        <p className="roster-sidebar-card__empty">No faculty assigned.</p>
      ) : (
        <ul className="roster-faculty-list">
          {faculty.map((facultyUsername) => (
            <li key={facultyUsername.toLowerCase()}>
              <span>{facultyUsername}</span>
              <button
                aria-label={`Remove ${facultyUsername}`}
                onClick={() => onRemove(facultyUsername)}
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="roster-faculty-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = username.trim();
          if (trimmed.length > 0) {
            onAdd(trimmed);
            setUsername("");
          }
        }}
      >
        <label htmlFor="faculty-username">Faculty username</label>
        <div>
          <input
            id="faculty-username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="jones"
            value={username}
          />
          <button className="secondary-action" type="submit">
            Add faculty
          </button>
        </div>
      </form>
    </section>
  );
};

export const RosterStatsCard = ({
  rows
}: {
  readonly rows: readonly RosterRow[];
}): ReactElement => {
  const active = rows.filter((row) => row.status === "active").length;
  const hold = rows.filter((row) => row.status === "hold").length;
  const dropped = rows.filter((row) => row.status === "dropped").length;
  return (
    <section className="roster-sidebar-card" aria-labelledby="section-stats-title">
      <h2 id="section-stats-title">Section stats</h2>
      <dl className="roster-stats">
        <div>
          <dt>Students</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{active}</dd>
        </div>
        <div>
          <dt>On hold</dt>
          <dd>{hold}</dd>
        </div>
        <div>
          <dt>Dropped</dt>
          <dd>{dropped}</dd>
        </div>
      </dl>
      <p>Counts reflect the current draft.</p>
    </section>
  );
};
