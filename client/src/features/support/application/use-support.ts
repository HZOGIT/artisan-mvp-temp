import { trpc } from "@/shared/trpc";

// Couche APPLICATION de la feature `support` (clean-archi) : SEULE couche important tRPC.
// Expose la mutation d'envoi du formulaire de contact. L'UI attache ses effets (toast / reset) par appel.
export function useSupport() {
  const contact = trpc.support.contact.useMutation();
  return { contact };
}
