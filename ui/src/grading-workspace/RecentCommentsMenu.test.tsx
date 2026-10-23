import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentCommentsMenu } from "./RecentCommentsMenu";
import { RECENT_COMMENT_LIMIT } from "../../electron/recentCommentLimit";
const EXTRA_COMMENTS = 3;
const comments = Array.from({ length: RECENT_COMMENT_LIMIT + EXTRA_COMMENTS }, (_, index) => ({
  id: `c-${index}`,
  title: `Title ${index}`,
  text: "Body",
  defaultDeduction: -2,
  tags: ["style"]
}));
describe("Recent Comments menu", () => {
  it("resolves current definitions, ignores deleted IDs, limits rows, and uses the shared apply callback", () => {
    const onApply = vi.fn();
    const onSearch = vi.fn();
    const ids = ["deleted", ...comments.map((comment) => comment.id).reverse()];
    render(
      <RecentCommentsMenu
        ids={ids}
        comments={comments}
        disabled={false}
        onApply={onApply}
        onSearch={onSearch}
      />
    );
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(RECENT_COMMENT_LIMIT + 2);
    expect(options[1]).toHaveTextContent(comments.at(-1)!.title);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: `comment:${comments.at(-1)!.id}` }
    });
    expect(onApply).toHaveBeenCalledWith(comments.at(-1));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "search-library" } });
    expect(onSearch).toHaveBeenCalledOnce();
  });
  it("shows the empty state and resolves renamed and body-only comments without copying their content", () => {
    const props = { ids: [], comments, disabled: false, onApply: vi.fn(), onSearch: vi.fn() };
    const { rerender } = render(<RecentCommentsMenu {...props} />);
    expect(screen.getByRole("option", { name: "No recently used comments" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Search comment library..." })).toBeInTheDocument();
    rerender(
      <RecentCommentsMenu
        {...props}
        ids={["c-0"]}
        comments={[{ ...comments[0]!, title: "Renamed" }]}
      />
    );
    expect(screen.getByRole("option", { name: "Renamed" })).toBeInTheDocument();
    rerender(
      <RecentCommentsMenu
        {...props}
        ids={["c-0"]}
        comments={[{ ...comments[0]!, title: "", text: "Useful\n   feedback" }]}
      />
    );
    expect(screen.getByRole("option", { name: "Useful feedback" })).toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
  });
});
