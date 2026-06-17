import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/modern/shared/trpc";
import { enrichBadgesTechnicien, type Technicien, type ClassementEntry, type Objectif, type Periode } from "../domain/classement";

// Couche APPLICATION — classement gamifié : techniciens + classement par période + recalcul.
// SEULE couche important tRPC.
export function useClassement(periode: Periode) {
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const classementQ = trpc.badges.getClassement.useQuery({ periode });
  const calculerClassement = trpc.badges.calculerClassement.useMutation({ onSuccess: () => classementQ.refetch() });

  const techniciens: Technicien[] = techniciensQ.data ?? [];
  const classement: ClassementEntry[] = classementQ.data ?? [];

  return { techniciens, classement, isLoading: classementQ.isLoading, calculerClassement };
}

// Détail d'un technicien (badges obtenus enrichis + objectifs de l'année), gated par sélection (`skipToken`).
// `badges.list` fournit le nom/couleur/points (jointure domain, le new-stack ne renvoie que le lien brut).
export function useTechnicienDetail(technicienId: number | null) {
  const badgesQ = trpc.badges.getBadgesTechnicien.useQuery(
    technicienId ? { technicienId } : skipToken,
  );
  const objectifsQ = trpc.badges.getObjectifsTechnicien.useQuery(
    technicienId ? { technicienId, annee: new Date().getFullYear() } : skipToken,
  );
  const allBadgesQ = trpc.badges.list.useQuery();

  const badgesObtenus = enrichBadgesTechnicien(badgesQ.data ?? [], allBadgesQ.data ?? []);
  const objectifs: Objectif[] = objectifsQ.data ?? [];

  return { badgesObtenus, objectifs };
}
