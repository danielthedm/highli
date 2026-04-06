import { tool } from "ai";
import { z } from "zod";
import { Client } from "@notionhq/client";
import { defineSource, getSourceMethod } from "./registry.js";
import { formatSourceResult, type SourceResult } from "./types.js";
import { claudeMcpQuery } from "./claude-mcp.js";

const dateRange = {
  since: z.string().describe("Start date in YYYY-MM-DD format"),
  until: z.string().describe("End date in YYYY-MM-DD format"),
};

function getClient(): Client {
  return new Client({ auth: process.env.NOTION_TOKEN });
}

// ── API functions ───────────────────────────────────────────────────

async function searchPages(params: {
  query: string;
  since?: string;
  until?: string;
}): Promise<SourceResult> {
  const client = getClient();

  const allItems: SourceResult["items"] = [];
  let startCursor: string | undefined;

  while (true) {
    const response = await client.search({
      query: params.query,
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
      start_cursor: startCursor,
    });

    const pages = response.results
      .filter(
        (r): r is Extract<typeof r, { object: "page" }> => r.object === "page",
      )
      .filter((page) => {
        if (!params.since || !params.until) return true;
        const edited = "last_edited_time" in page ? page.last_edited_time : "";
        return edited >= params.since && edited <= params.until;
      })
      .map((page) => {
        const title = getPageTitle(page);
        const edited = "last_edited_time" in page ? page.last_edited_time : "";
        const url = "url" in page ? page.url : undefined;
        return {
          title,
          description: `Last edited: ${edited.split("T")[0]}`,
          date: edited.split("T")[0],
          url,
        };
      });

    allItems.push(...pages);

    if (!response.has_more || !response.next_cursor) break;
    startCursor = response.next_cursor;
    if (allItems.length >= 500) break; // Safety cap
  }

  return {
    source: "Notion Pages",
    summary: `Found ${allItems.length} pages matching "${params.query}"`,
    items: allItems,
    totalCount: allItems.length,
  };
}

async function getPageContent(params: {
  pageId: string;
}): Promise<SourceResult> {
  const client = getClient();

  const blocks = await client.blocks.children.list({
    block_id: params.pageId,
    page_size: 100,
  });

  const textParts: string[] = [];
  for (const block of blocks.results) {
    const text = extractBlockText(block);
    if (text) textParts.push(text);
  }

  const content = textParts.join("\n");

  return {
    source: "Notion Page Content",
    summary:
      content.length > 2000 ? content.substring(0, 2000) + "..." : content,
    items: [],
    totalCount: 1,
  };
}

function getPageTitle(page: any): string {
  const props = page.properties ?? {};
  for (const prop of Object.values(props) as any[]) {
    if (prop.type === "title" && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function extractBlockText(block: any): string {
  const type = block.type;
  const content = block[type];
  if (!content?.rich_text) return "";
  return content.rich_text.map((t: any) => t.plain_text).join("");
}

// ── Source definition ───────────────────────────────────────────────

const source = defineSource({
  name: "Notion",
  configKey: "notion",
  envKey: "NOTION_TOKEN",
  description: "Page search and document content retrieval",
  tools: {
    notion_search_pages: tool({
      description:
        "Search Notion for pages matching a query. Returns page titles, last edited dates, and URLs.",
      parameters: z.object({
        query: z.string().describe("Search query for Notion pages"),
        ...dateRange,
      }),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          return claudeMcpQuery(
            `Search Notion for pages matching "${params.query}" edited between ${params.since} and ${params.until}. List each page with its title, last edited date, and URL. Format as markdown.`,
          );
        }
        return formatSourceResult(await searchPages(params));
      },
    }),
    notion_get_page_content: tool({
      description:
        "Get the text content of a specific Notion page by ID. Use this to read documents like company values, team goals, or project docs.",
      parameters: z.object({
        pageId: z.string().describe("The Notion page ID"),
      }),
      execute: async (params) => {
        if (getSourceMethod(source) === "claude-mcp") {
          return claudeMcpQuery(
            `Get the full text content of the Notion page with ID "${params.pageId}". Return the content as markdown.`,
          );
        }
        return formatSourceResult(await getPageContent(params));
      },
    }),
  },
});

export default source;
