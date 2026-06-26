import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { files } from "./files";
import { artisans } from "./artisans";

export const messageFiles = pgTable("message_files", {
  id:             serial("id").primaryKey(),
  conversationId: varchar("conversation_id", { length: 100 }).notNull(),
  messageIndex:   integer("message_index").notNull(),
  fileId:         integer("file_id").notNull().references(() => files.id),
  artisanId:      integer("artisan_id").notNull().references(() => artisans.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MessageFileRow = typeof messageFiles.$inferSelect;
