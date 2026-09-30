import { useMemo, useState, type KeyboardEvent, type ReactElement } from "react";

const tagKey = (tag: string): string => tag.trim().toLocaleLowerCase();

export const ReusableCommentTagInput = ({
  tags,
  suggestions,
  disabled = false,
  onChange
}: {
  readonly tags: readonly string[];
  readonly suggestions: readonly string[];
  readonly disabled?: boolean;
  readonly onChange: (tags: readonly string[]) => void;
}): ReactElement => {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string>();
  const selected = useMemo(() => new Set(tags.map(tagKey)), [tags]);
  const matches = useMemo(
    () =>
      suggestions.filter(
        (tag) => !selected.has(tagKey(tag)) && tagKey(tag).includes(tagKey(value))
      ),
    [selected, suggestions, value]
  );
  const add = (candidate: string): void => {
    const trimmed = candidate.trim();
    if (trimmed === "") {
      setNotice("Enter a tag before adding it.");
    } else if (selected.has(tagKey(trimmed))) {
      setNotice("That tag has already been added.");
    } else {
      onChange([...tags, trimmed]);
      setValue("");
      setNotice(undefined);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(value);
    }
    if (event.key === "Backspace" && value === "" && tags.length > 0) onChange(tags.slice(0, -1));
  };
  return (
    <fieldset className="reusable-comment-tags">
      <legend>Tags</legend>
      <div className="reusable-comment-tags__tokens" aria-label="Selected tags">
        {tags.map((tag) => (
          <span className="reusable-comment-tags__token" key={tagKey(tag)}>
            {tag}
            <button
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
              onClick={() =>
                onChange(tags.filter((candidate) => tagKey(candidate) !== tagKey(tag)))
              }
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <label>
        Add a tag
        <input
          disabled={disabled}
          list="reusable-comment-tag-suggestions"
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          value={value}
        />
      </label>
      <button
        className="secondary-action"
        disabled={disabled}
        onClick={() => add(value)}
        type="button"
      >
        Add tag
      </button>
      <datalist id="reusable-comment-tag-suggestions">
        {matches.map((tag) => (
          <option key={tagKey(tag)} value={tag} />
        ))}
      </datalist>
      {notice === undefined ? null : (
        <p className="reusable-comment-tags__notice" role="status">
          {notice}
        </p>
      )}
    </fieldset>
  );
};
