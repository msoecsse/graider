import { realpathSync } from "node:fs";

// Match fs/promises.realpath used by the Git workspace factory. Legacy realpath
// can retain Windows short-path aliases instead of the OS-native canonical name.
const nativeRealpath = realpathSync.native;
export const canonicalFilesystemRoot = (root: string): string => nativeRealpath(root);
export const sameFilesystemRoot = (left: string, right: string): boolean =>
  canonicalFilesystemRoot(left) === canonicalFilesystemRoot(right);
