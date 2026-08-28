import path from "node:path";

const VITE_DEV_SERVER_URL_ENV = "VITE_DEV_SERVER_URL";

export const getPreloadPath = (baseDirectory: string = __dirname): string =>
  path.join(baseDirectory, "preload.js");

export const getRendererEntry = (baseDirectory: string = __dirname): string =>
  path.join(baseDirectory, "..", "dist", "index.html");

export const getRendererDevServerUrl = (
  env: NodeJS.ProcessEnv = process.env
): string | undefined => {
  const configuredUrl = env[VITE_DEV_SERVER_URL_ENV]?.trim();

  return configuredUrl === undefined || configuredUrl.length === 0 ? undefined : configuredUrl;
};
