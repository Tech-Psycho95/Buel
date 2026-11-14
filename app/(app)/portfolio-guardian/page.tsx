import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { GuardianView } from "@/components/guardian-view";

export const metadata = { title: "Portfolio Guardian" };

export default async function PortfolioGuardian() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Research & Simulation", "Portfolio Guardian"]}
        title="Portfolio Guardian"
        description="Deterministic risk-limit evaluation over the simulated portfolio: order size, concentration, leverage, open-position count and daily loss cap — every breach explained in plain language."
      />
      <GuardianView />
    </>
  );
}
