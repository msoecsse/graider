import { createHash } from "node:crypto";
import fs from "node:fs";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";

const SHA_256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";

export type HashFileResult =
  | {
      status: "success";
      sha256: string;
    }
  | {
      status: "failure";
      diagnostic: Diagnostic;
    };

export const hashStringSha256 = (value: string): string =>
  createHash(SHA_256_ALGORITHM).update(value).digest(HEX_ENCODING);

export const hashBufferSha256 = (value: Buffer): string =>
  createHash(SHA_256_ALGORITHM).update(value).digest(HEX_ENCODING);

export const hashFileSha256 = (filePath: string): HashFileResult => {
  if (!fs.existsSync(filePath)) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.SourceFileMissing,
        `Source file ${filePath} was not found.`,
        {
          filePath
        }
      )
    };
  }

  const fileStats = fs.statSync(filePath);

  if (!fileStats.isFile()) {
    return {
      status: "failure",
      diagnostic: createConfigDiagnostic(
        DiagnosticCode.SourceFileNotFile,
        `Source path ${filePath} is not a file.`,
        {
          filePath
        }
      )
    };
  }

  return {
    status: "success",
    sha256: hashBufferSha256(fs.readFileSync(filePath))
  };
};
