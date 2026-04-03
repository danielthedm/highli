import { readFile } from "fs/promises";
import { extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function readImageAsBase64(filePath: string): Promise<{
  base64: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}> {
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];

  if (!mimeType) {
    throw new Error(
      `Unsupported image format: ${ext}. Supported: png, jpg, gif, webp`,
    );
  }

  const buffer = await readFile(filePath);

  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Image file too large (max 20MB)");
  }

  return {
    base64: buffer.toString("base64"),
    mimeType: mimeType as any,
  };
}
