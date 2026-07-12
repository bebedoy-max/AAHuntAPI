import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const researchJobsTable = pgTable("research_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  providersFound: integer("providers_found"),
  providersUpdated: integer("providers_updated"),
  errorMessage: text("error_message"),
  log: text("log"),
  targets: text("targets").default('["providers","codes","content"]'),
});

export const insertResearchJobSchema = createInsertSchema(researchJobsTable).omit({ id: true });
export type InsertResearchJob = z.infer<typeof insertResearchJobSchema>;
export type ResearchJob = typeof researchJobsTable.$inferSelect;
