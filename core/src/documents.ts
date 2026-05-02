import { existsSync } from "fs";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import { basename, join } from "path";

export const documentKinds = ["brag", "review", "report", "peer-collab"] as const;
export type DocumentKind = (typeof documentKinds)[number];

export interface DocumentTimeframe {
  from: string;
  to: string;
}

export interface SavedDocument {
  kind: DocumentKind;
  title: string;
  filename: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  timeframe?: DocumentTimeframe;
  source?: "cli" | "web";
}

export interface DocumentWithContent extends SavedDocument {
  content: string;
}

export interface SaveDocumentInput {
  kind: DocumentKind;
  content: string;
  title?: string;
  timeframe?: DocumentTimeframe;
  source?: "cli" | "web";
}

export interface BragManifest {
  lastRunDate: string;
  lastFilePath: string;
}

const ROOT_DIR = join(homedir(), ".highli");

const KIND_CONFIG: Record<DocumentKind, { dir: string; prefix: string; title: string }> = {
  brag: { dir: "brags", prefix: "brag", title: "Brag document" },
  review: { dir: "reviews", prefix: "review", title: "Review draft" },
  report: { dir: "reports", prefix: "report", title: "Insights report" },
  "peer-collab": {
    dir: "peer-reviews",
    prefix: "peer-collab",
    title: "Peer collaboration log",
  },
};

function isDocumentKind(kind: string): kind is DocumentKind {
  return (documentKinds as readonly string[]).includes(kind);
}

function documentDir(kind: DocumentKind): string {
  return join(ROOT_DIR, KIND_CONFIG[kind].dir);
}

function manifestPath(): string {
  return join(documentDir("brag"), "manifest.json");
}

function metadataPath(path: string): string {
  return `${path}.json`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function timestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function titleFromFilename(kind: DocumentKind, filename: string): string {
  const withoutExt = filename.replace(/\.md$/i, "");
  const prefix = KIND_CONFIG[kind].prefix;
  const raw = withoutExt.startsWith(`${prefix}-`)
    ? withoutExt.slice(prefix.length + 1)
    : withoutExt;
  const withoutStamp = raw.replace(/-\d{4}-\d{2}-\d{2}[-T]\d{2}[-:]\d{2}.*$/, "");
  const title = withoutStamp
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  return title || KIND_CONFIG[kind].title;
}

function safeFilename(filename: string): string {
  const name = basename(filename);
  if (name !== filename || !name.endsWith(".md")) {
    throw new Error("invalid document filename");
  }
  return name;
}

async function readMetadata(path: string): Promise<Partial<SavedDocument> | null> {
  try {
    const raw = await readFile(metadataPath(path), "utf-8");
    return JSON.parse(raw) as Partial<SavedDocument>;
  } catch {
    return null;
  }
}

async function toSavedDocument(kind: DocumentKind, filename: string): Promise<SavedDocument> {
  const path = join(documentDir(kind), safeFilename(filename));
  const fileStat = await stat(path);
  const metadata = await readMetadata(path);

  return {
    kind,
    title: metadata?.title ?? titleFromFilename(kind, filename),
    filename,
    path,
    createdAt: metadata?.createdAt ?? fileStat.birthtimeMs,
    updatedAt: metadata?.updatedAt ?? fileStat.mtimeMs,
    timeframe: metadata?.timeframe,
    source: metadata?.source,
  };
}

export async function saveDocument(input: SaveDocumentInput): Promise<SavedDocument> {
  const dir = documentDir(input.kind);
  await mkdir(dir, { recursive: true });

  const now = Date.now();
  const config = KIND_CONFIG[input.kind];
  const slug = slugify(input.title ?? config.title);
  const filename =
    input.kind === "brag"
      ? "brag.md"
      : `${config.prefix}${slug ? `-${slug}` : ""}-${timestamp()}.md`;
  const path = join(dir, filename);
  const existingMetadata = input.kind === "brag" ? await readMetadata(path) : null;

  await writeFile(path, input.content, "utf-8");

  const document: SavedDocument = {
    kind: input.kind,
    title: input.title ?? config.title,
    filename,
    path,
    createdAt: existingMetadata?.createdAt ?? now,
    updatedAt: now,
    timeframe: input.timeframe,
    source: input.source,
  };

  await writeFile(metadataPath(path), JSON.stringify(document, null, 2), "utf-8");

  if (input.kind === "brag") {
    await writeBragManifest({
      lastRunDate: input.timeframe?.to ?? new Date(now).toISOString().split("T")[0],
      lastFilePath: path,
    });
  }

  return document;
}

export async function listDocuments(kind?: DocumentKind): Promise<SavedDocument[]> {
  const kinds = kind ? [kind] : [...documentKinds];
  const documents: SavedDocument[] = [];

  for (const k of kinds) {
    const dir = documentDir(k);
    if (!existsSync(dir)) continue;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      documents.push(await toSavedDocument(k, entry.name));
    }
  }

  return documents.sort((a, b) => b.createdAt - a.createdAt);
}

export async function readDocument(
  kind: string,
  filename: string,
): Promise<DocumentWithContent | null> {
  if (!isDocumentKind(kind)) return null;
  try {
    const document = await toSavedDocument(kind, safeFilename(filename));
    const content = await readFile(document.path, "utf-8");
    return { ...document, content };
  } catch {
    return null;
  }
}

export async function readBragManifest(): Promise<BragManifest | null> {
  try {
    if (!existsSync(manifestPath())) return null;
    const raw = await readFile(manifestPath(), "utf-8");
    return JSON.parse(raw) as BragManifest;
  } catch {
    return null;
  }
}

export async function writeBragManifest(manifest: BragManifest): Promise<void> {
  await mkdir(documentDir("brag"), { recursive: true });
  await writeFile(manifestPath(), JSON.stringify(manifest, null, 2), "utf-8");
}

export async function readLastBragDocument(): Promise<{
  manifest: BragManifest;
  document: SavedDocument;
  content: string;
} | null> {
  const living = await readDocument("brag", "brag.md");
  if (living) {
    const { content, ...document } = living;
    return {
      manifest: {
        lastRunDate:
          living.timeframe?.to ?? new Date(living.updatedAt).toISOString().split("T")[0],
        lastFilePath: living.path,
      },
      document,
      content,
    };
  }

  const manifest = await readBragManifest();
  if (manifest && existsSync(manifest.lastFilePath)) {
    const document = await toSavedDocument("brag", basename(manifest.lastFilePath));
    return {
      manifest,
      document,
      content: await readFile(manifest.lastFilePath, "utf-8"),
    };
  }

  const [latest] = await listDocuments("brag");
  if (!latest) return null;

  return {
    manifest: {
      lastRunDate:
        latest.timeframe?.to ?? new Date(latest.createdAt).toISOString().split("T")[0],
      lastFilePath: latest.path,
    },
    document: latest,
    content: await readFile(latest.path, "utf-8"),
  };
}
