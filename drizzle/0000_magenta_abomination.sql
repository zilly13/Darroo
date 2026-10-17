CREATE TABLE IF NOT EXISTS "clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"listing_id" uuid,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cluster_members" (
	"cluster_id" uuid NOT NULL,
	"raw_item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_slug" text NOT NULL,
	"primary_raw_item_id" uuid,
	"verified_primary_source" boolean DEFAULT false NOT NULL,
	"verification_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_slug" text NOT NULL,
	"listing_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_cents" integer,
	"contact" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"fraud_check" jsonb,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"short_text" text,
	"long_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_log_id" uuid,
	"channel_slug" text NOT NULL,
	"step" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_change_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"message" text NOT NULL,
	"reporter_contact" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_slug" text DEFAULT 'familien-muenchen' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"district" text,
	"age_group" text,
	"indoor" boolean DEFAULT false NOT NULL,
	"requires_good_weather" boolean DEFAULT false NOT NULL,
	"seasons" jsonb,
	"website_url" text,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"group_id" uuid,
	"repost_count" integer DEFAULT 0 NOT NULL,
	"last_posted_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_slug" text NOT NULL,
	"cluster_id" uuid,
	"title" text NOT NULL,
	"short_text" text NOT NULL,
	"long_text" text NOT NULL,
	"source_links" jsonb NOT NULL,
	"event_date" timestamp with time zone,
	"location" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"website_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"channel_slug" text NOT NULL,
	"external_id" text,
	"url" text,
	"title" text NOT NULL,
	"event_date" timestamp with time zone,
	"location" text,
	"raw_payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_slug" text NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"trust_tier" text DEFAULT 'secondary' NOT NULL,
	"selector_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_cursor" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clicks" ADD CONSTRAINT "clicks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clicks" ADD CONSTRAINT "clicks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster_members" ADD CONSTRAINT "cluster_members_cluster_id_item_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."item_clusters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cluster_members" ADD CONSTRAINT "cluster_members_raw_item_id_raw_items_id_fk" FOREIGN KEY ("raw_item_id") REFERENCES "public"."raw_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_clusters" ADD CONSTRAINT "item_clusters_primary_raw_item_id_raw_items_id_fk" FOREIGN KEY ("primary_raw_item_id") REFERENCES "public"."raw_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_errors" ADD CONSTRAINT "pipeline_errors_run_log_id_run_logs_id_fk" FOREIGN KEY ("run_log_id") REFERENCES "public"."run_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_change_reports" ADD CONSTRAINT "place_change_reports_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "places" ADD CONSTRAINT "places_group_id_place_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."place_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_cluster_id_item_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."item_clusters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cluster_members_pk" ON "cluster_members" USING btree ("cluster_id","raw_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listings_channel_hash_idx" ON "listings" USING btree ("channel_slug","content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_channel_status_idx" ON "places" USING btree ("channel_slug","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_channel_status_idx" ON "posts" USING btree ("channel_slug","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "raw_items_channel_hash_idx" ON "raw_items" USING btree ("channel_slug","content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_items_channel_status_idx" ON "raw_items" USING btree ("channel_slug","status");