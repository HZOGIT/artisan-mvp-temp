import { trpc } from "@/shared/trpc";

/*
 * Couche APPLICATION — import clients : mutation `clients.importFromExcel`. SEULE couche important tRPC ;
 * effets (toast, reset du formulaire) gérés en UI via options.
 */
export function useImportClients() {
  return trpc.clients.importFromExcel.useMutation();
}
