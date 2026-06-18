import { trpc } from "@/shared/trpc";
import type { Client, EncoursMap } from "../domain/client";

// Couche APPLICATION de la feature `clients` (clean-archi) : SEULE couche qui importe le client tRPC.
// Encapsule les queries/mutations (liste + encours + update/delete), gère l'invalidation, et expose des
// données TYPÉES + des actions à l'UI — qui n'a plus aucune connaissance du transport.
export function useClients() {
  const utils = trpc.useUtils();
  const list = trpc.clients.list.useQuery();
  const encours = trpc.clients.getEncoursMap.useQuery();

  const update = trpc.clients.update.useMutation({
    onSuccess: () => utils.clients.list.invalidate(),
  });
  const remove = trpc.clients.delete.useMutation({
    onSuccess: () => utils.clients.list.invalidate(),
  });

  const clients: Client[] = list.data ?? [];
  const encoursMap: EncoursMap = encours.data ?? ({} as EncoursMap);

  return { clients, encoursMap, isLoading: list.isLoading, update, remove };
}
