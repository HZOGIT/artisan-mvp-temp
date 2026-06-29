import { trpc } from "@/shared/trpc";
import type { Conge, CongeEnAttente, SoldeResume, Technicien } from "../domain/conge";

/** Exercice courant côté client (même logique que le backend : juin→mai). */
function exerciceCourant(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/*
 * Couche APPLICATION de la feature `conges` (clean-archi) : SEULE couche important tRPC.
 * Charge la liste, les demandes en attente et les techniciens (pour résoudre les noms), et expose
 * les mutations du workflow (create / approuver / refuser) avec invalidation des deux listes.
 * Les effets de présentation (toasts, fermeture de dialog, reset de formulaire) sont attachés par
 * l'UI au cas par cas via `mutate(vars, { onSuccess, onError })`.
 */
export function useConges() {
  const utils = trpc.useUtils();
  const exercice = exerciceCourant();
  const listQ = trpc.conges.list.useQuery();
  const enAttenteQ = trpc.conges.enAttente.useQuery();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const soldesQ = trpc.conges.soldesTous.useQuery({ exercice });

  const invalidate = () => {
    utils.conges.list.invalidate();
    utils.conges.enAttente.invalidate();
    utils.conges.soldesTous.invalidate();
  };

  const create = trpc.conges.create.useMutation({ onSuccess: invalidate });
  const approuver = trpc.conges.approuver.useMutation({ onSuccess: invalidate });
  const refuser = trpc.conges.refuser.useMutation({ onSuccess: invalidate });
  const cloturerPeriode = trpc.conges.cloturerPeriode.useMutation({ onSuccess: invalidate });

  const conges: Conge[] = listQ.data ?? [];
  const congesEnAttente: CongeEnAttente[] = enAttenteQ.data ?? [];
  const techniciens: Technicien[] = techniciensQ.data ?? [];
  const soldes: SoldeResume[] = soldesQ.data ?? [];

  return { conges, congesEnAttente, techniciens, soldes, exercice, isLoading: listQ.isLoading, create, approuver, refuser, cloturerPeriode };
}
