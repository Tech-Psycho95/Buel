import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session-cookies";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.onboardedAt) redirect("/command-center");
  return <>{children}</>;
}
