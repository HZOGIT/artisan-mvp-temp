import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { artisans } from "./artisans";
import { files } from "./files";
import { devis } from "./devis";
import { factures } from "./factures";

export const piecesJointes = pgTable("pieces_jointes", {
  id:        serial("id").primaryKey(),
  artisanId: integer("artisan_id").notNull().references(() => artisans.id),
  fileId:    integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  devisId:   integer("devis_id").references(() => devis.id, { onDelete: "cascade" }),
  factureId: integer("facture_id").references(() => factures.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PieceJointeRow = typeof piecesJointes.$inferSelect;
export type InsertPieceJointeRow = typeof piecesJointes.$inferInsert;
