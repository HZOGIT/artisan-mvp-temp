import { trpc } from "@/shared/trpc";
import type { EmailLog } from "../domain/email-log";

/*
 * Couche APPLICATION de la feature `historique-emails` (clean-archi) : SEULE couche important tRPC.
 * Page de consultation (lecture seule) : expose le journal d'emails typé + l'action de rafraîchissement.
 */
export function useEmails() {
  const q = trpc.emails.list.useQuery({ limit: 200 });
  const emails: EmailLog[] = q.data ?? [];
  return { emails, isLoading: q.isLoading, isFetching: q.isFetching, refresh: () => q.refetch() };
}
