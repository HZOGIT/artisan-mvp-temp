ALTER TABLE "depenses" ADD COLUMN "coeff_deductibilite" numeric(5, 2) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_coeff_deductibilite_range" CHECK ("coeff_deductibilite" >= 0 AND "coeff_deductibilite" <= 100);
