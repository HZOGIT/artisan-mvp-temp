import { trpc } from "@/shared/trpc";

// Couche APPLICATION — création client : mutation `clients.create` + invalidation de la liste. SEULE
// couche important tRPC ; effets (toast, navigation) gérés en UI via options.
export function useCreateClient() {
  const utils = trpc.useUtils();
  return trpc.clients.create.useMutation({ onSuccess: () => utils.clients.list.invalidate() });
}
