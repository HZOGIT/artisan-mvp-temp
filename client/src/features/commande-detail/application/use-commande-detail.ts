import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Ligne, Fournisseur, Depense } from "../domain/commande-detail";

// Couche APPLICATION — détail commande fournisseur : commande (getById) + lignes (getLignes, séparé) +
// fournisseurs + dépenses + mutations (statut/suppression/email/facturation/réception). SEULE couche tRPC.
export function useCommandeDetail(id: number) {
  const utils = trpc.useUtils();
  const enabled = id > 0;
  const commandeQ = trpc.commandesFournisseurs.getById.useQuery(enabled ? { id } : skipToken);
  const lignesQ = trpc.commandesFournisseurs.getLignes.useQuery(enabled ? { commandeId: id } : skipToken);
  const fournisseursQ = trpc.fournisseurs.list.useQuery();
  const depensesQ = trpc.depenses.list.useQuery();

  const inv = () => { utils.commandesFournisseurs.getById.invalidate({ id }); utils.commandesFournisseurs.list.invalidate(); };
  const invLignes = () => { utils.commandesFournisseurs.getLignes.invalidate({ commandeId: id }); inv(); };

  return {
    commande: commandeQ.data, isLoading: commandeQ.isLoading,
    lignes: (lignesQ.data ?? []) as Ligne[],
    fournisseurs: (fournisseursQ.data ?? []) as Fournisseur[],
    depenses: (depensesQ.data ?? []) as Depense[],
    updateStatut: trpc.commandesFournisseurs.updateStatut.useMutation({ onSuccess: inv }),
    remove: trpc.commandesFournisseurs.delete.useMutation(),
    sendEmail: trpc.commandesFournisseurs.sendEmail.useMutation({ onSuccess: () => utils.commandesFournisseurs.getById.invalidate({ id }) }),
    setFacturation: trpc.commandesFournisseurs.setStatutFacturation.useMutation({ onSuccess: inv }),
    recevoir: trpc.commandesFournisseurs.recevoir.useMutation({ onSuccess: invLignes }),
  };
}
