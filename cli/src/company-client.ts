import { listDocuments, saveDocument, type SavedDocument } from "@highli/core/documents";
import { getConfig, setConfig } from "@highli/core";
import { getCurrentGoal } from "@highli/core/db";

export interface CompanyConnection {
  serverUrl: string;
  token?: string;
  devUser?: string;
}

export function getCompanyConnection(): CompanyConnection | null {
  const company = getConfig().company;
  if (!company.serverUrl) return null;
  return {
    serverUrl: company.serverUrl.replace(/\/$/, ""),
    token: company.token,
    devUser: company.devUser,
  };
}

export async function connectCompany(serverUrl: string, devUser?: string) {
  const url = serverUrl.replace(/\/$/, "");
  const token = devUser ? `dev:${devUser}` : undefined;
  setConfig("company", {
    serverUrl: url,
    token,
    devUser,
    connectedAt: new Date().toISOString(),
  });

  const uploaded = await uploadSoloSnapshot({ serverUrl: url, token, devUser });
  return { serverUrl: url, uploaded };
}

export async function disconnectCompany() {
  const connection = getCompanyConnection();
  if (!connection) return { disconnected: false, downloaded: 0 };
  const downloaded = await downloadCompanyDocuments(connection);
  setConfig("company", {});
  return { disconnected: true, downloaded };
}

export async function fetchLatestCompanyBrag(connection: CompanyConnection): Promise<string | null> {
  const res = await fetch(`${connection.serverUrl}/api/me/documents?kind=brag`, {
    headers: headersFor(connection),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { documents?: Array<{ content?: string }> };
  return json.documents?.[0]?.content ?? null;
}

async function uploadSoloSnapshot(connection: CompanyConnection) {
  let uploaded = 0;
  const goal = getCurrentGoal();
  if (goal) {
    const res = await fetch(`${connection.serverUrl}/api/me/goal`, {
      method: "PUT",
      headers: { ...headersFor(connection), "content-type": "application/json" },
      body: JSON.stringify({
        text: goal.text,
        level: goal.level ?? undefined,
        skills: goal.skills ?? undefined,
        growthAreas: goal.growthAreas ?? undefined,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  const documents = await listDocuments();
  for (const document of documents) {
    const content = await readDocumentContent(document);
    const res = await fetch(`${connection.serverUrl}/api/me/documents`, {
      method: "POST",
      headers: { ...headersFor(connection), "content-type": "application/json" },
      body: JSON.stringify({
        kind: document.kind,
        title: document.title,
        content,
        metadata: {
          timeframe: document.timeframe,
          source: "cli-connect",
          localPath: document.path,
        },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    uploaded += 1;
  }

  return uploaded;
}

async function downloadCompanyDocuments(connection: CompanyConnection) {
  const res = await fetch(`${connection.serverUrl}/api/me/documents`, {
    headers: headersFor(connection),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as {
    documents?: Array<{
      kind: SavedDocument["kind"];
      title: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>;
  };

  let downloaded = 0;
  for (const document of json.documents ?? []) {
    await saveDocument({
      kind: document.kind,
      title: document.title,
      content: document.content,
      source: "web",
      timeframe: document.metadata?.timeframe as any,
    });
    downloaded += 1;
  }
  return downloaded;
}

async function readDocumentContent(document: SavedDocument) {
  const { readFile } = await import("fs/promises");
  return readFile(document.path, "utf-8");
}

function headersFor(connection: CompanyConnection): Record<string, string> {
  if (connection.devUser) return { "x-highli-dev-user": connection.devUser };
  if (connection.token?.startsWith("dev:")) {
    return { "x-highli-dev-user": connection.token.slice("dev:".length) };
  }
  return connection.token ? { authorization: `Bearer ${connection.token}` } : {};
}
