import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { listings, places, posts } from "../db/schema.js";
import { createPlaceFromForm, newPlaceFormSchema } from "../places/intake.js";
import { submitPlaceChangeReport } from "../places/changeReport.js";
import { createListingFromForm } from "../listings/intake.js";
import { newListingFormSchema } from "../listings/types.js";
import { markListingPaid } from "../listings/payment.js";
import { approveListing } from "../listings/approve.js";
import { logger } from "../utils/logger.js";
import { escapeHtml, layout } from "./html.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/** Reads the `?token=` query param used to gate every /internal/* page and link. */
function queryToken(req: { query: unknown }): string {
  return (req.query as Record<string, string | undefined> | undefined)?.token ?? "";
}

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  // Self-service listing submission (e.g. embedded in a form on darroo.com).
  app.post("/api/listings", async (req, reply) => {
    const parsed = newListingFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const listing = await createListingFromForm(parsed.data);
      return { id: listing.id, status: listing.status };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  // Payment-provider webhook target. Replace the shared-secret check below
  // with your provider's real signature verification (e.g. Stripe) before
  // going live - this is a minimal placeholder, not production payment security.
  app.post<{ Params: { id: string } }>("/api/listings/:id/paid", async (req, reply) => {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (secret && req.headers["x-webhook-secret"] !== secret) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const updated = await markListingPaid(req.params.id);
    if (!updated) return reply.code(404).send({ error: "not found" });
    return { id: updated.id, status: updated.status };
  });

  // Public "melde eine Änderung" endpoint for an existing place.
  app.post<{ Params: { id: string }; Body: { message: string; contact?: string } }>(
    "/api/places/:id/report",
    async (req, reply) => {
      if (!req.body?.message) return reply.code(400).send({ error: "message is required" });
      const report = await submitPlaceChangeReport({
        placeId: req.params.id,
        message: req.body.message,
        reporterContact: req.body.contact,
      });
      return { id: report.id };
    },
  );
}

export async function registerInternalRoutes(parent: FastifyInstance) {
  // Registered as a scoped plugin (with its own prefix) so the auth hook
  // below only ever applies to these routes, never to /health or /api/*.
  await parent.register(
    async (app: FastifyInstance) => {
      app.addHook("onRequest", async (req, reply) => {
        const token = requireEnv("INTERNAL_ACCESS_TOKEN");
        const provided = (req.query as Record<string, string>)?.token ?? req.headers["x-internal-token"];
        if (provided !== token) {
          reply.code(401).type("text/plain").send("Unauthorized. Append ?token=... from your .env.");
          return reply;
        }
      });

      registerInternalEndpoints(app);
    },
    { prefix: "/internal" },
  );
}

function registerInternalEndpoints(app: FastifyInstance) {
  // ---- Posting-Liste (manuelles Posten, mit Kopier-Buttons) ----
  app.get("/posts", async (req) => {
    const ready = await db.select().from(posts).where(eq(posts.status, "ready")).orderBy(posts.createdAt);
    const token = queryToken(req);

    const cards = ready
      .map((post) => {
        const shortId = `short-${post.id}`;
        const longId = `long-${post.id}`;
        return `<div class="card">
  <div class="meta"><span class="badge">${escapeHtml(post.channelSlug)}</span> ${escapeHtml(post.title)}</div>
  <strong>WhatsApp:</strong>
  <pre id="${shortId}">${escapeHtml(post.shortText)}</pre>
  <button id="${shortId}-btn" onclick="copyText('${shortId}')">In Zwischenablage kopieren</button>
  <details><summary>Website-Text</summary><pre id="${longId}">${escapeHtml(post.longText)}</pre>
  <button id="${longId}-btn" onclick="copyText('${longId}')">In Zwischenablage kopieren</button></details>
  <form class="inline" method="post" action="/internal/posts/${post.id}/posted?token=${encodeURIComponent(token)}">
    <input type="submit" value="Als gepostet markieren" />
  </form>
</div>`;
      })
      .join("\n");

    return layout(
      "Posting-Liste",
      ready.length > 0 ? cards : "<p>Nichts Neues zu posten.</p>",
    );
  });

  app.post<{ Params: { id: string } }>("/posts/:id/posted", async (req, reply) => {
    await db.update(posts).set({ status: "posted", postedAt: new Date() }).where(eq(posts.id, req.params.id));
    return reply.redirect(`/internal/posts?token=${queryToken(req)}`);
  });

  // ---- Orte: Review-Queue + Quick-Add ----
  app.get("/places/review", async (req) => {
    const token = queryToken(req);
    const pending = await db.select().from(places).where(eq(places.status, "needs_review"));
    const cards = pending
      .map(
        (place) => `<div class="card">
  <strong>${escapeHtml(place.name)}</strong> <span class="badge">${escapeHtml(place.category ?? "?")}</span>
  <p>${escapeHtml(place.description ?? "")}</p>
  <div class="meta">${escapeHtml(place.district ?? "")} · Altersgruppe ${escapeHtml(place.ageGroup ?? "?")} · ${
          place.indoor ? "drinnen" : "draußen"
        }</div>
  <form class="inline" method="post" action="/internal/places/${place.id}/approve?token=${encodeURIComponent(token)}">
    <input type="submit" value="Freigeben" />
  </form>
  <form class="inline" method="post" action="/internal/places/${place.id}/archive?token=${encodeURIComponent(token)}">
    <input type="submit" value="Ablehnen/Archivieren" />
  </form>
</div>`,
      )
      .join("\n");
    return layout("Orte zur Prüfung", pending.length > 0 ? cards : "<p>Nichts zu prüfen.</p>");
  });

  app.post<{ Params: { id: string } }>("/places/:id/approve", async (req, reply) => {
    await db.update(places).set({ status: "active" }).where(eq(places.id, req.params.id));
    return reply.redirect(`/internal/places/review?token=${queryToken(req)}`);
  });

  app.post<{ Params: { id: string } }>("/places/:id/archive", async (req, reply) => {
    await db.update(places).set({ status: "archived" }).where(eq(places.id, req.params.id));
    return reply.redirect(`/internal/places/review?token=${queryToken(req)}`);
  });

  app.get("/places/new", async (req) => {
    const token = queryToken(req);
    return layout(
      "Neuer Ort",
      `<form method="post" action="/internal/places/new?token=${encodeURIComponent(token)}">
  <label>Name <input type="text" name="name" required /></label>
  <label>Adresse <input type="text" name="address" /></label>
  <label>Website (optional, KI liest die Seite für die Beschreibung) <input type="url" name="websiteUrl" /></label>
  <label>Notizen <textarea name="notes"></textarea></label>
  <p><input type="submit" value="Anlegen (geht zur Prüfung)" /></p>
</form>`,
    );
  });

  app.post("/places/new", async (req, reply) => {
    const parsed = newPlaceFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(layout("Fehler", `<pre>${escapeHtml(JSON.stringify(parsed.error.flatten()))}</pre>`));
    }
    const place = await createPlaceFromForm(parsed.data);
    logger.info({ placeId: place.id }, "New place created via internal form");
    return reply.redirect(`/internal/places/review?token=${queryToken(req)}`);
  });

  // ---- Inserate: Freigabe-Queue ----
  app.get("/listings/review", async (req) => {
    const token = queryToken(req);
    const pending = await db
      .select()
      .from(listings)
      .where(and(eq(listings.status, "pending_review")));
    const cards = pending
      .map((listing) => {
        const fraud = listing.fraudCheck as { score: number; reasons: string[] } | null;
        return `<div class="card">
  <strong>${escapeHtml(listing.title)}</strong> <span class="badge">${escapeHtml(listing.listingType)}</span>
  <p>${escapeHtml(listing.description)}</p>
  ${
    fraud
      ? `<div class="meta">Betrugs-Score: ${(fraud.score * 100).toFixed(0)}% ${
          fraud.reasons.length > 0 ? "- " + fraud.reasons.map(escapeHtml).join("; ") : ""
        }</div>`
      : ""
  }
  <form class="inline" method="post" action="/internal/listings/${listing.id}/approve?token=${encodeURIComponent(token)}">
    <input type="submit" value="Freigeben und Text generieren" />
  </form>
</div>`;
      })
      .join("\n");
    return layout("Inserate zur Freigabe", pending.length > 0 ? cards : "<p>Nichts zu prüfen.</p>");
  });

  app.post<{ Params: { id: string } }>("/listings/:id/approve", async (req, reply) => {
    await approveListing(req.params.id);
    return reply.redirect(`/internal/listings/review?token=${queryToken(req)}`);
  });
}
