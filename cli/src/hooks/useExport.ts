import { useState } from "react";
import { saveDocument } from "@highli/core/documents";

export function useExport() {
  const [exportPath, setExportPath] = useState<string | null>(null);

  const exportReview = async (markdown: string): Promise<string> => {
    const document = await saveDocument({
      kind: "review",
      title: "Review draft",
      content: markdown,
      source: "cli",
    });
    setExportPath(document.path);
    return document.path;
  };

  const copyToClipboard = async (text: string): Promise<void> => {
    const { default: clipboardy } = await import("clipboardy");
    await clipboardy.write(text);
  };

  return { exportReview, copyToClipboard, exportPath };
}
