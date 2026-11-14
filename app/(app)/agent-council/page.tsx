import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { CouncilWorkbench } from "@/components/council-workbench";

export const metadata = { title: "Agent Council" };

export default async function AgentCouncil() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Workspace", "Agent Council"]}
        title="Agent Council"
        description="Bull, Bear, Risk and Analyst publish independent evidence-linked theses. The Red-Team attacks the leading one. The Judge and Quality Gate decide — deterministically."
      />
      <CouncilWorkbench defaultSymbol="BTC" />
    </>
  );
}
