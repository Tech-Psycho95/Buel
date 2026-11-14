import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { EvidenceGraphView } from "@/components/evidence-graph-view";

export const metadata = { title: "Evidence Graph" };

export default async function EvidenceGraph() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Intelligence", "Evidence Graph"]}
        title="Evidence Graph"
        description="For any stored decision: source data, market observations, agent claims, red-team challenges, the Judge verdict and the gate checks - the full provenance chain."
      />
      <EvidenceGraphView />
    </>
  );
}
