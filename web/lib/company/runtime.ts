export type RuntimeMode = "solo" | "company";

export function getCompanyDatabaseUrl(): string | null {
  return (
    process.env.HIGHLI_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    null
  );
}

export function getRuntimeMode(): RuntimeMode {
  if (process.env.HIGHLI_MODE === "company") return "company";
  if (getCompanyDatabaseUrl()) return "company";
  return "solo";
}

export function isCompanyMode(): boolean {
  return getRuntimeMode() === "company";
}

export function isDevAuthEnabled(): boolean {
  return process.env.HIGHLI_DEV_AUTH === "true" && process.env.NODE_ENV !== "production";
}

export class CompanyModeRequiredError extends Error {
  constructor() {
    super("company mode required");
    this.name = "CompanyModeRequiredError";
  }
}

export function assertCompanyMode(): void {
  if (!isCompanyMode()) throw new CompanyModeRequiredError();
}
