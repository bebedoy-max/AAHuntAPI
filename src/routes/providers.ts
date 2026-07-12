import { Router } from "express";
import { db } from "../db";
import { providersTable, researchJobsTable } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListProvidersQueryParams,
  GetProviderParams,
} from "../api-zod";

const router = Router();

function serializeProvider(p: typeof providersTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    logo_url: p.logoUrl,
    website_url: p.websiteUrl,
    description: p.description,
    free_credit_amount: p.freeCreditAmount,
    credit_type: p.creditType,
    has_kling: p.hasKling,
    kling_detail: p.klingDetail,
    category: p.category,
    entity_type: p.entityType ?? "ai_provider",
    quality_score: p.qualityScore ?? 0,
    requires_credit_card: p.requiresCreditCard,
    expiry_days: p.expiryDays,
    status: p.status,
    last_verified_at: p.lastVerifiedAt?.toISOString() ?? null,
    source_url: p.sourceUrl,
    notes: p.notes,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

// GET /providers
router.get("/providers", async (req, res) => {
  try {
    const parsed = ListProvidersQueryParams.safeParse(req.query);
    const params = parsed.success ? parsed.data : {};

    const conditions = [];
    if (params.category) conditions.push(eq(providersTable.category, params.category));
    if (params.has_kling !== undefined) conditions.push(eq(providersTable.hasKling, params.has_kling));
    if (params.status) conditions.push(eq(providersTable.status, params.status));
    if ((params as Record<string, unknown>).entity_type) {
      conditions.push(eq(providersTable.entityType, String((params as Record<string, unknown>).entity_type)));
    }

    const providers = await db.select()
      .from(providersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`quality_score DESC`, sql`has_kling DESC`, providersTable.name);

    res.json(providers.map(serializeProvider));
  } catch (err) {
    req.log.error({ err }, "Failed to list providers");
    res.status(500).json({ error: "Failed to list providers" });
  }
});

// GET /providers/summary — must be before /:id
router.get("/providers/summary", async (req, res) => {
  try {
    const all = await db.select().from(providersTable);

    const catMap: Record<string, number> = {};
    for (const p of all) {
      catMap[p.category] = (catMap[p.category] ?? 0) + 1;
    }

    const lastJob = await db.select()
      .from(researchJobsTable)
      .where(eq(researchJobsTable.status, "completed"))
      .orderBy(sql`completed_at DESC`)
      .limit(1);

    res.json({
      total_providers: all.length,
      kling_providers: all.filter(p => p.hasKling).length,
      active_providers: all.filter(p => p.status === "active").length,
      no_credit_card_required: all.filter(p => !p.requiresCreditCard).length,
      categories: Object.entries(catMap).map(([category, count]) => ({ category, count })),
      last_research_at: lastJob[0]?.completedAt?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get summary");
    res.status(500).json({ error: "Failed to get summary" });
  }
});

// GET /providers/kling — must be before /:id
router.get("/providers/kling", async (req, res) => {
  try {
    const providers = await db.select()
      .from(providersTable)
      .where(eq(providersTable.hasKling, true))
      .orderBy(providersTable.name);

    res.json(providers.map(serializeProvider));
  } catch (err) {
    req.log.error({ err }, "Failed to get kling providers");
    res.status(500).json({ error: "Failed to get kling providers" });
  }
});

// GET /providers/:id
router.get("/providers/:id", async (req, res) => {
  try {
    const parsed = GetProviderParams.safeParse({ id: Number(req.params["id"]) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid provider ID" });
      return;
    }

    const [provider] = await db.select()
      .from(providersTable)
      .where(eq(providersTable.id, parsed.data.id))
      .limit(1);

    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    res.json(serializeProvider(provider));
  } catch (err) {
    req.log.error({ err }, "Failed to get provider");
    res.status(500).json({ error: "Failed to get provider" });
  }
});

export default router;
