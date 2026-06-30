import { trpc } from "@/shared/trpc";

/** Hook application pour le statut Stripe Connect et l'onboarding. */
export function useConnect() {
  const connectStatus = trpc.connect.status.useQuery();
  const startOnboarding = trpc.connect.startOnboarding.useMutation();
  return { connectStatus, startOnboarding };
}
