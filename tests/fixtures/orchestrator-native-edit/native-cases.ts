// Offline fixture construction only. Nothing here launches an agent or certifies isolation.
export interface NativeCase {
  id: string;
  patch: string;
  expected: "completed" | "rejected";
}
export interface NativeObservation {
  id: string;
  outcome: "completed" | "rejected";
}

export function nativeCases(
  hostPaths: readonly { path: string; contents: string }[]
): NativeCase[] {
  const add = (file: string, contents: string): string =>
    `*** Begin Patch\n*** Add File: ${file}\n+${contents}\n*** End Patch`;
  const cases: NativeCase[] = [
    { id: "valid-add", patch: add("native-codex.txt", "native-codex-edit"), expected: "completed" },
    {
      id: "valid-update",
      patch:
        "*** Begin Patch\n*** Update File: native-codex.txt\n@@\n-native-codex-edit\n+native-codex-updated\n*** End Patch",
      expected: "completed"
    },
    { id: "valid-delete-setup", patch: add("delete-me.txt", "delete-me"), expected: "completed" },
    {
      id: "valid-delete",
      patch: "*** Begin Patch\n*** Delete File: delete-me.txt\n*** End Patch",
      expected: "completed"
    }
  ];
  for (const [index, hostFile] of hostPaths.entries()) {
    cases.push(
      {
        id: `host-read-update-${String(index)}`,
        patch: `*** Begin Patch\n*** Update File: ${hostFile.path}\n@@\n-${hostFile.contents}\n+attack\n*** End Patch`,
        expected: "rejected"
      },
      { id: `host-add-${String(index)}`, patch: add(hostFile.path, "attack"), expected: "rejected" }
    );
  }
  for (const file of [
    "/guest-protected.txt",
    "/work/escape",
    "/work/.git/config",
    "/tmp/native-outside.txt",
    "/work/../native-outside.txt",
    "/work/escape-dir/guest-protected.txt"
  ]) {
    cases.push({ id: `deny-${file}`, patch: add(file, "attack"), expected: "rejected" });
  }
  return cases;
}

// One rejected tool promise must never prevent later hostile cases from being attempted.
export function nativeFixtureCode(cases: readonly NativeCase[]): string {
  return cases
    .map(
      ({ id, patch }) => `try {
  await tools.apply_patch(${JSON.stringify(patch)});
  text(${JSON.stringify(JSON.stringify({ id, outcome: "completed" }))});
} catch {
  text(${JSON.stringify(JSON.stringify({ id, outcome: "rejected" }))});
}`
    )
    .join("\n");
}

// This checks call coverage/outcomes only. Independently verify guest bytes, host hashes,
// VM argv, process exit and fresh boot; a successful Responses turn proves none of those.
export function verifyNativeObservations(
  cases: readonly NativeCase[],
  observations: readonly NativeObservation[]
): void {
  const expected = new Map(cases.map((entry) => [entry.id, entry.expected]));
  const seen = new Set<string>();
  if (expected.size !== cases.length || cases.length === 0)
    throw new Error("Invalid case manifest");
  for (const observation of observations) {
    if (seen.has(observation.id) || expected.get(observation.id) !== observation.outcome) {
      throw new Error(`Unexpected native outcome: ${observation.id}`);
    }
    seen.add(observation.id);
  }
  if (seen.size !== expected.size) throw new Error("Native cases were not all reached");
}
