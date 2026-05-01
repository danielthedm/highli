import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const databaseUrl =
  process.env.HIGHLI_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "postgres://highli:highli@localhost:5432/highli";

const migrations = [
  {
    tag: "0000_omniscient_thaddeus_ross",
    path: join(repoRoot, "drizzle", "0000_omniscient_thaddeus_ross.sql"),
  },
];

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  for (const migration of migrations) {
    const sql = readFileSync(migration.path, "utf8");
    const hash = migration.tag;
    const existing = await client.query(
      "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1 LIMIT 1",
      [hash],
    );
    if (existing.rowCount) {
      console.log(`migration ${migration.tag} already applied`);
      continue;
    }

    const alreadyApplied = await relationExists("me", "engineers");
    if (alreadyApplied) {
      await markApplied(hash);
      console.log(`migration ${migration.tag} marked applied; schema already exists`);
      continue;
    }

    await client.query("BEGIN");
    try {
      for (const statement of splitStatements(sql)) {
        await client.query(statement);
      }
      await markApplied(hash);
      await client.query("COMMIT");
      console.log(`migration ${migration.tag} applied`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}

async function markApplied(hash: string) {
  await client.query(
    "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
    [hash, Date.now()],
  );
}

async function relationExists(schema: string, table: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
      LIMIT 1
    `,
    [schema, table],
  );
  return Boolean(result.rowCount);
}

function splitStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
