import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../web/db/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../drizzle/0000_omniscient_thaddeus_ross.sql", import.meta.url),
  "utf8",
);

const forbidden = [
  "engineer_id",
  "user_id",
  "auth_subject",
  "source_handle",
  "github_handle",
  "linear_user_id",
  "slack_user_id",
  "calendar_email",
  "ip_address",
  "user_agent",
];

const anonymousSections = [
  extractBetween(schema, "export const anonymousSubmissions", "export const anonymousThemes"),
  extractBetween(schema, "export const anonymousThemes", "export const anonymousSurveyResponses"),
  extractBetween(schema, "export const anonymousSurveyResponses", "export const jobs"),
  extractBetween(migration, 'CREATE TABLE "anon"."submissions"', 'CREATE TABLE "anon"."survey_responses"'),
  extractBetween(migration, 'CREATE TABLE "anon"."survey_responses"', 'CREATE TABLE "anon"."themes"'),
  extractBetween(migration, 'CREATE TABLE "anon"."themes"', 'CREATE TABLE "delivery"."messages"'),
];

for (const section of anonymousSections) {
  for (const column of forbidden) {
    assert.equal(
      section.includes(column),
      false,
      `anonymous schema section contains forbidden identity column ${column}`,
    );
  }
}

console.log("anonymous schema identity-boundary checks passed");

function extractBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}
