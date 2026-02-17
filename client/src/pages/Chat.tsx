import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle, Send, Archive, User, Clock, Plus, ArrowLeft,
  X, RotateCcw, Search,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";

export default function Chat() {
  const isMobile = useIsMobile();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [filter, setFilter] = useState<string>("toutes");
  const [search, setSearch] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newConvClientId, setNewConvClientId] = useState<string>("");
  const [newConvSujet, setNewConvSujet] = useState("");
  const [newConvMessage, setNewConvMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, refetch: refetchConversations } = trpc.chat.getConversations.useQuery();
  const { data: messages, refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
    { conversationId: selectedConversation! },
    { enabled: !!selectedConversation }
  );
  const { data: clients } = trpc.clients.list.useQuery();

  const sendMessageMutation = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setNewMessage("");
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const startConversationMutation = trpc.chat.startConversation.useMutation({
    onSuccess: (conv) => {
      toast.success("Conversation créée");
      setShowNewDialog(false);
      setNewConvClientId("");
      setNewConvSujet("");
      setNewConvMessage("");
      refetchConversations();
      setSelectedConversation(conv.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const archiveMutation = trpc.chat.archiveConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation archivée");
      setSelectedConversation(null);
      refetchConversations();
    },
  });

  const closeMutation = trpc.chat.closeConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation fermée");
      refetchConversations();
    },
  });

  const reopenMutation = trpc.chat.reopenConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation rouverte");
      refetchConversations();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedConversation) {
      const interval = setInterval(() => {
        refetchMessages();
        refetchConversations();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedConversation, refetchMessages, refetchConversations]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    sendMessageMutation.mutate({ conversationId: selectedConversation, contenu: newMessage.trim() });
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (days === 1) return "Hier";
    if (days < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  // Filter conversations
  const filteredConversations = (conversations || []).filter((c) => {
    if (filter === "ouvertes" && c.statut !== "ouverte") return false;
    if (filter === "fermees" && c.statut !== "fermee") return false;
    if (filter === "archivees" && c.statut !== "archivee") return false;
    if (search) {
      const q = search.toLowerCase();
      const clientName = `${c.client?.prenom || ""} ${c.client?.nom || ""}`.toLowerCase();
      return clientName.includes(q) || (c.sujet || "").toLowerCase().includes(q);
    }
    return true;
  });

  const selectedConv = conversations?.find((c) => c.id === selectedConversation);
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
                Conversations
              </CardTitle>
              <Button size="sm" onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />Nouveau
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="toutes">Toutes</SelectItem>
                  <SelectItem value="ouvertes">Ouvertes</SelectItem>
                  <SelectItem value="fermees">Fermées</SelectItem>
                  <SelectItem value="archivees">Archivées</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">Aucune conversation</div>
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
                            <span className="font-medium truncate text-sm">
                              {conv.client?.prenom ? `${conv.client.prenom} ${conv.client.nom}` : conv.client?.nom || "Client"}
                            </span>
                            {(conv.nonLuArtisan || 0) > 0 && (
                              <Badge variant="default" className="ml-2 shrink-0">{conv.nonLuArtisan}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{conv.sujet || "Conversation"}</p>
                          {conv.dernierMessage && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.dernierMessage}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {conv.dernierMessageDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />{formatDate(conv.dernierMessageDate)}
                              </span>
                            )}
                            {conv.statut === "fermee" && <Badge variant="secondary" className="text-[10px] px-1 py-0">Fermée</Badge>}
                            {conv.statut === "archivee" && <Badge variant="outline" className="text-[10px] px-1 py-0">Archivée</Badge>}
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
                      <CardTitle className="text-lg">
                        {selectedConv.client?.prenom ? `${selectedConv.client.prenom} ${selectedConv.client.nom}` : selectedConv.client?.nom || "Client"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{selectedConv.sujet || selectedConv.client?.email || ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedConv.statut === "ouverte" && (
                      <Button variant="ghost" size="sm" onClick={() => closeMutation.mutate({ conversationId: selectedConversation })} title="Fermer">
                        <X className="h-4 w-4 mr-1" />Fermer
                      </Button>
                    )}
                    {selectedConv.statut === "fermee" && (
                      <Button variant="ghost" size="sm" onClick={() => reopenMutation.mutate({ conversationId: selectedConversation })} title="Rouvrir">
                        <RotateCcw className="h-4 w-4 mr-1" />Rouvrir
                      </Button>
                    )}
                    {selectedConv.statut !== "archivee" && (
                      <Button variant="ghost" size="sm" onClick={() => archiveMutation.mutate({ conversationId: selectedConversation })} title="Archiver">
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {messages?.map((message) => (
                      <div key={message.id} className={`flex ${message.auteur === "artisan" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg p-3 ${
                          message.auteur === "artisan" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{message.contenu}</p>
                          <p className={`text-xs mt-1 ${
                            message.auteur === "artisan" ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}>
                            {formatDate(message.createdAt)}
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
                        placeholder={selectedConv.statut === "fermee" ? "Rouvrir pour envoyer..." : "Votre message..."}
                        className="flex-1"
                        disabled={selectedConv.statut === "fermee"}
                      />
                      <Button type="submit" disabled={!newMessage.trim() || sendMessageMutation.isPending || selectedConv.statut === "fermee"}>
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
                <p>Sélectionnez une conversation</p>
                <p className="text-sm mt-1">ou créez-en une nouvelle</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* New conversation dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle conversation</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={newConvClientId} onValueChange={setNewConvClientId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.nom} {c.prenom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sujet</Label>
              <Input value={newConvSujet} onChange={(e) => setNewConvSujet(e.target.value)} placeholder="Ex: Devis rénovation SDB" />
            </div>
            <div className="space-y-2">
              <Label>Premier message</Label>
              <Textarea value={newConvMessage} onChange={(e) => setNewConvMessage(e.target.value)} placeholder="Bonjour..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Annuler</Button>
            <Button
              onClick={() => {
                if (!newConvClientId) { toast.error("Sélectionnez un client"); return; }
                startConversationMutation.mutate({
                  clientId: parseInt(newConvClientId),
                  sujet: newConvSujet || undefined,
                  premierMessage: newConvMessage || undefined,
                });
              }}
              disabled={startConversationMutation.isPending}
            >
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
