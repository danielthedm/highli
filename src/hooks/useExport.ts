import { useState } from "react";
import { writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { format } from "date-fns";

export function useExport() {
  const [exportPath, setExportPath] = useState<string | null>(null);

  const exportReview = async (markdown: string): Promise<string> => {
    const dir = join(homedir(), ".highli", "reviews");
    await mkdir(dir, { recursive: true });

    const filename = `review-${format(new Date(), "yyyy-MM-dd-HHmm")}.md`;
    const filePath = join(dir, filename);

    await writeFile(filePath, markdown, "utf-8");
    setExportPath(filePath);
    return filePath;
  };

  const copyToClipboard = async (text: string): Promise<void> => {
    const { default: clipboardy } = await import("clipboardy");
    await clipboardy.write(text);
  };

  return { exportReview, copyToClipboard, exportPath };
}
