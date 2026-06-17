import { trpc } from "@/modern/shared/trpc";
import type { Badge, ClassementEntry, Technicien, Periode } from "../domain/badges";

// Couche APPLICATION — gamification : liste des badges, classement des techniciens (par période),
// objectifs (techniciens), création de badge + recalcul du classement. SEULE couche important tRPC.
export function useBadges(periode: Periode) {
  const badgesQ = trpc.badges.list.useQuery();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const classementQ = trpc.badges.getClassement.useQuery({ periode });

  const create = trpc.badges.create.useMutation({ onSuccess: () => badgesQ.refetch() });
  const calculerClassement = trpc.badges.calculerClassement.useMutation({ onSuccess: () => classementQ.refetch() });

  const badges: Badge[] = badgesQ.data ?? [];
  const techniciens: Technicien[] = techniciensQ.data ?? [];
  const classement: ClassementEntry[] = classementQ.data ?? [];

  return { badges, techniciens, classement, create, calculerClassement };
}
