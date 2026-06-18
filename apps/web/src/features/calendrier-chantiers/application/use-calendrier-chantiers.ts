import { useMemo } from "react";
import { trpc } from "@/shared/trpc";
import { transformInterventions, type CalendarIntervention, type Chantier, type Technicien } from "../domain/calendrier-chantiers";

// Couche APPLICATION — calendrier chantiers : interventions enrichies (jointes chantiers/techniciens) +
// couleurs sauvegardées + mutations (replanifier, réassigner, couleur). SEULE couche important tRPC.
export function useCalendrierChantiers() {
  const utils = trpc.useUtils();
  const chantiersQ = trpc.chantiers.list.useQuery();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const interventionsQ = trpc.interventions.list.useQuery();
  const liensQ = trpc.chantiers.getAllInterventionsChantier.useQuery();
  const couleursQ = trpc.interventions.getCouleursCalendrier.useQuery();

  const chantiers: Chantier[] = chantiersQ.data ?? [];
  const techniciens: Technicien[] = techniciensQ.data ?? [];

  const interventions: CalendarIntervention[] = useMemo(
    () => transformInterventions(interventionsQ.data ?? [], chantiers, techniciens, liensQ.data ?? []),
    [interventionsQ.data, chantiers, techniciens, liensQ.data],
  );

  const setCouleur = trpc.interventions.setCouleurIntervention.useMutation({ onSuccess: () => utils.interventions.getCouleursCalendrier.invalidate() });
  const update = trpc.interventions.update.useMutation({ onSuccess: () => utils.interventions.list.invalidate() });
  const assigner = trpc.interventions.assignerTechnicien.useMutation({ onSuccess: () => utils.interventions.list.invalidate() });

  return { chantiers, techniciens, interventions, savedColors: couleursQ.data, setCouleur, update, assigner };
}
