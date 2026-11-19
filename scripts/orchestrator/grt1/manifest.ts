import { z } from "zod";
import { EMPTY_SHA256, LIMITS, fail, integer, sha256 } from "./protocol.js";
const SORT_BEFORE = -1;

const fileSchema = z
  .object({
    path: z.string().min(1).max(LIMITS.path),
    mode: z.enum(["100644", "100755"]),
    size: z.number().int().min(0).max(LIMITS.file),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    repository: z.literal("msoecsse/graider"),
    branch: z.literal("remote-course-v2"),
    head: z.string().regex(/^[a-f0-9]{40}$/),
    issue: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    files: z.array(fileSchema).min(1).max(LIMITS.files)
  })
  .strict();
export type Manifest = z.infer<typeof schema>;
export interface InventoryEntry {
  path: string;
  type: "file" | "directory";
  mode: "0644" | "0755";
  size: number;
  links: number;
}
export function admitManifest(input: unknown): {
  manifest: Manifest;
  bytes: Buffer;
  inventory: Buffer;
  total: number;
  directories: number;
} {
  const parsed = schema.safeParse(input);
  if (!parsed.success) fail("manifest-schema");
  // Reconstruct ordered keys; neither insertion order nor extra keys come from the caller.
  const manifest: Manifest = {
    version: 1,
    repository: parsed.data.repository,
    branch: parsed.data.branch,
    head: parsed.data.head,
    issue: parsed.data.issue,
    files: parsed.data.files.map((file) => ({
      path: file.path,
      mode: file.mode,
      size: file.size,
      sha256: file.sha256
    }))
  };
  const entries = new Map<string, InventoryEntry>();
  const aliases = new Map<string, string>();
  let previous = "";
  let total = 0;
  let directories = 0;
  for (const file of manifest.files) {
    const parts = file.path.split("/");
    if (
      file.path <= previous ||
      !/^[A-Za-z0-9_./()-]+$/.test(file.path) ||
      parts.some(
        (part) =>
          /^(?:|\.|\.\.)$/.test(part) ||
          part.endsWith(".") ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
          /^(?:\.git|\.codex|\.agents|\.claude|\.ssh|\.aws|\.azure|\.gnupg|\.config|\.gitconfig|\.gitmodules|\.git-credentials|\.netrc|\.npmrc|\.pypirc)$/i.test(
            part
          ) ||
          /^\.env(?:\.|$)/i.test(part)
      )
    )
      fail("unsafe-path/alias");
    if (file.size === 0 && file.sha256 !== EMPTY_SHA256) fail("empty-digest");
    for (let count = 1; count <= parts.length; count++) {
      const name = parts.slice(0, count).join("/");
      const type = count === parts.length ? "file" : "directory";
      const alias = aliases.get(name.toLowerCase());
      const prior = entries.get(name);
      if ((alias !== undefined && alias !== name) || (prior && prior.type !== type))
        fail("path-collision");
      if (!prior) {
        if (type === "directory") directories++;
        entries.set(name, {
          path: name,
          type,
          mode: type === "directory" || file.mode === "100755" ? "0755" : "0644",
          size: type === "file" ? file.size : 0,
          links: type === "file" ? 1 : 0
        });
        aliases.set(name.toLowerCase(), name);
      }
    }
    total += file.size;
    previous = file.path;
  }
  integer(total, LIMITS.source);
  integer(directories, LIMITS.directories);
  const bytes = Buffer.from(JSON.stringify(manifest));
  const inventory = Buffer.from(
    JSON.stringify([...entries.values()].sort((a, b) => (a.path < b.path ? SORT_BEFORE : 1)))
  );
  integer(bytes.length, LIMITS.metadata);
  integer(inventory.length, LIMITS.metadata);
  const controls = 6;
  const exchanges =
    Math.ceil(bytes.length / LIMITS.chunk) +
    2 * Math.ceil(total / LIMITS.chunk) +
    2 * Math.ceil(inventory.length / LIMITS.chunk) +
    controls;
  integer(exchanges, LIMITS.operations);
  return { manifest, bytes, inventory, total, directories };
}
export function manifestDigest(input: unknown): string {
  return sha256(admitManifest(input).bytes);
}
