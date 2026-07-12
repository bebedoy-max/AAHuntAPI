import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";
import { recoverStaleJobs } from "./services/gemini-research";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In the self-hosted ZIP, public/ sits next to index.mjs in dist/
const publicDir = path.join(__dirname, "public");

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = Number(process.env["PORT"] ?? 8080);

app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "CreditHunter server ready on port " + port);
  await recoverStaleJobs();
});
