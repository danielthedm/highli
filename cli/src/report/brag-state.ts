import {
  readBragManifest,
  readLastBragDocument,
  writeBragManifest,
  type BragManifest,
} from "@highli/core/documents";

export type { BragManifest };

export async function readManifest(): Promise<BragManifest | null> {
  return readBragManifest();
}

export async function writeManifest(manifest: BragManifest): Promise<void> {
  await writeBragManifest(manifest);
}

export async function readLastBrag(): Promise<string | null> {
  return (await readLastBragDocument())?.content ?? null;
}
