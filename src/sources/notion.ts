import { Client } from "@notionhq/client";
import type { SourceResult } from "./types.js";

function getClient(): Client {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN not set");
  }
  return new Client({ auth: process.env.NOTION_TOKEN });
}

export async function searchPages(params: {
  query: string;
  since?: string;
  until?: string;
}): Promise<SourceResult> {
  const client = getClient();

  const response = await client.search({
    query: params.query,
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: 50,
  });

  const items = response.results
    .filter((r): r is Extract<typeof r, { object: "page" }> => r.object === "page")
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

  return {
    source: "Notion Pages",
    summary: `Found ${items.length} pages matching "${params.query}"`,
    items,
    totalCount: items.length,
  };
}

export async function getPageContent(params: {
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
    summary: content.length > 2000 ? content.substring(0, 2000) + "..." : content,
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
