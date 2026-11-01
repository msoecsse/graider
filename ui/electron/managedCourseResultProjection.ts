/**
 * Project main-owned course roots in structured IPC result DTOs. Dashboard cards,
 * diagnostics and course reads contain nested records/arrays, so traverse values
 * without serializing them. Only whole values equal to the trusted root change;
 * prose, relative paths and other strings retain their original meaning.
 */
export const projectManagedCourseResult = <T>(
  result: T,
  managedRoot: string,
  publicSelector: string
): T => {
  const project = (value: unknown): unknown => {
    if (typeof value === "string") return value === managedRoot ? publicSelector : value;
    if (Array.isArray(value)) return value.map(project);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, project(item)]));
    return value;
  };
  return project(result) as T;
};
