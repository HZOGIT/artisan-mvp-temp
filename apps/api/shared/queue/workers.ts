import { eq } from "drizzle-orm";
import type { WorkerPort } from "../ports/event-bus";
import type { EmailPort } from "../ports/email";
import type { DbClient } from "../db/client";
import { artisans, users, signaturesDevis } from "../../../../drizzle/schema.pg";

export interface WorkerDeps {
  readonly email: EmailPort;
  readonly db: DbClient;
}

async function resolveArtisanEmail(db: DbClient, artisanId: number): Promise<string | null> {
  const [a] = await db.select({ userId: artisans.userId }).from(artisans).where(eq(artisans.id, artisanId)).limit(1);
  if (!a?.userId) return null;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, a.userId)).limit(1);
  return u?.email ?? null;
}

/**
 * Enregistre les workers pg-boss pour les événements domaine.
 * Handlers best-effort : les erreurs sont silencieuses (pg-boss gère les retries).
 */
export function registerWorkers(workers: WorkerPort, deps: WorkerDeps): void {
  workers.register<{ factureId: number; artisanId: number }>("FACTURE_PAYEE", async (event) => {
    try {
      const to = await resolveArtisanEmail(deps.db, event.payload.artisanId);
      if (!to) return;
      await deps.email.send({ to, subject: "Facture payée", body: `Votre facture #${event.payload.factureId} a été réglée.` });
    } catch { /* best-effort */ }
  });

  workers.register<{ devisId: number; artisanId: number }>("DEVIS_ACCEPTE", async (event) => {
    try {
      const to = await resolveArtisanEmail(deps.db, event.payload.artisanId);
      if (!to) return;
      await deps.email.send({ to, subject: "Devis accepté", body: `Votre devis #${event.payload.devisId} a été accepté par votre client.` });
    } catch { /* best-effort */ }
  });

  workers.register<{ devisId: number; artisanId: number }>("SIGNATURE_COMPLETE", async (event) => {
    try {
      const [artisanTo, sigs] = await Promise.all([
        resolveArtisanEmail(deps.db, event.payload.artisanId),
        deps.db.select({ signataireEmail: signaturesDevis.signataireEmail }).from(signaturesDevis).where(eq(signaturesDevis.devisId, event.payload.devisId)).limit(1),
      ]);
      if (artisanTo) await deps.email.send({ to: artisanTo, subject: "Contrat signé", body: `Le devis #${event.payload.devisId} a été signé par votre client.` });
      const clientEmail = sigs[0]?.signataireEmail;
      if (clientEmail) await deps.email.send({ to: clientEmail, subject: "Contrat signé", body: `Votre signature pour le devis #${event.payload.devisId} a bien été enregistrée.` });
    } catch { /* best-effort */ }
  });

  workers.register<{ artisanId: number }>("ABONNEMENT_EXPIRE", async (event) => {
    try {
      const to = await resolveArtisanEmail(deps.db, event.payload.artisanId);
      if (!to) return;
      await deps.email.send({ to, subject: "Abonnement expiré", body: "Votre abonnement Operioz a expiré. Renouvelez-le pour continuer à accéder à toutes les fonctionnalités." });
    } catch { /* best-effort */ }
  });
}
