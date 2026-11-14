import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { LedgerView } from "@/components/ledger-view";

export const metadata = { title: "Decision Ledger" };

export default async function DecisionLedger() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Workspace", "Decision Ledger"]}
        title="Decision Ledger"
        description="Immutable snapshots of every council run. Replay shows the stored evidence, agents, red-team review, judge output and gate checks — never a regeneration."
      />
      <LedgerView />
    </>
  );
}
