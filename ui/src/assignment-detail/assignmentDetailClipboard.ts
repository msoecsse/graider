export type CopyResult = "success" | "failure";

export const copyTextToClipboard = async (value: string): Promise<CopyResult> => {
  if (navigator.clipboard === undefined) {
    return "failure";
  }

  try {
    await navigator.clipboard.writeText(value);

    return "success";
  } catch {
    return "failure";
  }
};
