import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Transaction, Categorie } from "../domain/import-releve";

// Couche APPLICATION — import relevé bancaire : catégories + transactions du relevé (gated) + import +
// conversion/ignorer. SEULE couche important tRPC ; effets (toast, état importDone) en UI via options.
export function useImportReleve(releveId: number | null) {
  const categoriesQ = trpc.depenses.getCategories.useQuery();
  const transactionsQ = trpc.depenses.getTransactionsBancaires.useQuery(releveId ? { releveId } : skipToken);
  const refetch = () => transactionsQ.refetch();

  const importReleve = trpc.depenses.importReleve.useMutation();
  const convertir = trpc.depenses.convertirTransaction.useMutation({ onSuccess: () => refetch() });
  const ignorer = trpc.depenses.ignorerTransaction.useMutation({ onSuccess: () => refetch() });

  const categories: Categorie[] = categoriesQ.data ?? [];
  const transactions: Transaction[] | undefined = transactionsQ.data;

  return { categories, transactions, importReleve, convertir, ignorer };
}
