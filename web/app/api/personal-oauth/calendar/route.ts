import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/company/http";
import { getCompanyActor } from "@/lib/company/auth";
import { connectDevCalendar, disconnectCalendar } from "@/lib/company/personal-oauth";

export async function POST(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    return NextResponse.json(await connectDevCalendar(actor));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await getCompanyActor(req);
    return NextResponse.json(await disconnectCalendar(actor));
  } catch (error) {
    return apiError(error);
  }
}
