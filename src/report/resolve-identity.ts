import { Octokit } from "@octokit/rest";
import { LinearClient } from "@linear/sdk";
import { WebClient } from "@slack/web-api";
import { Client } from "@notionhq/client";
import { execSync } from "child_process";
import { getActiveSources, getSourceMethod } from "../sources/registry.js";
import type { TargetUser } from "./target-user.js";

export interface ResolveResult {
  targetUser: TargetUser;
  resolved: { source: string; detail: string }[];
  warnings: string[];
}

// ── Per-source resolvers ────────────────────────────────────────────

async function resolveGitHub(
  name: string,
  email: string,
): Promise<{ username: string } | null> {
  const token =
    process.env.GITHUB_TOKEN ??
    (() => {
      try {
        return execSync("gh auth token", { encoding: "utf-8" }).trim();
      } catch {
        return undefined;
      }
    })();
  if (!token) return null;

  const octokit = new Octokit({ auth: token });

  // Try email search first
  try {
    const { data } = await octokit.search.users({
      q: `${email} in:email`,
    });
    if (data.total_count > 0) return { username: data.items[0].login };
  } catch {}

  // Fallback: search by name
  try {
    const { data } = await octokit.search.users({
      q: `fullname:${name}`,
    });
    if (data.total_count > 0) return { username: data.items[0].login };
  } catch {}

  return null;
}

async function resolveLinear(
  name: string,
  email: string,
): Promise<{ userId: string; displayName: string } | null> {
  if (!process.env.LINEAR_API_KEY) return null;
  const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

  const users = await client.users();
  const byEmail = users.nodes.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (byEmail) return { userId: byEmail.id, displayName: byEmail.displayName };

  const byName = users.nodes.find(
    (u) => u.displayName.toLowerCase() === name.toLowerCase(),
  );
  if (byName) return { userId: byName.id, displayName: byName.displayName };

  return null;
}

async function resolveSlack(
  _name: string,
  email: string,
): Promise<{ userId: string } | null> {
  if (!process.env.SLACK_TOKEN) return null;
  const client = new WebClient(process.env.SLACK_TOKEN);

  try {
    const result = await client.users.lookupByEmail({ email });
    if (result.user?.id) return { userId: result.user.id };
  } catch {
    // lookupByEmail throws if user not found
  }

  return null;
}

async function resolveNotion(
  name: string,
  email: string,
): Promise<{ userId: string } | null> {
  if (!process.env.NOTION_TOKEN) return null;
  const client = new Client({ auth: process.env.NOTION_TOKEN });

  try {
    const { results } = await client.users.list({});
    const match = results.find((u) => {
      if (u.type !== "person") return false;
      const person = u as any;
      if (person.person?.email?.toLowerCase() === email.toLowerCase())
        return true;
      if (u.name?.toLowerCase() === name.toLowerCase()) return true;
      return false;
    });
    return match ? { userId: match.id } : null;
  } catch {
    return null;
  }
}

// ── Orchestrator ────────────────────────────────────────────────────

export async function resolveIdentity(
  name: string,
  email: string,
): Promise<ResolveResult> {
  const targetUser: TargetUser = { name, email };
  const resolved: ResolveResult["resolved"] = [];
  const warnings: string[] = [];

  const activeSources = getActiveSources();
  const activeNames = new Set(activeSources.map((s) => s.name));

  // Build resolver tasks for token/cli-mode sources only
  const tasks: { source: string; promise: Promise<void> }[] = [];

  if (activeNames.has("GitHub")) {
    const method = getSourceMethod(
      activeSources.find((s) => s.name === "GitHub")!,
    );
    if (method === "token" || method === "cli") {
      tasks.push({
        source: "GitHub",
        promise: resolveGitHub(name, email).then((result) => {
          if (result) {
            targetUser.github = result;
            resolved.push({
              source: "GitHub",
              detail: `@${result.username}`,
            });
          } else {
            warnings.push("GitHub: could not find user (will search by name)");
          }
        }),
      });
    }
  }

  if (activeNames.has("Linear")) {
    const method = getSourceMethod(
      activeSources.find((s) => s.name === "Linear")!,
    );
    if (method === "token") {
      tasks.push({
        source: "Linear",
        promise: resolveLinear(name, email).then((result) => {
          if (result) {
            targetUser.linear = result;
            resolved.push({
              source: "Linear",
              detail: result.displayName,
            });
          } else {
            warnings.push("Linear: could not find user (will search by name)");
          }
        }),
      });
    }
  }

  if (activeNames.has("Slack")) {
    const method = getSourceMethod(
      activeSources.find((s) => s.name === "Slack")!,
    );
    if (method === "token") {
      tasks.push({
        source: "Slack",
        promise: resolveSlack(name, email).then((result) => {
          if (result) {
            targetUser.slack = result;
            resolved.push({
              source: "Slack",
              detail: result.userId,
            });
          } else {
            warnings.push("Slack: could not find user (will search by name)");
          }
        }),
      });
    }
  }

  if (activeNames.has("Notion")) {
    const method = getSourceMethod(
      activeSources.find((s) => s.name === "Notion")!,
    );
    if (method === "token") {
      tasks.push({
        source: "Notion",
        promise: resolveNotion(name, email).then((result) => {
          if (result) {
            targetUser.notion = result;
            resolved.push({ source: "Notion", detail: result.userId });
          } else {
            warnings.push(
              "Notion: could not find user (will search globally)",
            );
          }
        }),
      });
    }
  }

  // Run all resolutions in parallel
  await Promise.allSettled(tasks.map((t) => t.promise));

  return { targetUser, resolved, warnings };
}
