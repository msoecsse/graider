import type { BrowserWindow, shell, WebContents } from "electron";

type ExternalShell = Pick<typeof shell, "openExternal">;

export const isTrustedGitHubWebUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "github.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

const isCurrentGraiderDocument = (candidate: string, current: string): boolean => {
  try {
    const candidateUrl = new URL(candidate);
    const currentUrl = new URL(current);
    if (candidateUrl.protocol !== currentUrl.protocol) return false;
    if (candidateUrl.protocol === "file:") {
      return candidateUrl.pathname === currentUrl.pathname;
    }
    return candidateUrl.origin === currentUrl.origin;
  } catch {
    return false;
  }
};

export const registerExternalNavigation = (
  window: Pick<BrowserWindow, "webContents">,
  externalShell: ExternalShell
): void => {
  const contents: WebContents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedGitHubWebUrl(url)) void externalShell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    const currentUrl = contents.getURL();
    if (isCurrentGraiderDocument(url, currentUrl)) return;
    event.preventDefault();
    if (isTrustedGitHubWebUrl(url)) void externalShell.openExternal(url);
  });
};
