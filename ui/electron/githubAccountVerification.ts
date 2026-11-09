import { AsyncLocalStorage } from "node:async_hooks";
import type { VerifiedGithubAccount } from "./githubOrganizations.js";

interface AccountVerificationContext {
  readonly credential: string;
  readonly account: (signal?: AbortSignal) => Promise<VerifiedGithubAccount>;
  readonly confirmRejection: () => Promise<void>;
}
// Main-only operation context; neither credentials nor verification evidence cross IPC.
const verification = new AsyncLocalStorage<AccountVerificationContext | undefined>();
export const withGithubAccountVerification = <T>(
  context: AccountVerificationContext,
  operation: () => Promise<T>
): Promise<T> => verification.run(context, operation);

export const verifiedGithubAccount = (
  credential: string
): AccountVerificationContext["account"] | undefined => {
  const context = verification.getStore();
  return context?.credential === credential ? context.account : undefined;
};

/** Establishment and exceptional confirmation always use the real global endpoint. */
export const withoutGithubAccountVerification = <T>(operation: () => Promise<T>): Promise<T> =>
  verification.run(undefined, operation);

export const confirmGithubCredentialRejection = async (): Promise<void> => {
  await verification.getStore()?.confirmRejection();
};
