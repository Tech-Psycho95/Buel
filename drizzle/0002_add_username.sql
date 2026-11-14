ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
-- Backfill: sanitize display_name (fallback: email local part, then id-based
-- handle), resolve collisions with id-based suffixes. Case-insensitive.
DO $$
DECLARE
  u RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR u IN SELECT id, display_name, email FROM users WHERE username IS NULL LOOP
    base := lower(regexp_replace(coalesce(u.display_name, split_part(u.email, '@', 1)), '[^a-z0-9_]+', '_', 'g'));
    base := regexp_replace(base, '_{2,}', '_', 'g');
    base := regexp_replace(base, '^_+', '');
    base := regexp_replace(base, '_+$', '');
    IF length(base) < 3 THEN
      base := lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]+', '_', 'g'));
      base := regexp_replace(base, '^_+', '');
      base := regexp_replace(base, '_+$', '');
    END IF;
    IF length(base) < 3 THEN
      base := 'user' || left(u.id::text, 8);
    END IF;
    base := left(base, 20);
    candidate := base;
    n := 0;
    WHILE EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(candidate)) LOOP
      n := n + 1;
      candidate := left(base, 12) || '_' || left(u.id::text, 4) || '_' || n::text;
      EXIT WHEN n > 50;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = u.id;
  END LOOP;
END
$$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree (lower("username"));
