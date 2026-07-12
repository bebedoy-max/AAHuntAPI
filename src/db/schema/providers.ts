import { pgTable, serial, text, boolean, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url").notNull().unique(),
  description: text("description"),
  freeCreditAmount: text("free_credit_amount"),
  creditType: text("credit_type"),
  hasKling: boolean("has_kling").notNull().default(false),
  klingDetail: text("kling_detail"),
  category: text("category").notNull(),
  requiresCreditCard: boolean("requires_credit_card").notNull().default(false),
  expiryDays: integer("expiry_days"),
  status: text("status").notNull().default("unverified"), // active, expired, unverified
  entityType: text("entity_type").notNull().default("ai_provider"), // ai_provider, blog, social_media, video, news, aggregator, other
  qualityScore: integer("quality_score").notNull().default(0), // 0-100, computed after each research run
  lastVerifiedAt: timestamp("last_verified_at"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProviderSchema = createInsertSchema(providersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providersTable.$inferSelect;
