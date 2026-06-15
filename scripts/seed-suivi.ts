// Seed des étapes de suivi d'un chantier (`suivi_chantier`) — PostgreSQL / nouvelle approche
// clean-archi : driver `pg` + Drizzle (schéma source unique `drizzle/schema.pg`). Dépend d'un
// chantier existant (seedé par seed-data/seed-demo) : cible le chantier « Mise aux normes », sinon
// le 1er `en_cours` ; no-op gracieux si aucun chantier. Idempotent (purge des étapes du chantier).
//   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
//   pnpm exec tsx scripts/seed-suivi.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like } from "drizzle-orm";
import { chantiers, suiviChantier } from "../drizzle/schema.pg";

type Etape = Pick<typeof suiviChantier.$inferInsert, "titre" | "statut" | "pourcentage" | "ordre" | "visibleClient">;

const etapes: Etape[] = [
  { titre: "Diagnostic electrique initial", statut: "termine", pourcentage: 100, ordre: 1, visibleClient: true },
  { titre: "Remplacement tableau electrique", statut: "termine", pourcentage: 100, ordre: 2, visibleClient: true },
  { titre: "Mise en conformite des circuits", statut: "en_cours", pourcentage: 60, ordre: 3, visibleClient: true },
  { titre: "Controle Consuel et finitions", statut: "a_faire", pourcentage: 0, ordre: 4, visibleClient: true },
];

async function seedSuivi() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("🔧 Insertion des etapes de suivi chantier…");
  try {
    // Chantier « Mise aux normes », sinon le 1er `en_cours`.
    let [chantier] = await db
      .select({ id: chantiers.id, nom: chantiers.nom })
      .from(chantiers)
      .where(like(chantiers.nom, "%Mise aux normes%"))
      .limit(1);
    if (!chantier) {
      [chantier] = await db
        .select({ id: chantiers.id, nom: chantiers.nom })
        .from(chantiers)
        .where(eq(chantiers.statut, "en_cours"))
        .limit(1);
    }
    if (!chantier) {
      console.log("❌ Aucun chantier trouve (lance d'abord seed-data/seed-demo).");
      return;
    }
    console.log(`✅ Chantier cible: "${chantier.nom}" (ID: ${chantier.id})`);

    // Idempotence : purge des étapes existantes de ce chantier.
    await db.delete(suiviChantier).where(eq(suiviChantier.chantierId, chantier.id));
    await db.insert(suiviChantier).values(etapes.map((e) => ({ ...e, chantierId: chantier.id })));

    console.log(`✅ ${etapes.length} etapes inserees pour le chantier ID ${chantier.id}.`);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedSuivi();
