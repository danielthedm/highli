import { tool } from "ai";
import { z } from "zod";
import { defineSource, getSourceMethod } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";
import { claudeMcpQuery } from "./claude-mcp.js";
import { getTargetUser } from "../report/target-user.js";

const dateRange = {
  since: z.string().describe("Start date in YYYY-MM-DD format"),
  until: z.string().describe("End date in YYYY-MM-DD format"),
};

const DRIVE_API = "https://www.googleapis.com/drive/v3";

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GOOGLE_TOKEN ?? ""}`,
    Accept: "application/json",
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getDocuments(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();
  const target = getTargetUser();

  // Use Google Drive API to find docs modified in range
  const ownerFilter = target?.email ? ` and '${target.email}' in owners` : "";
  const query = `mimeType='application/vnd.google-apps.document' and modifiedTime >= '${params.since}T00:00:00' and modifiedTime <= '${params.until}T23:59:59'${ownerFilter}`;

  const allItems: SourceResult["items"] = [];
  let pageToken: string | undefined;

  while (true) {
    const searchParams = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,modifiedTime,webViewLink,owners)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
    });
    if (pageToken) searchParams.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_API}/files?${searchParams}`, { headers });
    const data = await res.json();

    for (const file of data.files ?? []) {
      allItems.push({
        title: file.name ?? "Untitled",
        description: `Owner: ${file.owners?.[0]?.displayName ?? "unknown"}`,
        date: (file.modifiedTime ?? "").split("T")[0],
        url: file.webViewLink,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken || allItems.length >= 500) break;
  }

  return {
    source: "Google Docs",
    summary: `${allItems.length} documents created/edited (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getActivity(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const headers = getHeaders();

  // Use Drive activity — list recent changes across all doc types
  const query = `modifiedTime >= '${params.since}T00:00:00' and modifiedTime <= '${params.until}T23:59:59' and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.google-apps.presentation')`;

  const searchParams = new URLSearchParams({
    q: query,
    fields: "files(id,name,modifiedTime,mimeType,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: "100",
  });

  const res = await fetch(`${DRIVE_API}/files?${searchParams}`, { headers });
  const data = await res.json();

  const mimeLabels: Record<string, string> = {
    "application/vnd.google-apps.document": "Doc",
    "application/vnd.google-apps.spreadsheet": "Sheet",
    "application/vnd.google-apps.presentation": "Slides",
  };

  const items = (data.files ?? []).map((file: any) => ({
    title: file.name ?? "Untitled",
    description: mimeLabels[file.mimeType] ?? "File",
    date: (file.modifiedTime ?? "").split("T")[0],
    url: file.webViewLink,
  }));

  return {
    source: "Google Workspace Activity",
    summary: `${items.length} files modified (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Google Docs",
  configKey: "googleDocs",
  envKey: "GOOGLE_TOKEN",
  description: "Docs created/edited, comments, and collaboration",
  tools: {
    google_docs_get_documents: tool({
      description:
        "Get Google Docs created or edited by the user in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the Google Docs ${who} created or edited from ${params.since} to ${params.until}. Include doc title, last modified date, and link. Format as markdown.`,
          );
        }
        return formatSourceResult(await getDocuments(params));
      },
    }),
    google_docs_get_activity: tool({
      description:
        "Get Google Workspace file activity (Docs, Sheets, Slides) in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name}'s (email: ${target.email})` : "my";
          return claudeMcpQuery(
            `Summarize ${who} Google Workspace activity from ${params.since} to ${params.until}. Include file names, types, and dates. Format as markdown.`,
          );
        }
        return formatSourceResult(await getActivity(params));
      },
    }),
  },
});

export default source;
