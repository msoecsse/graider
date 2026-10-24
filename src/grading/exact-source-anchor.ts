/** Shared conservative relocation: whole exact lines, same file, CRLF normalized. */
export const sourceLines = (text: string): string[] => text.replaceAll("\r\n", "\n").split("\n");
export const exactSourceMatches = (source: string, excerpt: string): readonly number[] => {
  const updatedLines = sourceLines(source);
  const snippet = sourceLines(excerpt);
  const matches: number[] = [];
  if (!snippet.every((line) => line.trim() === "")) {
    for (let index = 0; index <= updatedLines.length - snippet.length; index++) {
      if (snippet.every((line, offset) => updatedLines[index + offset] === line))
        matches.push(index + 1);
    }
  }
  return matches;
};
