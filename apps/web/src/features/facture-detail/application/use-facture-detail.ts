import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { ArticleSearchResult } from "../domain/facture-detail";

/** Recherche d'articles via le REST public `/api/articles/search` (effet). Renvoie [] sur échec. */
export async function searchArticlesRest(query: string): Promise<ArticleSearchResult[]> {
  try {
    const res = await fetch(`/api/articles/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
    if (!res.ok) return [];
    return (await res.json()) as ArticleSearchResult[];
  } catch {
    return [];
  }
}

/*
 * Couche APPLICATION — éditeur de facture : facture (getById, riche) + avoirs + audit + artisan/paramètres (PDF)
 * + activités CRM + transitions/paiement/avoir/lignes/email. SEULE couche important tRPC.
 */
export function useFactureDetail(id: number) {
  const utils = trpc.useUtils();
  const enabled = id > 0;
  const inv = () => { utils.factures.getById.invalidate({ id }); utils.factures.getAuditLog.invalidate({ factureId: id }); };

  const factureQ = trpc.factures.getById.useQuery(enabled ? { id } : skipToken);
  const artisanQ = trpc.artisan.getProfile.useQuery();
  const parametresQ = trpc.parametres.get.useQuery();
  const activitesQ = trpc.activites.list.useQuery();
  const facture = factureQ.data;
  const avoirsQ = trpc.factures.getAvoirsByFacture.useQuery(enabled && facture ? { factureId: id } : skipToken);
  const auditQ = trpc.factures.getAuditLog.useQuery(enabled && facture ? { factureId: id } : skipToken);

  return {
    facture, isLoading: factureQ.isLoading,
    artisan: artisanQ.data, parametres: parametresQ.data,
    activites: activitesQ.data ?? [], refetchActivites: activitesQ.refetch,
    avoirs: avoirsQ.data ?? [], auditLogs: auditQ.data ?? [], inv,
    envoyer: trpc.factures.envoyer.useMutation(),
    marquerEnRetard: trpc.factures.marquerEnRetard.useMutation(),
    addLigne: trpc.factures.addLigne.useMutation({ onSuccess: () => utils.factures.getById.invalidate({ id }) }),
    markAsPaid: trpc.factures.markAsPaid.useMutation({ onSuccess: inv }),
    createAvoir: trpc.factures.createAvoir.useMutation(),
    sendByEmail: trpc.factures.sendByEmail.useMutation(),
    createRappel: trpc.activites.create.useMutation(),
    toggleRappel: trpc.activites.toggleFait.useMutation(),
    deleteRappel: trpc.activites.delete.useMutation(),
  };
}
