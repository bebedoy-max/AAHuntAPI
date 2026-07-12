import { Router } from "express";
import { db } from "../db";
import { researchJobsTable, apiKeysTable } from "../db";
import { eq, sql, and } from "drizzle-orm";
import { runResearchJob } from "../services/gemini-research";
import { structureWithGemini } from "../services/research-providers";

const router = Router();

// Simple in-process lock to avoid duplicate concurrent triggers
let researchRunning = false;

// POST /research/trigger
router.post("/research/trigger", async (req, res) => {
  try {
    if (researchRunning) {
      res.status(409).json({ error: "A research job is already running" });
      return;
    }

    // Check DB for any active jobs (handles multi-process scenarios)
    const active = await db.select()
      .from(researchJobsTable)
      .where(sql`status IN ('pending', 'running')`)
      .limit(1);

    if (active.length > 0) {
      res.status(409).json({ error: "A research job is already running" });
      return;
    }

    // Parse targets from body; default to all targets
    const body = req.body as { targets?: unknown };
    const targets: string[] = Array.isArray(body?.targets) && (body.targets as string[]).length > 0
      ? (body.targets as string[]).filter((t: unknown) => typeof t === "string")
      : ["providers", "codes", "content"];

    // Create the job and start immediately
    const [job] = await db.insert(researchJobsTable)
      .values({ status: "running", startedAt: new Date(), targets: JSON.stringify(targets) })
      .returning();

    if (!job) {
      res.status(500).json({ error: "Failed to create research job" });
      return;
    }

    // Set lock and run in background
    researchRunning = true;
    setImmediate(async () => {
      try {
        await runResearchJob(job.id, targets);
      } finally {
        researchRunning = false;
      }
    });

    res.json({
      id: job.id,
      status: job.status,
      started_at: job.startedAt.toISOString(),
      completed_at: null,
      providers_found: null,
      providers_updated: null,
      error_message: null,
      log: null,
      targets: job.targets,
    });
  } catch (err) {
    researchRunning = false;
    req.log.error({ err }, "Failed to trigger research");
    res.status(500).json({ error: "Failed to trigger research" });
  }
});

// GET /research/status
router.get("/research/status", async (req, res) => {
  try {
    const [job] = await db.select()
      .from(researchJobsTable)
      .orderBy(sql`started_at DESC`)
      .limit(1);

    if (!job) {
      res.json({
        id: 0,
        status: "none",
        started_at: new Date().toISOString(),
        completed_at: null,
        providers_found: null,
        providers_updated: null,
        error_message: null,
        log: null,
      });
      return;
    }

    res.json({
      id: job.id,
      status: job.status,
      started_at: job.startedAt.toISOString(),
      completed_at: job.completedAt?.toISOString() ?? null,
      providers_found: job.providersFound,
      providers_updated: job.providersUpdated,
      error_message: job.errorMessage,
      log: job.log,
      targets: job.targets,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get research status");
    res.status(500).json({ error: "Failed to get research status" });
  }
});

// GET /research/history
router.get("/research/history", async (req, res) => {
  try {
    const jobs = await db.select()
      .from(researchJobsTable)
      .orderBy(sql`started_at DESC`)
      .limit(50);

    res.json(jobs.map(job => ({
      id: job.id,
      status: job.status,
      started_at: job.startedAt.toISOString(),
      completed_at: job.completedAt?.toISOString() ?? null,
      providers_found: job.providersFound,
      providers_updated: job.providersUpdated,
      error_message: job.errorMessage,
      log: job.log,
      targets: job.targets,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get research history");
    res.status(500).json({ error: "Failed to get research history" });
  }
});

// POST /research/test-structure (dev only — verify chunking + token fix)
router.post("/research/test-structure", async (req, res) => {
  if (process.env["NODE_ENV"] === "production") { res.status(404).end(); return; }
  const { text, waveLabel = "TEST" } = req.body as { text?: string; waveLabel?: string };
  if (!text || typeof text !== "string") { res.status(400).json({ error: "text required" }); return; }

  const sep = "\n\n---\n\n";
  const CHUNK_SIZE = 80_000;
  function chunkText(t: string, max: number): string[] {
    if (t.length <= max) return [t];
    const parts = t.split(sep);
    const chunks: string[] = [];
    let current = "";
    for (const part of parts) {
      const cand = current ? current + sep + part : part;
      if (cand.length > max && current) { chunks.push(current); current = part; } else current = cand;
    }
    if (current) chunks.push(current);
    const result: string[] = [];
    for (const c of chunks) {
      if (c.length <= max) { result.push(c); continue; }
      for (let i = 0; i < c.length; i += max) result.push(c.slice(i, i + max));
    }
    return result;
  }

  const chunks = chunkText(text, CHUNK_SIZE);
  const results = [];

  // Fetch active Gemini key from DB (same source as production research jobs)
  const [activeKeyRow] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.provider, "gemini"), eq(apiKeysTable.isActive, true)))
    .limit(1);
  const apiKey = activeKeyRow?.apiKey;

  for (let ci = 0; ci < chunks.length; ci++) {
    try {
      if (!apiKey) throw new Error("No active Gemini API key found. Tambahkan key di menu API Keys.");
      const providers = await structureWithGemini(apiKey, chunks[ci], `${waveLabel} chunk ${ci+1}/${chunks.length}`);
      results.push({ chunk: ci + 1, chars: chunks[ci].length, providers: providers.length, names: providers.map((p: { name: string }) => p.name) });
    } catch (err) {
      const e = err as Error;
      results.push({ chunk: ci + 1, chars: chunks[ci].length, keyAvailable: !!apiKey, error: e.message.substring(0, 300), stack: e.stack?.split('\n').slice(0, 6).join(' | ') });
    }
  }
  const total = results.reduce((s: number, r: { providers?: number }) => s + (r.providers ?? 0), 0);
  res.json({ totalChars: text.length, chunks: chunks.length, chunkSizes: chunks.map(c => c.length), results, totalProviders: total });
});

// POST /research/reset — wipe all providers + promo codes
router.post("/research/reset", async (req, res) => {
  try {
    const provResult = await db.execute(sql`DELETE FROM providers`);
    const codeResult = await db.execute(sql`DELETE FROM promo_codes`);
    const provCount = Number((provResult as { rowCount?: number }).rowCount ?? 0);
    const codeCount = Number((codeResult as { rowCount?: number }).rowCount ?? 0);
    req.log.info({ provCount, codeCount }, "Dashboard data reset");
    res.json({
      message: "Semua data berhasil direset",
      providers_deleted: provCount,
      codes_deleted: codeCount,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to reset data");
    res.status(500).json({ error: "Failed to reset data" });
  }
});

export { researchRunning };
export default router;
