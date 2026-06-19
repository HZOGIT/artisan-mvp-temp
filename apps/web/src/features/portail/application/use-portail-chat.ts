import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { PortailConversation, PortailMessage } from "../domain/portail";

/*
 * Couche APPLICATION — SLICE 5 du portail : messagerie client (conversations + thread + envoi), gated
 * par la validité de l'accès. SEULE couche important tRPC.
 * ⚠️ `skipToken` désactive la query du thread ET rend `refetch()` inerte tant qu'aucune conversation
 * n'est sélectionnée (le `refetch` du poll/onSuccess ignore le flag `enabled` et réutiliserait un
 * input `conversationId=null` → 400). Avec skipToken, aucun appel ne part avec un id null (parité legacy).
 */
export function usePortailChat(token: string, enabled: boolean, selectedConv: number | null) {
  const convsQ = trpc.clientPortal.getConversations.useQuery({ token }, { enabled: enabled && !!token });
  const messagesQ = trpc.clientPortal.getConversationMessages.useQuery(
    enabled && !!token && selectedConv ? { token, conversationId: selectedConv } : skipToken,
  );

  const refetchMessages = () => messagesQ.refetch();
  const refetchConvs = () => convsQ.refetch();

  const sendMessage = trpc.clientPortal.sendClientMessage.useMutation({
    onSuccess: () => { refetchMessages(); refetchConvs(); },
  });

  const conversations: PortailConversation[] = convsQ.data ?? [];
  const messages: PortailMessage[] = messagesQ.data ?? [];

  return { conversations, messages, sendMessage, refetchMessages, refetchConvs };
}
