CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalysts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"status" text NOT NULL,
	"assets" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_ref_price" numeric(28, 10) NOT NULL,
	"exit_ref_price" numeric(28, 10) NOT NULL,
	"horizon_return_pct" numeric(12, 6) NOT NULL,
	"aligned_with_decision" boolean NOT NULL,
	"notes" jsonb
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"decision" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"model_meta" jsonb NOT NULL,
	"data_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forensics_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"params" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"narrative" jsonb,
	"model_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"bucket_ts" timestamp with time zone NOT NULL,
	"features" jsonb NOT NULL,
	"forward_outcome" jsonb,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cash" numeric(28, 10) NOT NULL,
	"starting_balance" numeric(28, 10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"intent" text NOT NULL,
	"qty" numeric(38, 10) NOT NULL,
	"status" text NOT NULL,
	"reject_reason" text,
	"reference_price" numeric(28, 10),
	"fill_price" numeric(28, 10),
	"fee" numeric(28, 10),
	"slippage_cost" numeric(28, 10),
	"realized_pnl" numeric(28, 10),
	"source_decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"filled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paper_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(38, 10) NOT NULL,
	"avg_entry_price" numeric(28, 10) NOT NULL,
	"stop_price" numeric(28, 10),
	"take_profit_price" numeric(28, 10),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"max_position_pct" numeric(7, 4) DEFAULT '20' NOT NULL,
	"max_daily_loss_pct" numeric(7, 4) DEFAULT '10' NOT NULL,
	"max_open_positions" integer DEFAULT 6 NOT NULL,
	"max_leverage_x" numeric(6, 2) DEFAULT '5' NOT NULL,
	"max_concentration_pct" numeric(7, 4) DEFAULT '50' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensics_reports" ADD CONSTRAINT "forensics_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_accounts" ADD CONSTRAINT "paper_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_account_id_paper_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."paper_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_account_id_paper_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."paper_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_preferences" ADD CONSTRAINT "risk_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_outcomes_decision_unique" ON "decision_outcomes" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decisions_user_created_idx" ON "decisions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "decisions_run_idx" ON "decisions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "forensics_user_created_idx" ON "forensics_reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "market_memory_symbol_idx" ON "market_memory" USING btree ("symbol","bucket_ts");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_accounts_user_unique" ON "paper_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paper_orders_user_idx" ON "paper_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "paper_orders_account_idx" ON "paper_orders" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_positions_account_symbol_unique" ON "paper_positions" USING btree ("account_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_hash_unique" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_unique" ON "watchlist_items" USING btree ("watchlist_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_user_name_unique" ON "watchlists" USING btree ("user_id","name");