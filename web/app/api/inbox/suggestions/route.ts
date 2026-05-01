import { NextResponse } from "next/server";
import { refreshInboxSuggestions } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const suggestions = await refreshInboxSuggestions();
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("inbox suggestions failed:", err);
    return NextResponse.json(
      { suggestions: [], error: "failed to generate inbox suggestions" },
      { status: 500 },
    );
  }
}
