import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  providerName: text("provider_name").notNull(),
  providerUrl: text("provider_url"),
  code: text("code").notNull(),
  description: text("description").notNull(),
  discountType: text("discount_type"), // percentage, free_credits, free_trial, fixed_amount, other
  discountValue: text("discount_value"), // "20%", "$10", "3 months"
  sourceUrl: text("source_url"),
  sourceName: text("source_name"), // "Reddit r/ChatGPT", "AppSumo", "Official"
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("unverified"), // active, expired, unverified
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("promo_codes_provider_code_uniq").on(t.providerName, t.code),
]);

export type PromoCode = typeof promoCodesTable.$inferSelect;
