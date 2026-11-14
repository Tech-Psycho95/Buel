import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { CommandCenterView } from "@/components/command-center";

export const metadata = { title: "Command Center" };

export default async function CommandCenter() {
  const user = await requireOnboardedUser();
  return (
    <>
      <PageHeader
        breadcrumb={["Workspace", "Command Center"]}
        title={`Welcome back, ${user.displayName}`}
        description="Portfolio state, watchlist snapshot, movers and the latest gated decisions — the most important information first."
      />
      <CommandCenterView displayName={user.displayName} />
    </>
  );
}
