import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { CatalystsView } from "@/components/catalysts-view";

export const metadata = { title: "Catalyst Intelligence" };

export default async function CatalystIntelligence() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Research & Simulation", "Catalyst Intelligence"]}
        title="Catalyst Intelligence"
        description="Confirmed events vs unverified hypotheses, with source and affected assets. This build integrates no live feed - every record is a labeled demo fixture."
      />
      <CatalystsView />
    </>
  );
}
