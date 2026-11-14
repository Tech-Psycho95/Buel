import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { ScenarioView } from "@/components/scenario-view";

export const metadata = { title: "Scenario Lab" };

export default async function ScenarioLab() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Research & Simulation", "Scenario Lab"]}
        title="Scenario Lab"
        description="Counterfactual what-ifs: shock the price and volatility, then watch how the council, Judge and Quality Gate respond. All outputs are hypothetical and clearly labeled."
      />
      <ScenarioView />
    </>
  );
}
