import Link from "next/link";
import { CmdKPalette } from "@/components/cmdk-palette";
import { FrustrationFlow } from "@/components/frustration-flow";

export const metadata = {
  title: "highli — log a frustration",
};

export default async function FrustrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ draft?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  return (
    <div className="anon-register" style={{ minHeight: "100vh" }}>
      <header className="anon-header">
        <Link href="/" className="anon-back">
          back
        </Link>
      </header>
      <FrustrationFlow initialDraft={params.draft ?? ""} />
      <CmdKPalette />
    </div>
  );
}
