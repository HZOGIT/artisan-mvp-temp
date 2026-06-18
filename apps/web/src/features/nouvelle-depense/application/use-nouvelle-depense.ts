import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Categorie, Client, Doublon } from "../domain/nouvelle-depense";

export type DoublonKey = { montantTtc: number; dateDepense: string; fournisseur: string };

// Couche APPLICATION — nouvelle dépense : catégories + clients + scan IA (OCR) + détection de doublons
// (gated/debouncée côté UI) + création. SEULE couche important tRPC.
export function useNouvelleDepense(doublonKey: DoublonKey) {
  const categoriesQ = trpc.depenses.getCategories.useQuery();
  const clientsQ = trpc.clients.list.useQuery();
  const create = trpc.depenses.create.useMutation();
  const analyser = trpc.depenses.analyserJustificatif.useMutation();
  const doublonsQ = trpc.depenses.checkDoublons.useQuery(
    doublonKey.montantTtc > 0 && doublonKey.dateDepense
      ? { montantTtc: doublonKey.montantTtc, dateDepense: doublonKey.dateDepense, fournisseur: doublonKey.fournisseur || undefined }
      : skipToken,
    { staleTime: 30_000 },
  );

  const categories: Categorie[] = categoriesQ.data ?? [];
  const clients: Client[] = clientsQ.data ?? [];
  const doublons: Doublon[] = doublonsQ.data ?? [];
  return { categories, clients, doublons, create, analyser };
}
