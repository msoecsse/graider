const JSON_INDENT_SPACES = 2;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const orderValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(orderValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, orderValue(nestedValue)])
    );
  }

  return value;
};

export const stringifyStableJson = (value: unknown): string =>
  JSON.stringify(orderValue(value), undefined, JSON_INDENT_SPACES);
