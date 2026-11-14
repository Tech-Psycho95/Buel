import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { MarketPulseView } from "@/components/market-pulse";

export const metadata = { title: "Live Market Pulse" };

export default async function MarketPulse() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Workspace", "Live Market Pulse"]}
        title="Live Market Pulse"
        description="Supported perpetuals with price, volume, funding and open interest. Live and demo states are always labeled; freshness is never faked."
      />
      <MarketPulseView />
    </>
  );
}
