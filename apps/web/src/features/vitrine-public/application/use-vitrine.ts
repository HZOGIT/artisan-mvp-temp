import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { VitrineData } from "../domain/vitrine";

/*
 * Couche APPLICATION — vitrine publique : payload agrégé (getBySlug, typé `unknown` backend → casté) +
 * soumission du formulaire de contact. SEULE couche important tRPC ; effets en UI via options.
 */
export function useVitrine(slug: string) {
  const q = trpc.vitrine.getBySlug.useQuery(slug ? { slug } : skipToken, { retry: false });
  return {
    data: q.data as VitrineData | undefined,
    isLoading: q.isLoading, error: q.error,
    submitContact: trpc.vitrine.submitContact.useMutation(),
  };
}
