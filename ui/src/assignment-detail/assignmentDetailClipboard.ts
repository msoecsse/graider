export type CopyResult = "success" | "failure";

export const copyTextToClipboard = async (value: string): Promise<CopyResult> => {
  // lib.dom types `navigator.clipboard` as always present, but it is genuinely absent outside a
  // secure context, so probe for it rather than comparing against a type that says it cannot be
  // missing.
  if (!("clipboard" in navigator)) {
    return "failure";
  }

  try {
    await navigator.clipboard.writeText(value);

    return "success";
  } catch {
    return "failure";
  }
};
