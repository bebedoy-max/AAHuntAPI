import { Router } from "express";
import { db } from "../db";
import { promoCodesTable } from "../db";
import { eq, sql } from "drizzle-orm";
import { runCodeResearchJob } from "../services/gemini-research";

const router = Router();

// In-memory status for code research
interface CodeResearchStatus {
  status: "idle" | "running" | "completed" | "failed";
  message: string;
  codesFound: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

let codeResearchStatus: CodeResearchStatus = {
  status: "idle",
  message: "No code research run yet. Click 'Hunt Codes' to start.",
  codesFound: 0,
  startedAt: null,
  completedAt: null,
  errorMessage: null,
};

let codeResearchRunning = false;

// GET /codes
router.get("/codes", async (req, res) => {
  try {
    const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;

    let codes;
    if (status) {
      codes = await db.select().from(promoCodesTable).where(eq(promoCodesTable.status, status)).orderBy(sql`updated_at DESC`);
    } else {
      codes = await db.select().from(promoCodesTable).orderBy(sql`
        CASE WHEN status = 'active' THEN 0 WHEN status = 'unverified' THEN 1 ELSE 2 END,
        updated_at DESC
      `);
    }

    res.json(codes.map((c) => ({
      id: c.id,
      provider_name: c.providerName,
      provider_url: c.providerUrl,
      code: c.code,
      description: c.description,
      discount_type: c.discountType,
      discount_value: c.discountValue,
      source_url: c.sourceUrl,
      source_name: c.sourceName,
      expires_at: c.expiresAt?.toISOString() ?? null,
      status: c.status,
      verified_at: c.verifiedAt?.toISOString() ?? null,
      notes: c.notes,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list promo codes");
    res.status(500).json({ error: "Failed to list promo codes" });
  }
});

// GET /codes/research/status
router.get("/codes/research/status", (_req, res) => {
  res.json(codeResearchStatus);
});

// POST /codes/research
router.post("/codes/research", async (req, res) => {
  try {
    if (codeResearchRunning) {
      res.status(409).json({ error: "Code research is already running" });
      return;
    }

    codeResearchRunning = true;
    codeResearchStatus = {
      status: "running",
      message: "Hunting for promo codes via AI-powered web search…",
      codesFound: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      errorMessage: null,
    };

    res.json(codeResearchStatus);

    setImmediate(async () => {
      try {
        const codesFound = await runCodeResearchJob();
        codeResearchStatus = {
          status: "completed",
          message: `Found ${codesFound} promo codes — database updated.`,
          codesFound,
          startedAt: codeResearchStatus.startedAt,
          completedAt: new Date().toISOString(),
          errorMessage: null,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        codeResearchStatus = {
          status: "failed",
          message: "Code research failed.",
          codesFound: 0,
          startedAt: codeResearchStatus.startedAt,
          completedAt: new Date().toISOString(),
          errorMessage: errMsg,
        };
      } finally {
        codeResearchRunning = false;
      }
    });
  } catch (err) {
    codeResearchRunning = false;
    req.log.error({ err }, "Failed to trigger code research");
    res.status(500).json({ error: "Failed to trigger code research" });
  }
});

export default router;
