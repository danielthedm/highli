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

function getAuth(): { baseUrl: string; headers: Record<string, string> } {
  const baseUrl = (process.env.CONFLUENCE_BASE_URL ?? "").replace(/\/$/, "");
  const email = process.env.CONFLUENCE_EMAIL ?? "";
  const token = process.env.CONFLUENCE_TOKEN ?? "";
  return {
    baseUrl,
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
      Accept: "application/json",
    },
  };
}

// ── API functions ───────────────────────────────────────────────────

async function getPagesAuthored(params: {
  since: string;
  until: string;
}): Promise<SourceResult> {
  const { baseUrl, headers } = getAuth();
  const target = getTargetUser();

  // Use CQL to find pages by contributor
  const contributor = target?.email ? `contributor = "${target.email}"` : "contributor = currentUser()";
  const cql = `${contributor} AND type = page AND lastmodified >= "${params.since}" AND lastmodified <= "${params.until}" ORDER BY lastmodified DESC`;

  const allItems: SourceResult["items"] = [];
  let start = 0;

  while (true) {
    const url = `${baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=50&start=${start}`;
    const res = await fetch(url, { headers });
    const data = await res.json();

    for (const page of data.results ?? []) {
      allItems.push({
        title: page.title ?? "Untitled",
        description: `Space: ${page._expandable?.space?.split("/").pop() ?? "unknown"}`,
        date: (page.history?.lastUpdated?.when ?? "").split("T")[0],
        url: `${baseUrl}/wiki${page._links?.webui ?? ""}`,
      });
    }

    start += (data.results ?? []).length;
    if (start >= (data.totalSize ?? 0) || start >= 500) break;
  }

  return {
    source: "Confluence Pages",
    summary: `Authored/edited ${allItems.length} pages (${params.since} to ${params.until})`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function searchContent(params: {
  query: string;
  since: string;
  until: string;
}): Promise<SourceResult> {
  const { baseUrl, headers } = getAuth();

  const cql = `text ~ "${params.query}" AND lastmodified >= "${params.since}" AND lastmodified <= "${params.until}" ORDER BY lastmodified DESC`;
  const url = `${baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=50`;

  const res = await fetch(url, { headers });
  const data = await res.json();

  const items = (data.results ?? []).map((page: any) => ({
    title: page.title ?? "Untitled",
    description: `Type: ${page.type ?? "page"}`,
    date: (page.history?.lastUpdated?.when ?? "").split("T")[0],
    url: `${baseUrl}/wiki${page._links?.webui ?? ""}`,
  }));

  return {
    source: "Confluence Search",
    summary: `Found ${items.length} results for "${params.query}" (${params.since} to ${params.until})`,
    items,
    totalCount: items.length,
  };
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Confluence",
  configKey: "confluence",
  envKey: "CONFLUENCE_TOKEN",
  description: "Pages authored and documentation contributions",
  tools: {
    confluence_get_pages: tool({
      description:
        "Get Confluence pages authored or edited by the user in a date range.",
      parameters: z.object(dateRange),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          const target = getTargetUser();
          const who = target ? `${target.name} (email: ${target.email})` : "I";
          return claudeMcpQuery(
            `List the Confluence pages ${who} authored or edited from ${params.since} to ${params.until}. Include: page title, space, and last modified date. Format as markdown.`,
          );
        }
        return formatSourceResult(await getPagesAuthored(params));
      },
    }),
    confluence_search: tool({
      description:
        "Search Confluence content by keyword within a date range.",
      parameters: z.object({
        query: z.string().describe("Search query for Confluence content"),
        ...dateRange,
      }),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          return claudeMcpQuery(
            `Search Confluence for content matching "${params.query}" from ${params.since} to ${params.until}. Include page titles, types, and dates. Format as markdown.`,
          );
        }
        return formatSourceResult(await searchContent(params));
      },
    }),
  },
});

export default source;
