import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";

/*
 * Couche APPLICATION — éditeur de devis : devis (getById, riche) + artisan/paramètres (PDF) + activités CRM +
 * signature + variantes + transitions/actions. SEULE couche important tRPC ; effets en UI via options.
 */
export function useDevisDetail(id: number) {
  const utils = trpc.useUtils();
  const enabled = id > 0;
  const inv = () => utils.devis.getById.invalidate({ id });

  const devisQ = trpc.devis.getById.useQuery(enabled ? { id } : skipToken);
  const artisanQ = trpc.artisan.getProfile.useQuery();
  const parametresQ = trpc.parametres.get.useQuery();
  const activitesQ = trpc.activites.list.useQuery();
  const signatureQ = trpc.signature.getSignatureByDevis.useQuery(enabled ? { devisId: id } : skipToken);
  const variantesQ = trpc.devisOptions.getByDevisId.useQuery(enabled ? { devisId: id } : skipToken);
  const piecesQ = trpc.piecesJointes.listByDevis.useQuery(enabled ? { devisId: id } : skipToken);

  return {
    devis: devisQ.data, isLoading: devisQ.isLoading,
    artisan: artisanQ.data, parametres: parametresQ.data,
    activites: activitesQ.data ?? [], refetchActivites: activitesQ.refetch,
    signature: signatureQ.data,
    variantes: variantesQ.data ?? [], refetchVariantes: variantesQ.refetch,
    pieces: piecesQ.data ?? [], refetchPieces: piecesQ.refetch,
    inv,
    /** transitions de statut (machine à états dédiée) */
    envoyer: trpc.devis.envoyer.useMutation(),
    accepter: trpc.devis.accepter.useMutation(),
    refuser: trpc.devis.refuser.useMutation(),
    expirer: trpc.devis.expirer.useMutation(),
    /** actions */
    deleteLigne: trpc.devis.deleteLigne.useMutation({ onSuccess: inv }),
    convertToFacture: trpc.devis.convertToFacture.useMutation(),
    sendByEmail: trpc.devis.sendByEmail.useMutation(),
    duplicate: trpc.devis.duplicate.useMutation(),
    /** CRM */
    createRappel: trpc.activites.create.useMutation(),
    toggleRappel: trpc.activites.toggleFait.useMutation(),
    deleteRappel: trpc.activites.delete.useMutation(),
    /** situations de travaux (facturation partielle) */
    facturerSituation: trpc.factures.facturerSituation.useMutation(),
    /** acomptes et solde */
    facturerAcompte: trpc.factures.facturerAcompte.useMutation(),
    facturerSolde: trpc.factures.facturerSolde.useMutation(),
    /** signature */
    requestSignature: trpc.signature.createSignatureLink.useMutation(),
    /** variantes */
    createVariante: trpc.devisOptions.create.useMutation(),
    selectVariante: trpc.devisOptions.select.useMutation(),
    deleteVariante: trpc.devisOptions.delete.useMutation(),
    convertirVariante: trpc.devisOptions.convertirEnDevis.useMutation(),
    /** pièces jointes */
    deletePiece: trpc.piecesJointes.delete.useMutation({ onSuccess: () => piecesQ.refetch() }),
  };
}
