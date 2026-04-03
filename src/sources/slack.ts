import { WebClient } from "@slack/web-api";
import { getConfig } from "../config/defaults.js";
import type { SourceResult } from "./types.js";

function getClient(): WebClient {
  if (!process.env.SLACK_TOKEN) {
    throw new Error("SLACK_TOKEN not set");
  }
  return new WebClient(process.env.SLACK_TOKEN);
}

export async function searchMessages(params: {
  query: string;
  since: string;
  until: string;
  channels?: string[];
}): Promise<SourceResult> {
  const client = getClient();
  const config = getConfig();

  const afterDate = params.since.replace(/-/g, "-");
  const beforeDate = params.until.replace(/-/g, "-");
  let query = `from:${config.slack.userId ?? "me"} after:${afterDate} before:${beforeDate}`;
  if (params.query) {
    query += ` ${params.query}`;
  }
  if (params.channels?.length) {
    query += ` in:${params.channels.join(" in:")}`;
  }

  const result = await client.search.messages({
    query,
    sort: "timestamp",
    sort_dir: "desc",
    count: 100,
  });

  const matches = result.messages?.matches ?? [];
  const items = matches.map((msg) => ({
    title:
      (msg.text ?? "").length > 100
        ? (msg.text ?? "").substring(0, 100) + "..."
        : (msg.text ?? ""),
    description: `in #${msg.channel?.name ?? "unknown"}`,
    date: msg.ts
      ? new Date(Number(msg.ts) * 1000).toISOString().split("T")[0]
      : "",
    url: msg.permalink,
  }));

  const channels = new Set(matches.map((m) => m.channel?.name).filter(Boolean));

  return {
    source: "Slack Messages",
    summary: `Found ${result.messages?.total ?? 0} messages across ${channels.size} channels (${params.since} to ${params.until}). Top channels: ${[...channels].slice(0, 5).join(", ")}`,
    items,
    totalCount: result.messages?.total ?? 0,
  };
}

export async function getChannelActivity(params: {
  channels: string[];
  since: string;
  until: string;
}): Promise<SourceResult> {
  const client = getClient();
  const config = getConfig();
  const userId = config.slack.userId;

  const items: SourceResult["items"] = [];
  let total = 0;

  for (const channel of params.channels) {
    // Find channel ID
    const listResult = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
    });

    const ch = listResult.channels?.find((c) => c.name === channel);
    if (!ch?.id) continue;

    const history = await client.conversations.history({
      channel: ch.id,
      oldest: String(new Date(params.since).getTime() / 1000),
      latest: String(new Date(params.until).getTime() / 1000),
      limit: 200,
    });

    const myMessages = (history.messages ?? []).filter(
      (m) => m.user === userId,
    );
    total += myMessages.length;

    items.push({
      title: `#${channel}`,
      description: `${myMessages.length} messages sent`,
      date: params.since,
      metrics: { messages: myMessages.length },
    });
  }

  return {
    source: "Slack Channel Activity",
    summary: `${total} messages across ${params.channels.length} channels (${params.since} to ${params.until})`,
    items,
    totalCount: total,
  };
}
