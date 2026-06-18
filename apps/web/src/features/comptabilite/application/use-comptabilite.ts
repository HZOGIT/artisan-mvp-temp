import { trpc } from "@/shared/trpc";

// Couche APPLICATION de la feature `comptabilite` (lecture seule) (clean-archi) : SEULE couche important
// tRPC. Regroupe les 6 rapports (grand livre, balance, TVA, journal des ventes, aperçu FEC, détail CA3)
// sur une même période, et expose des données TYPÉES + les états de chargement. Aucune mutation (la page
// est en lecture seule ; les exports FEC/CSV/PDF/Factur-X passent par des endpoints REST de téléchargement
// côté UI). L'UI ne connaît plus le transport.
export function useComptabilite(dateDebut: string, dateFin: string) {
  const range = { dateDebut: new Date(dateDebut), dateFin: new Date(dateFin) };

  const grandLivreQ = trpc.comptabilite.getGrandLivre.useQuery(range);
  const balanceQ = trpc.comptabilite.getBalance.useQuery(range);
  const rapportTVAQ = trpc.comptabilite.getRapportTVA.useQuery(range);
  const journalVentesQ = trpc.comptabilite.getJournalVentes.useQuery(range);
  const fecPreviewQ = trpc.comptabilite.getFecPreview.useQuery(range);
  const tvaDetailQ = trpc.comptabilite.getDeclarationTVADetail.useQuery(range);

  return {
    grandLivre: grandLivreQ.data,
    loadingGL: grandLivreQ.isLoading,
    balance: balanceQ.data,
    loadingBalance: balanceQ.isLoading,
    rapportTVA: rapportTVAQ.data,
    loadingTVA: rapportTVAQ.isLoading,
    journalVentes: journalVentesQ.data,
    loadingJV: journalVentesQ.isLoading,
    fecPreview: fecPreviewQ.data,
    loadingFec: fecPreviewQ.isLoading,
    tvaDetail: tvaDetailQ.data,
  };
}
