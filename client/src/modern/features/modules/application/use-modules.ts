import { trpc } from "@/modern/shared/trpc";
import type { Module } from "../domain/module";

// Couche APPLICATION de la feature `modules` (clean-archi) : SEULE couche important tRPC.
// Charge la liste des modules et expose la mutation de bascule (active/désactive) avec invalidation
// (liste + getMine, qui pilote la navigation/feature-flags). L'UI attache ses effets (toast) par appel.
export function useModules() {
  const utils = trpc.useUtils();
  const listQ = trpc.modules.list.useQuery();

  const toggle = trpc.modules.toggle.useMutation({
    onSuccess: () => {
      utils.modules.list.invalidate();
      utils.modules.getMine.invalidate();
    },
  });

  const modules: Module[] = listQ.data ?? [];

  return { modules, isLoading: listQ.isLoading, toggle };
}
