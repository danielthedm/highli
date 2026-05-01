import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { getCompanyDatabaseUrl } from "@/lib/company/runtime";

type HighliGlobal = typeof globalThis & {
  __highliPgPool?: Pool;
  __highliDrizzle?: NodePgDatabase<typeof schema>;
};

function getGlobal(): HighliGlobal {
  return globalThis as HighliGlobal;
}

export function getCompanyPool(): Pool {
  const url = getCompanyDatabaseUrl();
  if (!url) {
    throw new Error("company database URL is not configured");
  }

  const global = getGlobal();
  if (!global.__highliPgPool) {
    global.__highliPgPool = new Pool({ connectionString: url });
  }
  return global.__highliPgPool;
}

export function getCompanyDb(): NodePgDatabase<typeof schema> {
  const global = getGlobal();
  if (!global.__highliDrizzle) {
    global.__highliDrizzle = drizzle(getCompanyPool(), { schema });
  }
  return global.__highliDrizzle;
}

export async function pingCompanyDb(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getCompanyPool().query("select 1");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
