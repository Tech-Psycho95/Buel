import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { RiskPrefsView } from "@/components/risk-prefs-view";

export const metadata = { title: "Risk Preferences" };

export default async function Page() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader breadcrumb={["Account", "Risk Preferences"]} title="Risk Preferences" description="Position-size, daily-loss, open-position, leverage and concentration limits — enforced by Portfolio Guardian on every simulated order." />
      <RiskPrefsView />
    </>
  );
}
