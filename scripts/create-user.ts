// Crée (ou met à jour) un utilisateur dans PostgreSQL — utilitaire de dev de la nouvelle approche
// clean-archi : driver `pg` + Drizzle (schéma source unique `drizzle/schema.pg`) + hash bcrypt
// (genSalt(10), parité avec le `BcryptPasswordHasher` du new-stack). Idempotent : upsert par email.
//
// Remplace l'ancien `create-zoubej-user.mjs` (mysql2) qui contenait des identifiants de prod EN DUR
// (TiDB) — retirés ici ; tout est paramétré par env, défaut = PG jetable local.
//
//   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
//   USER_EMAIL=zoubej@gmail.com USER_PASSWORD='Zoubej@6691' USER_NAME='Test User' \
//   pnpm exec tsx scripts/create-user.ts
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema.pg";

const EMAIL = process.env.USER_EMAIL || "zoubej@gmail.com";
const PASSWORD = process.env.USER_PASSWORD || "Zoubej@6691";
const NAME = process.env.USER_NAME || "Test User";

async function main() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log(`🚀 Upsert de l'utilisateur ${EMAIL}…`);
  try {
    const password = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (existing.length) {
      const patch: Partial<typeof users.$inferInsert> = { password, name: NAME };
      if (process.env.USER_ROLE) patch.role = process.env.USER_ROLE as typeof patch.role;
      await db.update(users).set(patch).where(eq(users.email, EMAIL));
      console.log(`🔁 Utilisateur existant mis à jour (id=${existing[0].id})${process.env.USER_ROLE ? ` — rôle=${process.env.USER_ROLE}` : ""}.`);
    } else {
      const values: typeof users.$inferInsert = { email: EMAIL, password, name: NAME };
      if (process.env.USER_ROLE) values.role = process.env.USER_ROLE as typeof values.role;
      const [row] = await db.insert(users).values(values).returning({ id: users.id });
      console.log(`✅ Utilisateur créé (id=${row.id}).`);
    }
    console.log(`📧 Email : ${EMAIL}`);
  } catch (error) {
    console.error("❌ Erreur :", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
