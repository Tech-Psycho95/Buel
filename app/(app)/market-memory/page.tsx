import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { MemoryView } from "@/components/memory-view";

export const metadata = { title: "Market Memory" };

export default async function MarketMemory() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Intelligence", "Market Memory"]}
        title="Market Memory"
        description="How does the current setup compare to similar historical setups - and what happened next, descriptively? Analogues are context, never predictions."
      />
      <MemoryView />
    </>
  );
}
