import { Router } from "express";
import { db } from "../db";
import { apiKeysTable } from "../db";
import { eq } from "drizzle-orm";

const router = Router();

const PREFIX_MAP: Record<string, string[]> = {
  gemini: ["AIza", "AQ"],
  openai: ["sk-"],
  tavily: ["tvly-"],
  exa: ["exa-"],
  firecrawl: ["fc-"],
  serper: [],
  perplexity: ["pplx-"],
  groq: ["gsk_"],
};

function checkPrefixValid(provider: string, apiKey: string): boolean {
  const prefixes = PREFIX_MAP[provider] ?? [];
  if (prefixes.length === 0) return true;
  return prefixes.some((p) => apiKey.startsWith(p));
}

function maskKey(apiKey: string) {
  const first = apiKey.slice(0, 6);
  const last = apiKey.slice(-4);
  const middle = Math.max(0, apiKey.length - 10);
  return `${first}${"•".repeat(middle)}${last}`;
}

// ─── List all keys ────────────────────────────────────────────────────────────
router.get("/api-keys", async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(apiKeysTable)
      .orderBy(apiKeysTable.provider, apiKeysTable.createdAt);

    const masked = rows.map((r) => ({
      ...r,
      apiKey: maskKey(r.apiKey),
      prefixValid: checkPrefixValid(r.provider, r.apiKey),
    }));
    res.json(masked);
  } catch (err) {
    next(err);
  }
});

// ─── Add a new key ────────────────────────────────────────────────────────────
router.post("/api-keys", async (req, res, next) => {
  try {
    const { provider, label, apiKey, setActive } = req.body as {
      provider: string;
      label?: string;
      apiKey: string;
      setActive?: boolean;
    };

    if (!provider || !apiKey) {
      res.status(400).json({ error: "provider and apiKey are required" });
      return;
    }

    const VALID_PROVIDERS = [
      "gemini", "tavily", "exa", "firecrawl", "serper", "openai", "perplexity", "groq",
    ];
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` });
      return;
    }

    const existingCount = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.provider, provider));
    const autoLabel = label?.trim() || `${provider} Key ${existingCount.length + 1}`;

    if (setActive) {
      await db
        .update(apiKeysTable)
        .set({ isActive: false })
        .where(eq(apiKeysTable.provider, provider));
    }

    const [inserted] = await db
      .insert(apiKeysTable)
      .values({ provider, label: autoLabel, apiKey, isActive: setActive ?? false })
      .returning();

    res.status(201).json({
      ...inserted,
      apiKey: maskKey(inserted.apiKey),
      prefixValid: checkPrefixValid(inserted.provider, inserted.apiKey),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Activate a key ───────────────────────────────────────────────────────────
router.patch("/api-keys/:id/activate", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [target] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id)).limit(1);
    if (!target) { res.status(404).json({ error: "Key not found" }); return; }

    await db.update(apiKeysTable).set({ isActive: false }).where(eq(apiKeysTable.provider, target.provider));
    const [updated] = await db.update(apiKeysTable).set({ isActive: true }).where(eq(apiKeysTable.id, id)).returning();

    res.json({ ...updated, apiKey: maskKey(updated.apiKey), prefixValid: checkPrefixValid(updated.provider, updated.apiKey) });
  } catch (err) { next(err); }
});

// ─── Deactivate a key ─────────────────────────────────────────────────────────
router.patch("/api-keys/:id/deactivate", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [updated] = await db.update(apiKeysTable).set({ isActive: false }).where(eq(apiKeysTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Key not found" }); return; }

    res.json({ ...updated, apiKey: maskKey(updated.apiKey), prefixValid: checkPrefixValid(updated.provider, updated.apiKey) });
  } catch (err) { next(err); }
});

// ─── Delete a single key ──────────────────────────────────────────────────────
router.delete("/api-keys/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [deleted] = await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Key not found" }); return; }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Delete ALL keys for a specific provider ──────────────────────────────────
router.delete("/api-keys/by-provider/:provider", async (req, res, next) => {
  try {
    const { provider } = req.params;
    const VALID_PROVIDERS = ["gemini", "tavily", "exa", "firecrawl", "serper", "openai", "perplexity", "groq"];
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: "Invalid provider" });
      return;
    }
    const deleted = await db.delete(apiKeysTable).where(eq(apiKeysTable.provider, provider)).returning();
    res.json({ success: true, deleted: deleted.length });
  } catch (err) { next(err); }
});

// ─── Delete ALL keys (reset) ──────────────────────────────────────────────────
router.delete("/api-keys", async (_req, res, next) => {
  try {
    await db.delete(apiKeysTable);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
