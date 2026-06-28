import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { interventions, clients, artisans, emailOptouts, parametresArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { EmailPort } from "../../../shared/ports/email";

/** Échappement HTML minimal (anti-injection) pour les champs interpolés dans le corps de l'email. */
function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildRappelHtml(p: { clientNom: string; artisanNom: string; date: string; heure: string; adresse: string | null }): string {
  return `<p>Bonjour ${safeHtml(p.clientNom)},</p>
<p>Nous vous rappelons votre rendez-vous prévu <strong>demain</strong> avec <strong>${safeHtml(p.artisanNom)}</strong>.</p>
<p><strong>Date :</strong> ${safeHtml(p.date)}<br><strong>Heure :</strong> ${safeHtml(p.heure)}${p.adresse ? `<br><strong>Adresse :</strong> ${safeHtml(p.adresse)}` : ""}</p>
<p>En cas d'empêchement, n'hésitez pas à nous contacter le plus tôt possible.</p>
<p>À demain,<br><strong>${safeHtml(p.artisanNom)}</strong></p>`;
}

/**
 * Envoie un email de rappel J-1 aux clients dont l'intervention est planifiée le lendemain.
 * Idempotent via le drapeau `rappelClientEnvoye`. Respecte le toggle `rappelRdvClientActif`
 * par artisan et exclut les opt-outs (table `email_optouts`).
 */
export async function envoyerRappelsRdvClients(
  db: DbClient,
  email: EmailPort,
  now: Date = new Date(),
): Promise<{ rappelsEnvoyes: number }> {
  const tomorrowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const dayStart = tomorrowUTC;
  const dayEnd = new Date(Date.UTC(tomorrowUTC.getUTCFullYear(), tomorrowUTC.getUTCMonth(), tomorrowUTC.getUTCDate(), 23, 59, 59, 999));

  /* artisans RLS OFF — accessible sans GUC */
  const artisanRows = await db
    .select({ id: artisans.id, nomEntreprise: artisans.nomEntreprise, email: artisans.email })
    .from(artisans);

  let rappelsEnvoyes = 0;

  for (const artisan of artisanRows) {
    let eligibles: Array<{
      interventionId: number;
      adresse: string | null;
      dateDebut: Date;
      clientEmail: string | null;
      clientNom: string;
      clientPrenom: string | null;
    }> = [];

    try {
      eligibles = await withTenant(db, { artisanId: artisan.id, userId: 0 }, async (tx) => {
        const [params] = await tx
          .select({ rappelRdvClientActif: parametresArtisan.rappelRdvClientActif })
          .from(parametresArtisan)
          .where(eq(parametresArtisan.artisanId, artisan.id))
          .limit(1);
        /* Default true : si pas de ligne de params ou champ null → rappel actif */
        if (params?.rappelRdvClientActif === false) return [];

        return tx
          .select({
            interventionId: interventions.id,
            adresse: interventions.adresse,
            dateDebut: interventions.dateDebut,
            clientEmail: clients.email,
            clientNom: clients.nom,
            clientPrenom: clients.prenom,
          })
          .from(interventions)
          .innerJoin(clients, eq(clients.id, interventions.clientId))
          .leftJoin(emailOptouts, eq(emailOptouts.email, clients.email))
          .where(
            and(
              eq(interventions.artisanId, artisan.id),
              eq(interventions.statut, "planifiee"),
              eq(interventions.rappelClientEnvoye, false),
              gte(interventions.dateDebut, dayStart),
              lte(interventions.dateDebut, dayEnd),
              isNotNull(clients.email),
              isNull(emailOptouts.id),
            ),
          );
      });
    } catch {
      /* best-effort — passer à l'artisan suivant */
    }

    for (const row of eligibles) {
      if (!row.clientEmail) continue;
      try {
        const artisanNom = artisan.nomEntreprise || "Votre prestataire";
        const clientNom = [row.clientPrenom, row.clientNom].filter(Boolean).join(" ") || "Client";
        const date = row.dateDebut.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
        const heure = row.dateDebut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

        await email.send({
          to: row.clientEmail,
          subject: `Rappel de votre rendez-vous demain — ${artisanNom}`,
          body: buildRappelHtml({ clientNom, artisanNom, date, heure, adresse: row.adresse }),
          fromName: artisanNom,
          replyTo: artisan.email ?? undefined,
        });

        await withTenant(db, { artisanId: artisan.id, userId: 0 }, (tx) =>
          tx
            .update(interventions)
            .set({ rappelClientEnvoye: true, dateRappelClient: now })
            .where(and(eq(interventions.id, row.interventionId), eq(interventions.artisanId, artisan.id))),
        );

        rappelsEnvoyes++;
      } catch {
        /* best-effort — passer à la prochaine intervention */
      }
    }
  }

  return { rappelsEnvoyes };
}
