CREATE TABLE "privy_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"privy_did" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_authenticated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "privy_identities" ADD CONSTRAINT "privy_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "privy_identities_did_unique" ON "privy_identities" USING btree ("privy_did");--> statement-breakpoint
CREATE INDEX "privy_identities_user_idx" ON "privy_identities" USING btree ("user_id");