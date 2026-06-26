import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { artisans } from "./artisans";

export const files = pgTable("files", {
  id:          serial("id").primaryKey(),
  artisanId:   integer("artisan_id").references(() => artisans.id),
  storageKey:  varchar("storage_key", { length: 500 }).notNull().unique(),
  filename:    varchar("filename", { length: 255 }),
  mimeType:    varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes:   integer("size_bytes").notNull(),
  sha256:      varchar("sha256", { length: 64 }).notNull(),
  purpose:     varchar("purpose", { length: 50 }).notNull(),
  bucket:      varchar("bucket", { length: 100 }).notNull(),
  uploadedAt:  timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt:   timestamp("deleted_at", { withTimezone: true }),
});

export type StoredFileRow = typeof files.$inferSelect;
export type InsertFileRow = typeof files.$inferInsert;
