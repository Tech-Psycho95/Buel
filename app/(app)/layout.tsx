import { requirePageUser } from "@/lib/auth/guard";
import { ShellFrame } from "@/components/shell";

/*
 * Authenticated app shell. Authorization is enforced HERE (server-side session
 * validation) — proxy.ts only performs the anonymous-visitor redirect.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();
  return <ShellFrame user={{ displayName: user.displayName, email: user.email }}>{children}</ShellFrame>;
}
