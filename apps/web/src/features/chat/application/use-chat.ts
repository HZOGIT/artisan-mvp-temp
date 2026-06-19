import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { ChatConversation, ChatMessage } from "../domain/chat";

/*
 * Couche APPLICATION — messagerie artisan ↔ client : liste des conversations, thread, envoi, création,
 * et transitions (fermer/rouvrir/archiver). SEULE couche important tRPC. Les effets (toast, reset form,
 * scroll, poll) restent en UI. `skipToken` : pas de requête `getMessages` sans conversation sélectionnée.
 */
export function useChat(selectedConv: number | null) {
  const utils = trpc.useUtils();
  const convsQ = trpc.chat.getConversations.useQuery();
  const messagesQ = trpc.chat.getMessages.useQuery(
    selectedConv ? { conversationId: selectedConv } : skipToken,
  );
  const clientsQ = trpc.clients.list.useQuery();

  const refetchConvs = () => convsQ.refetch();
  const refetchMessages = () => messagesQ.refetch();
  const invalidateConvs = () => utils.chat.getConversations.invalidate();

  const sendMessage = trpc.chat.sendMessage.useMutation({ onSuccess: () => { refetchMessages(); refetchConvs(); } });
  const startConversation = trpc.chat.startConversation.useMutation({ onSuccess: () => refetchConvs() });
  const archiveConversation = trpc.chat.archiveConversation.useMutation({ onSuccess: () => invalidateConvs() });
  const closeConversation = trpc.chat.closeConversation.useMutation({ onSuccess: () => invalidateConvs() });
  const reopenConversation = trpc.chat.reopenConversation.useMutation({ onSuccess: () => invalidateConvs() });

  const conversations: ChatConversation[] = convsQ.data ?? [];
  const messages: ChatMessage[] = messagesQ.data ?? [];
  const clients = clientsQ.data ?? [];

  return {
    conversations, messages, clients,
    refetchConvs, refetchMessages,
    sendMessage, startConversation, archiveConversation, closeConversation, reopenConversation,
  };
}
