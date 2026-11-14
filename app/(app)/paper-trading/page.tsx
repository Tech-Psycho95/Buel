import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { PaperTradingView } from "@/components/paper-trading";

export const metadata = { title: "Paper Trading" };

export default async function PaperTrading() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Research & Simulation", "Paper Trading"]}
        title="Paper Trading"
        description="Simulated entries, exits, stops and sizing with fee/slippage modeling. Portfolio Guardian checks every order against your risk limits. Nothing here touches real money."
      />
      <PaperTradingView defaultSymbol="BTC" />
    </>
  );
}
