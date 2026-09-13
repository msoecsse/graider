export interface SearchableReusableComment {
  readonly title: string;
  readonly text: string;
  readonly tags: readonly string[];
}

export const filterReusableComments = <T extends SearchableReusableComment>(
  comments: readonly T[],
  query = "",
  selectedTags: readonly string[] = []
): T[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedSelectedTags = [
    ...new Set(
      selectedTags.map((tag) => tag.trim().toLocaleLowerCase()).filter((tag) => tag !== "")
    )
  ];
  return comments.filter((comment) => {
    const tags = comment.tags.map((tag) => tag.toLocaleLowerCase());
    const matchesQuery =
      normalizedQuery === "" ||
      comment.title.toLocaleLowerCase().includes(normalizedQuery) ||
      comment.text.toLocaleLowerCase().includes(normalizedQuery) ||
      tags.some((tag) => tag.includes(normalizedQuery));
    return matchesQuery && normalizedSelectedTags.every((tag) => tags.includes(tag));
  });
};

export const listReusableCommentTags = (
  comments: readonly SearchableReusableComment[]
): string[] => {
  const tags = new Map<string, string>();
  comments.forEach((comment) =>
    comment.tags.forEach((tag) => {
      const normalized = tag.toLocaleLowerCase();
      if (!tags.has(normalized)) tags.set(normalized, tag);
    })
  );
  return [...tags.values()];
};
