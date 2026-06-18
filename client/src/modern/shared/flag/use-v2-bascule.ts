import { useEffect } from "react";
import { useLocation } from "@/modern/shared/router/navigation";
import { isV2Enabled } from "./v2-flag";
import { isV2Path, resolveV2Path } from "./v2-routes";

// Bascule strangler-fig (OPE-420) : montée dans le routeur legacy (wouter), cette logique sans rendu
// redirige vers `/v2/<route>` UNIQUEMENT quand (1) le flag v2 est actif (cf. `?v2=1`) ET (2) la route
// legacy courante a une version `/v2` migrée (cf. registre `V2_ROUTES`). Dans tous les autres cas —
// flag inactif (défaut), route non migrée, ou déjà sous `/v2` — elle ne fait RIEN : le legacy reste
// strictement intact. C'est le point d'entrée opt-in qui « ouvre `/v2/<route>`, sinon legacy ».
export function useV2Bascule(): void {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isV2Path(location)) return; // déjà sur le front neuf
    if (!isV2Enabled()) return; // flag inactif → legacy
    const target = resolveV2Path(location);
    if (target && target !== location) {
      setLocation(target);
    }
  }, [location, setLocation]);
}
