import type { ReactElement } from "react";
import type { ReusableComment } from "./GradingCommentLibraryBrowser";
import { RECENT_COMMENT_LIMIT } from "../../electron/recentCommentLimit";
const COMMENT_LABEL_LENGTH = 80;
export const RecentCommentsMenu = ({
  ids,
  comments,
  disabled,
  onApply,
  onSearch
}: {
  readonly ids: readonly string[];
  readonly comments: readonly ReusableComment[];
  readonly disabled: boolean;
  readonly onApply: (comment: ReusableComment) => void;
  readonly onSearch: () => void;
}): ReactElement => {
  const recent = ids
    .flatMap((id) => {
      const comment = comments.find((entry) => entry.id === id);
      return comment === undefined ? [] : [comment];
    })
    .slice(0, RECENT_COMMENT_LIMIT);
  return (
    <label>
      Recent Comments
      <select
        aria-label="Recent Comments"
        value=""
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === "search-library") onSearch();
          else {
            const comment = recent.find((entry) => `comment:${entry.id}` === event.target.value);
            if (comment !== undefined) onApply(comment);
          }
        }}
      >
        <option value="">
          {recent.length === 0 ? "No recently used comments" : "Choose a recent comment…"}
        </option>
        {recent.map((comment) => (
          <option key={comment.id} value={`comment:${comment.id}`}>
            {comment.title.trim() ||
              comment.text.replace(/\s+/gu, " ").trim().slice(0, COMMENT_LABEL_LENGTH)}
          </option>
        ))}
        <option value="search-library">Search comment library...</option>
      </select>
    </label>
  );
};
