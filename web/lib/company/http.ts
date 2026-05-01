import { NextResponse } from "next/server";
import { CompanyModeRequiredError, getRuntimeMode } from "@/lib/company/runtime";

export function companyModeRequiredResponse() {
  return NextResponse.json(
    {
      error: "company mode required",
      message:
        "This surface only runs when HIGHLI_MODE=company or a company Postgres database is configured.",
      mode: getRuntimeMode(),
    },
    { status: 409 },
  );
}

export function apiError(error: unknown, fallback = "request failed") {
  if (error instanceof CompanyModeRequiredError) return companyModeRequiredResponse();
  const message = error instanceof Error ? error.message : fallback;
  const status =
    message.startsWith("forbidden") ? 403 : message.includes("authentication") ? 401 : 400;
  return NextResponse.json({ error: message }, { status });
}
