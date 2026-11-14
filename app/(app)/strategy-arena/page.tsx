import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { ArenaView } from "@/components/arena-view";

export const metadata = { title: "Strategy Arena" };

export default async function StrategyArena() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Research & Simulation", "Strategy Arena"]}
        title="Strategy Arena"
        description="Momentum, mean-reversion, breakout and defensive strategies backtested on identical candles, capital, fees and slippage. No look-ahead: signals fire on close, fills occur at the next bar open."
      />
      <ArenaView />
    </>
  );
}
