import { requireOnboardedUser } from "@/lib/auth/guard";
import { PageHeader } from "@/components/ui";
import { SettingsView } from "@/components/settings-view";

export const metadata = { title: "Settings / Profile" };

export default async function Settings() {
  const user = await requireOnboardedUser();
  return (
    <>
      <PageHeader breadcrumb={["Account", "Settings / Profile"]} title="Settings / Profile" description="Manage your personal information and account identity." />
      <SettingsView email={user.email} username={user.username} />
    </>
  );
}
