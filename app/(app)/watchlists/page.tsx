import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { WatchlistsView } from "@/components/watchlists-view";

export const metadata = { title: "Watchlists" };

export default async function Page() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader breadcrumb={["Account", "Watchlists"]} title="Watchlists" description="Saved symbol lists feeding Command Center, Market Pulse and onboarding defaults." />
      <WatchlistsView />
    </>
  );
}
