import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import { submitAnonymousFrustration } from "@/lib/company/anon-data";

const bodySchema = z.object({
  text: z.string().min(5).max(5000),
  previewOnly: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json(await submitAnonymousFrustration(actor, parsed.data));
  } catch (error) {
    return apiError(error);
  }
}
