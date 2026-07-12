import { pgTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  /** Provider slug: gemini | tavily | exa | firecrawl | serper | openai | perplexity */
  provider: varchar("provider", { length: 50 }).notNull(),
  /** Human-readable label, e.g. "Gemini Akun 2" */
  label: varchar("label", { length: 100 }).notNull(),
  /** The raw API key (user-supplied, stored in DB) */
  apiKey: text("api_key").notNull(),
  /** Only one key per provider should be active at a time */
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
export type InsertApiKey = typeof apiKeysTable.$inferInsert;
