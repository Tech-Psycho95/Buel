import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { ok, handleError } from "@/lib/http/respond";
import { endSessionCookie } from "@/lib/auth/session-cookies";

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    await endSessionCookie();
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
