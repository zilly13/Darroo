import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  doublePrecision,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Status values are plain text (not pg enums) on purpose: adding a new
 * status later is a code change + a comment, not a migration.
 */

// ---------------------------------------------------------------------------
// Content pipeline: sources -> raw_items -> item_clusters -> posts
// ---------------------------------------------------------------------------

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelSlug: text("channel_slug").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // "rss" | "ical" | "html"
  url: text("url").notNull(),
  trustTier: text("trust_tier").notNull().default("secondary"), // "primary" | "secondary"
  selectorConfig: jsonb("selector_config"), // CSS selectors for "html" collectors
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastCursor: jsonb("last_cursor"), // collector-specific bookmark (e.g. last seen GUID/date)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawItems = pgTable(
  "raw_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id").references(() => sources.id),
    channelSlug: text("channel_slug").notNull(),
    externalId: text("external_id"), // guid/link from the source, used for freshness cursor
    url: text("url"),
    title: text("title").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }),
    location: text("location"),
    rawPayload: jsonb("raw_payload").notNull(),
    contentHash: text("content_hash").notNull(), // normalized title+date+location fingerprint
    status: text("status").notNull().default("pending"),
    // pending -> relevant|rejected -> clustered -> verified -> written -> approved -> posted
    //        \-> duplicate (short-circuited before AI is ever called)
    rejectionReason: text("rejection_reason"),
    mentionCount: integer("mention_count").notNull().default(1),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Duplicate protection across runs: same channel + same fingerprint = seen before.
    channelHashIdx: uniqueIndex("raw_items_channel_hash_idx").on(table.channelSlug, table.contentHash),
    channelStatusIdx: index("raw_items_channel_status_idx").on(table.channelSlug, table.status),
  }),
);

export const itemClusters = pgTable("item_clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelSlug: text("channel_slug").notNull(),
  primaryRawItemId: uuid("primary_raw_item_id").references(() => rawItems.id),
  verifiedPrimarySource: boolean("verified_primary_source").notNull().default(false),
  verificationNote: text("verification_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clusterMembers = pgTable(
  "cluster_members",
  {
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => itemClusters.id),
    rawItemId: uuid("raw_item_id")
      .notNull()
      .references(() => rawItems.id),
  },
  (table) => ({
    pk: uniqueIndex("cluster_members_pk").on(table.clusterId, table.rawItemId),
  }),
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelSlug: text("channel_slug").notNull(),
    clusterId: uuid("cluster_id").references(() => itemClusters.id),
    title: text("title").notNull(),
    shortText: text("short_text").notNull(), // WhatsApp
    longText: text("long_text").notNull(), // darroo.com (sources + ads)
    sourceLinks: jsonb("source_links").notNull(), // [{ name, url }]
    eventDate: timestamp("event_date", { withTimezone: true }),
    location: text("location"),
    status: text("status").notNull().default("ready"), // ready -> posted | rejected
    websiteSlug: text("website_slug"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (table) => ({
    channelStatusIdx: index("posts_channel_status_idx").on(table.channelSlug, table.status),
  }),
);

// ---------------------------------------------------------------------------
// Orte-Datenbank (timeless places, independent of the event pipeline above)
// ---------------------------------------------------------------------------

export const placeGroups = pgTable("place_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
});

export const places = pgTable(
  "places",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelSlug: text("channel_slug").notNull().default("familien-muenchen"),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"), // e.g. "spielplatz" | "freibad" | "museum" | "wanderweg"
    district: text("district"),
    ageGroup: text("age_group"), // e.g. "0-3" | "4-6" | "7-12" | "alle"
    indoor: boolean("indoor").notNull().default(false),
    requiresGoodWeather: boolean("requires_good_weather").notNull().default(false),
    seasons: jsonb("seasons"), // e.g. ["spring","summer"] or null = all year
    websiteUrl: text("website_url"),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    groupId: uuid("group_id").references(() => placeGroups.id),
    repostCount: integer("repost_count").notNull().default(0),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
    status: text("status").notNull().default("active"), // active | needs_review | archived
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelStatusIdx: index("places_channel_status_idx").on(table.channelSlug, table.status),
  }),
);

// Reports submitted through the "melde eine Änderung" form; a human reviews
// these and flips the place to needs_review if the change looks real.
export const placeChangeReports = pgTable("place_change_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  placeId: uuid("place_id")
    .notNull()
    .references(() => places.id),
  message: text("message").notNull(),
  reporterContact: text("reporter_contact"),
  status: text("status").notNull().default("open"), // open | resolved | dismissed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Inserate (paid listings: real estate, gastro jobs, used cars, ...)
// ---------------------------------------------------------------------------

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelSlug: text("channel_slug").notNull(),
    listingType: text("listing_type").notNull(), // "immobilie" | "job" | "gebrauchtwagen"
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceCents: integer("price_cents"),
    contact: jsonb("contact").notNull(), // { name, email, phone }
    contentHash: text("content_hash").notNull(),
    fraudCheck: jsonb("fraud_check"), // { score, reasons[] } from the AI check
    paymentStatus: text("payment_status").notNull().default("pending"), // pending|paid|refunded
    status: text("status").notNull().default("pending_payment"),
    // pending_payment -> pending_review -> approved -> posted
    //                                   \-> rejected
    shortText: text("short_text"),
    longText: text("long_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    channelHashIdx: uniqueIndex("listings_channel_hash_idx").on(table.channelSlug, table.contentHash),
  }),
);

// ---------------------------------------------------------------------------
// Operations: run logs, errors (reported, never silent), click tracking
// ---------------------------------------------------------------------------

export const runLogs = pgTable("run_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelSlug: text("channel_slug").notNull(),
  jobName: text("job_name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running|success|partial|failed
  stats: jsonb("stats"),
  error: text("error"),
});

export const pipelineErrors = pgTable("pipeline_errors", {
  id: uuid("id").defaultRandom().primaryKey(),
  runLogId: uuid("run_log_id").references(() => runLogs.id),
  channelSlug: text("channel_slug").notNull(),
  step: text("step").notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clicks = pgTable("clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id").references(() => posts.id),
  listingId: uuid("listing_id").references(() => listings.id),
  source: text("source").notNull(), // "whatsapp" | "website"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
