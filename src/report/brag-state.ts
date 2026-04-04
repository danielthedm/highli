import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const BRAG_DIR = join(homedir(), ".highli", "brags");
const MANIFEST_PATH = join(BRAG_DIR, "manifest.json");

interface BragManifest {
  lastRunDate: string;
  lastFilePath: string;
}

export async function readManifest(): Promise<BragManifest | null> {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    const raw = await readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw) as BragManifest;
  } catch {
    return null;
  }
}

export async function writeManifest(manifest: BragManifest): Promise<void> {
  await mkdir(BRAG_DIR, { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

export async function readLastBrag(): Promise<string | null> {
  const manifest = await readManifest();
  if (!manifest) return null;
  try {
    if (!existsSync(manifest.lastFilePath)) return null;
    return await readFile(manifest.lastFilePath, "utf-8");
  } catch {
    return null;
  }
}
