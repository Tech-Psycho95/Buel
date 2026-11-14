import { eq, sql } from "drizzle-orm";
import { and } from "drizzle-orm";
import { z } from "zod";
import type { SentiselDb } from "@/lib/db/client";
import { users, watchlists } from "@/lib/db/schema";

/*
 * Account service — signup / login / password reset orchestration.
 * Generic failure messages everywhere: no user enumeration.
 */

export async function markOnboarded(db: SentiselDb, userId: string) {
  await db
    .update(users)
    .set({ onboardedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId)));
}
