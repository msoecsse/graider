export const normalizeFacultyUsernames = (
  faculty: readonly string[]
): { faculty: string[]; hasBlankEntries: boolean } => ({
  faculty: [...new Set(faculty.map((username) => username.trim()).filter(Boolean))],
  hasBlankEntries: faculty.some((username) => username.trim().length === 0)
});
