import { CmdKPalette } from "@/components/cmdk-palette";
import { TopStrip } from "@/components/top-strip";
import { AppShell, PageHeader } from "@/components/page-header";
import { OnboardingControls } from "@/components/onboarding-controls";
import { getCompanyActor } from "@/lib/company/auth";
import { getInstallState } from "@/lib/company/onboarding";
import { isCompanyMode } from "@/lib/company/runtime";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  if (!isCompanyMode()) {
    return (
      <AppShell width="narrow">
        <PageHeader
          eyebrow="Company mode required"
          title="Onboarding"
          description="The staged install flow is available only for highli-core company deployments."
        />
      </AppShell>
    );
  }
  await getCompanyActor();
  const install = await getInstallState();
  return (
    <>
      <TopStrip goal={null} />
      <AppShell width="wide">
        <PageHeader
          eyebrow="Staged install"
          title="Company onboarding"
          description="No silent install flag exists. Communication, preview, live, warmup, and active are explicit states."
          meta={install.state}
        />
        <OnboardingControls state={install.state} />
        {install.communicationMarkdown && (
          <article className="document-reader">
            <pre>{install.communicationMarkdown}</pre>
          </article>
        )}
      </AppShell>
      <CmdKPalette />
    </>
  );
}
