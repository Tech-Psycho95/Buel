import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit, clientIdentity } from "@/lib/http/rate-limit";
import { ok, err, tooMany, handleError } from "@/lib/http/respond";
import { isUsernameAvailable, validateUsername, changeUsername, USERNAME_MIN, USERNAME_MAX } from "@/lib/auth/username";

/*
 * Profile username API — availability check (GET) and change (PATCH).
 * Both require an authenticated session; the session user id is the sole
 * ownership key, so a user can only ever change their own username.
 */

export const maxDuration = 15;

const patchSchema = z.object({
  username: z.string().trim().min(1).max(64),
});

/** GET /api/profile/username?username=<candidate> — availability feedback. */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return err(401, "unauthorized", "Sign in required.");

    const db = await getDb();
    const rl = await rateLimit(db, "profile:username:check", clientIdentity(req.headers), 60, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const url = new URL(req.url);
    const raw = url.searchParams.get("username") ?? "";
    const check = validateUsername(raw);
    if (!check.ok) {
      return ok({
        available: false,
        reason: check.reason,
        message:
          check.reason === "reserved"
            ? "That username is reserved."
            : `Use ${USERNAME_MIN}–${USERNAME_MAX} characters: letters, numbers and underscores only.`,
      });
    }
    const available = await isUsernameAvailable(db, check.value, user.id);
    return ok({
      available,
      reason: available ? null : "taken",
      message: available ? "Username available." : "Username already taken.",
    });
  } catch (e) {
    return handleError(e);
  }
}

/** PATCH /api/profile/username — validate, claim atomically, sync display name. */
export async function PATCH(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return err(401, "unauthorized", "Sign in required.");

    const db = await getDb();
    const rl = await rateLimit(db, "profile:username:change", user.id, 10, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return err(400, "bad_request", "Invalid request payload");

    const result = await changeUsername(db, user.id, parsed.data.username);
    if (!result.ok) {
      if (result.reason === "invalid") {
        return err(400, "invalid_username", `Use ${USERNAME_MIN}–${USERNAME_MAX} characters: letters, numbers and underscores only.`);
      }
      if (result.reason === "reserved") {
        return err(400, "reserved_username", "That username is reserved.");
      }
      return err(409, "username_taken", "Username already taken.");
    }
    return ok({ ok: true, username: result.username });
  } catch (e) {
    return handleError(e);
  }
}
