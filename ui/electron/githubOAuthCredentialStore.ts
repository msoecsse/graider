import fs from "node:fs/promises";
import path from "node:path";

export interface GithubOAuthCredentialStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  delete(): Promise<void>;
}
interface SecureStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  getSelectedStorageBackend(): string;
}
/** The only on-disk representation is OS-encrypted ciphertext, outside normal settings. */
export const createGithubOAuthCredentialStore = (
  file: string,
  storage: SecureStorage,
  platform: NodeJS.Platform = process.platform
): GithubOAuthCredentialStore => {
  const requireEncryption = (): void => {
    if (
      !storage.isEncryptionAvailable() ||
      (platform === "linux" &&
        ["basic_text", "unknown"].includes(storage.getSelectedStorageBackend()))
    ) {
      throw new Error("Secure credential storage unavailable.");
    }
  };
  return {
    async load() {
      try {
        const encrypted = await fs.readFile(file);
        requireEncryption();
        return storage.decryptString(encrypted);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new Error("Secure credential storage unavailable.");
      }
    },
    async save(token) {
      requireEncryption();
      const encrypted = storage.encryptString(token);
      const temporary = `${file}.tmp`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        await fs.writeFile(temporary, encrypted, { mode: 0o600 });
        await fs.rename(temporary, file);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    },
    async delete() {
      await fs.rm(file, { force: true });
    }
  };
};
