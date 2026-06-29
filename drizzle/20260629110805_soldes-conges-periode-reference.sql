ALTER TABLE "soldes_conges" ADD COLUMN "periodeDebut" date;--> statement-breakpoint
ALTER TABLE "soldes_conges" ADD COLUMN "periodeFin" date;--> statement-breakpoint
ALTER TABLE "soldes_conges" ADD COLUMN "joursReportes" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_soldes_conges_periode" ON "soldes_conges" USING btree ("artisanId","technicienId","type","periodeDebut");