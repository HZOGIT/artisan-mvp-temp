import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MessageCircle, Send, Archive, Clock, Plus, ArrowLeft, X, RotateCcw, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useChat } from "../application/use-chat";
import { CHAT_FILTERS, filterConversations, clientLabel, formatChatDate, type ChatFilter } from "../domain/chat";

/*
 * Page `chat` (messagerie artisan ↔ client) — migration clean-archi de `pages/Chat.tsx`. Markup/classes
 * Tailwind conservés à l'identique (parité visuelle). tRPC encapsulé dans `use-chat`, règles pures en domain.
 */
export default function ChatPage() {
  const { t } = useTranslation("chat");
  const isMobile = useIsMobile();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("toutes");
  const [search, setSearch] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newConvClientId, setNewConvClientId] = useState("");
  const [newConvSujet, setNewConvSujet] = useState("");
  const [newConvMessage, setNewConvMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { conversations, messages, clients, refetchConvs, refetchMessages, sendMessage, startConversation, archiveConversation, closeConversation, reopenConversation } = useChat(selectedConversation);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (!selectedConversation) return;
    const id = setInterval(() => { refetchMessages(); refetchConvs(); }, 10000);
    return () => clearInterval(id);
  }, [selectedConversation, refetchMessages, refetchConvs]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    sendMessage.mutate({ conversationId: selectedConversation, contenu: newMessage.trim() }, {
      onSuccess: () => setNewMessage(""),
      onError: (e) => toast.error(e.message),
    });
  };

  const filteredConversations = filterConversations(conversations, filter, search);
  const selectedConv = conversations.find((c) => c.id === selectedConversation);
  const showList = !isMobile || !selectedConversation;
  const showChat = !isMobile || !!selectedConversation;

  return (
    <div className="h-[calc(100vh-120px)] flex gap-4">
      {/* Conversation list */}
      {showList && (
        <Card className={`${isMobile ? "flex-1" : "w-80"} flex flex-col`}>
          <CardHeader className="pb-2 space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5" />
                {t("conversations")}
              </CardTitle>
              <Button size="sm" onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />{t("nouveau")}
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder={t("rechercher")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as ChatFilter)}>
                <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHAT_FILTERS.map((f) => (
                    <SelectItem key={f} value={f}>{t(`filtre.${f}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">{t("aucuneConversation")}</div>
              ) : (
                <div className="space-y-1 p-2">
                  {filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv.id)}
                      className={`w-full p-3 rounded-lg text-left transition-colors ${
                        selectedConversation === conv.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback>{conv.client?.nom?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate text-sm">{clientLabel(conv.client)}</span>
                            {(conv.nonLuArtisan || 0) > 0 && (
                              <Badge variant="default" className="ml-2 shrink-0">{conv.nonLuArtisan}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{conv.sujet || t("conversation")}</p>
                          {conv.dernierMessage && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.dernierMessage}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {conv.dernierMessageDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />{formatChatDate(conv.dernierMessageDate)}
                              </span>
                            )}
                            {conv.statut === "fermee" && <Badge variant="secondary" className="text-[10px] px-1 py-0">{t("statutFermee")}</Badge>}
                            {conv.statut === "archivee" && <Badge variant="outline" className="text-[10px] px-1 py-0">{t("statutArchivee")}</Badge>}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Chat area */}
      {showChat && (
        <Card className="flex-1 flex flex-col">
          {selectedConversation && selectedConv ? (
            <>
              <CardHeader className="pb-2 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isMobile && (
                      <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)}>
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
                    <Avatar><AvatarFallback>{selectedConv.client?.nom?.charAt(0) || "?"}</AvatarFallback></Avatar>
                    <div>
                      <CardTitle className="text-lg">{clientLabel(selectedConv.client)}</CardTitle>
                      <p className="text-sm text-muted-foreground">{selectedConv.sujet || selectedConv.client?.email || ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedConv.statut === "ouverte" && (
                      <Button variant="ghost" size="sm" onClick={() => closeConversation.mutate({ conversationId: selectedConversation }, { onSuccess: () => toast.success(t("toastFermee")) })} title={t("fermer")}>
                        <X className="h-4 w-4 mr-1" />{t("fermer")}
                      </Button>
                    )}
                    {selectedConv.statut === "fermee" && (
                      <Button variant="ghost" size="sm" onClick={() => reopenConversation.mutate({ conversationId: selectedConversation }, { onSuccess: () => toast.success(t("toastRouverte")) })} title={t("rouvrir")}>
                        <RotateCcw className="h-4 w-4 mr-1" />{t("rouvrir")}
                      </Button>
                    )}
                    {selectedConv.statut !== "archivee" && (
                      <Button variant="ghost" size="sm" onClick={() => archiveConversation.mutate({ conversationId: selectedConversation }, { onSuccess: () => { toast.success(t("toastArchivee")); setSelectedConversation(null); } })} title={t("archiver")}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.auteur === "artisan" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg p-3 ${
                          message.auteur === "artisan" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{message.contenu}</p>
                          <p className={`text-xs mt-1 ${
                            message.auteur === "artisan" ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}>
                            {formatChatDate(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                {selectedConv.statut !== "archivee" && (
                  <div className="p-3 border-t">
                    <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={selectedConv.statut === "fermee" ? t("rouvrirPourEnvoyer") : t("votreMessage")}
                        className="flex-1"
                        disabled={selectedConv.statut === "fermee"}
                      />
                      <Button type="submit" disabled={!newMessage.trim() || sendMessage.isPending || selectedConv.statut === "fermee"}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>{t("selectionnez")}</p>
                <p className="text-sm mt-1">{t("ouCreez")}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* New conversation dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("nouvelleConversation")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{t("clientRequis")}</Label>
              <Select value={newConvClientId} onValueChange={setNewConvClientId}>
                <SelectTrigger><SelectValue placeholder={t("selectionnerClient")} /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.nom} {c.prenom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("sujet")}</Label>
              <Input value={newConvSujet} onChange={(e) => setNewConvSujet(e.target.value)} placeholder={t("sujetPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("premierMessage")}</Label>
              <Textarea value={newConvMessage} onChange={(e) => setNewConvMessage(e.target.value)} placeholder={t("premierMessagePlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>{t("annuler")}</Button>
            <Button
              onClick={() => {
                if (!newConvClientId) { toast.error(t("errSelectClient")); return; }
                startConversation.mutate(
                  { clientId: parseInt(newConvClientId), sujet: newConvSujet || undefined, premierMessage: newConvMessage || undefined },
                  {
                    onSuccess: (conv) => {
                      toast.success(t("toastCreee"));
                      setShowNewDialog(false);
                      setNewConvClientId(""); setNewConvSujet(""); setNewConvMessage("");
                      setSelectedConversation(conv.id);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
              disabled={startConversation.isPending}
            >
              {t("creer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
