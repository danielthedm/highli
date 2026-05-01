import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { meEngineers } from "@/db/schema";
import { getCompanyDb } from "@/lib/company/db";
import {
  assertCompanyMode,
  isDevAuthEnabled,
  type RuntimeMode,
} from "@/lib/company/runtime";

export type CompanyRole = "engineer" | "manager" | "director" | "vp" | "admin";

export interface CompanyActor {
  engineerId: string;
  email: string;
  authSubject: string;
  role: CompanyRole;
  department: string;
  division: string | null;
  company: string;
  githubHandle?: string | null;
  linearUserId?: string | null;
}

const seededDevActors: Record<string, CompanyActor> = {
  engineer: {
    engineerId: "eng-dev",
    email: "engineer@highli.dev",
    authSubject: "dev:engineer",
    role: "engineer",
    department: "Platform",
    division: "Engineering",
    company: "Highli Demo",
    githubHandle: "highli-engineer",
    linearUserId: "linear-engineer",
  },
  manager: {
    engineerId: "mgr-dev",
    email: "manager@highli.dev",
    authSubject: "dev:manager",
    role: "manager",
    department: "Platform",
    division: "Engineering",
    company: "Highli Demo",
    githubHandle: "highli-manager",
    linearUserId: "linear-manager",
  },
  director: {
    engineerId: "dir-dev",
    email: "director@highli.dev",
    authSubject: "dev:director",
    role: "director",
    department: "Developer Experience",
    division: "Engineering",
    company: "Highli Demo",
  },
  vp: {
    engineerId: "vp-dev",
    email: "vp@highli.dev",
    authSubject: "dev:vp",
    role: "vp",
    department: "Engineering Leadership",
    division: "Engineering",
    company: "Highli Demo",
  },
  admin: {
    engineerId: "admin-dev",
    email: "admin@highli.dev",
    authSubject: "dev:admin",
    role: "admin",
    department: "Engineering Ops",
    division: "Engineering",
    company: "Highli Demo",
  },
};

function normalizeDevActor(value: string | null | undefined): CompanyActor {
  const key = value && value in seededDevActors ? value : "engineer";
  return seededDevActors[key];
}

async function ensureActorRow(actor: CompanyActor): Promise<void> {
  const db = getCompanyDb();
  await db
    .insert(meEngineers)
    .values({
      id: actor.engineerId,
      email: actor.email,
      authSubject: actor.authSubject,
      role: actor.role,
      department: actor.department,
      division: actor.division,
      company: actor.company,
      githubHandle: actor.githubHandle ?? null,
      linearUserId: actor.linearUserId ?? null,
    })
    .onConflictDoUpdate({
      target: meEngineers.id,
      set: {
        email: actor.email,
        authSubject: actor.authSubject,
        role: actor.role,
        department: actor.department,
        division: actor.division,
        company: actor.company,
        githubHandle: actor.githubHandle ?? null,
        linearUserId: actor.linearUserId ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function getCompanyActor(req?: NextRequest): Promise<CompanyActor> {
  assertCompanyMode();

  if (isDevAuthEnabled()) {
    let selected =
      req?.headers.get("x-highli-dev-user") ??
      req?.cookies.get("highli_dev_actor")?.value ??
      null;

    if (!selected && !req) {
      const cookieStore = await cookies();
      const headerStore = await headers();
      selected =
        headerStore.get("x-highli-dev-user") ??
        cookieStore.get("highli_dev_actor")?.value ??
        null;
    }

    const actor = normalizeDevActor(selected);
    await ensureActorRow(actor);
    return actor;
  }

  const session = await auth();
  const email = session?.user?.email;
  const subject = session?.user?.id ?? email;
  if (!email || !subject) {
    throw new Error("authentication required");
  }

  const db = getCompanyDb();
  const [row] = await db
    .select()
    .from(meEngineers)
    .where(and(eq(meEngineers.email, email), eq(meEngineers.active, true)))
    .limit(1);

  if (!row) {
    throw new Error("authenticated user is not in the org roster");
  }

  if (row.authSubject && row.authSubject !== subject) {
    throw new Error("authenticated subject does not match org roster");
  }

  if (!row.authSubject) {
    await db
      .update(meEngineers)
      .set({ authSubject: subject, updatedAt: new Date() })
      .where(eq(meEngineers.id, row.id));
  }

  return {
    engineerId: row.id,
    email: row.email,
    authSubject: subject,
    role: row.role as CompanyRole,
    department: row.department,
    division: row.division,
    company: row.company,
    githubHandle: row.githubHandle,
    linearUserId: row.linearUserId,
  };
}

export function canManageCompany(actor: CompanyActor): boolean {
  return ["manager", "director", "vp", "admin"].includes(actor.role);
}

export function canAdminCompany(actor: CompanyActor): boolean {
  return actor.role === "admin";
}

export function assertMeAccess(actor: CompanyActor, requestedEngineerId?: string | null): void {
  if (requestedEngineerId && requestedEngineerId !== actor.engineerId) {
    throw new Error("forbidden: /me routes only expose the authenticated engineer");
  }
}

export function authModeLabel(): RuntimeMode | "company-dev-auth" {
  return isDevAuthEnabled() ? "company-dev-auth" : "company";
}
