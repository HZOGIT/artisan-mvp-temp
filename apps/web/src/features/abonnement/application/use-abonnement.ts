import { trpc } from "@/shared/trpc";
import type { Device } from "../domain/abonnement";

export function useAbonnement() {
  const utils = trpc.useUtils();
  const devicesQ = trpc.devices.list.useQuery();
  const invalidateDevices = () => utils.devices.list.invalidate();
  const revoke = trpc.devices.revoke.useMutation({ onSuccess: invalidateDevices });
  const revokeAll = trpc.devices.revokeAll.useMutation({ onSuccess: invalidateDevices });
  const devices: Device[] = devicesQ.data ?? [];
  return { devices, isLoading: devicesQ.isLoading, revoke, revokeAll };
}
