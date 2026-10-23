import fs from "node:fs";
import path from "node:path";
/** Main-process only. Never import this module from preload or renderer. */
export const readGithubOAuthSecret = (): string | undefined => {
  const developmentSecret = process.env.GRAIDER_GITHUB_OAUTH_CLIENT_SECRET;
  if (developmentSecret) return developmentSecret;
  try {
    const config: unknown = JSON.parse(
      fs.readFileSync(path.join(__dirname, "github-oauth.release.json"), "utf8")
    );
    if (
      typeof config === "object" &&
      config !== null &&
      "clientSecret" in config &&
      typeof config.clientSecret === "string"
    )
      return config.clientSecret;
  } catch {
    /* Missing configuration is presented as a sanitized sign-in error. */
  }
  return undefined;
};
