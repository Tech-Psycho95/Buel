import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { ForensicsWorkbench } from "@/components/forensics-workbench";

export const metadata = { title: "Wallet Forensics" };

export default async function ForensicsPage() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Intelligence", "Wallet Forensics"]}
        title="Wallet Forensics"
        description="Paste a Hyperliquid address and get a deterministic, evidence-referenced autopsy of its perpetuals trading: accounting separation, fee drag, post-loss size escalation, and honest coverage disclosure."
      />
      <ForensicsWorkbench />
    </>
  );
}
