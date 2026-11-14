import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { PerformanceView } from "@/components/performance-view";

export const metadata = { title: "Performance Lab" };

export default async function PerformanceLab() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Intelligence", "Performance Lab"]}
        title="Performance Lab"
        description="Calibration, precision and expectancy for agents and paper strategies - every metric shows its sample size, method and limitations."
      />
      <PerformanceView />
    </>
  );
}
