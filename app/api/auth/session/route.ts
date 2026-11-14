import { ok, unauthorized } from "@/lib/http/respond";
import { currentUser } from "@/lib/auth/session-cookies";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return ok({ user });
}
