import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Sparkles, Send, FileText, RefreshCw, Calculator, TrendingUp, Calendar,
  Loader2, User, Bot,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Assistant() {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Quick action states
  const [showDevisDialog, setShowDevisDialog] = useState(false);
  const [devisDescription, setDevisDescription] = useState("");
  const [showRentabiliteDialog, setShowRentabiliteDialog] = useState(false);
  const [selectedDevisId, setSelectedDevisId] = useState<string>("");

  // tRPC mutations for quick actions
  const generateDevisMutation = trpc.assistant.generateDevis.useMutation();
  const suggestRelancesQuery = trpc.assistant.suggestRelances.useQuery(undefined, { enabled: false });
  const rentabiliteQuery = trpc.assistant.analyseRentabilite.useQuery(
    { devisId: parseInt(selectedDevisId) || 0 },
    { enabled: false }
  );
  const tresorerieQuery = trpc.assistant.predictionTresorerie.useQuery(undefined, { enabled: false });

  // Devis list for rentabilite dialog
  const { data: devisList } = trpc.devis.list.useQuery();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text.trim(), history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(err.error || "Erreur serveur");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Pas de stream disponible");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.content };
                }
                return updated;
              });
            }
            if (parsed.error) {
              toast.error(parsed.error);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") return;
      toast.error(error.message || "Erreur de connexion");
      setMessages((prev) => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === "assistant" && !updated[updated.length - 1].content) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Quick actions
  const handleGenerateDevis = async () => {
    if (!devisDescription.trim()) return;
    setShowDevisDialog(false);
    const desc = devisDescription;
    setDevisDescription("");
    try {
      const result = await generateDevisMutation.mutateAsync({ description: desc });
      const lignes = result.lignes as Array<{ designation: string; quantite: number; unite: string; prixUnitaireHT: number; tauxTVA: number }>;
      let content = `**Devis suggere pour : ${desc}**\n\n`;
      content += `| Designation | Qte | Unite | Prix HT | TVA |\n|---|---|---|---|---|\n`;
      for (const l of lignes) {
        content += `| ${l.designation} | ${l.quantite} | ${l.unite} | ${l.prixUnitaireHT.toFixed(2)} | ${l.tauxTVA}% |\n`;
      }
      const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHT, 0);
      content += `\n**Total HT : ${total.toFixed(2)} EUR**`;
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la generation du devis");
    }
  };

  const handleSuggestRelances = async () => {
    try {
      const result = await suggestRelancesQuery.refetch();
      if (result.data) {
        const relances = result.data as any;
        let content = "**Suggestions de relance**\n\n";
        if (Array.isArray(relances)) {
          if (relances.length === 0) {
            content += "Aucun devis en attente de relance.";
          } else {
            for (const r of relances) {
              content += `**${r.numero}** - ${r.objet || "Sans objet"}\n`;
              if (r.email) {
                content += `*Sujet :* ${r.email.sujet}\n`;
                content += `${r.email.corps}\n\n---\n\n`;
              }
            }
          }
        } else if (typeof relances === "object" && relances.suggestions) {
          content = relances.suggestions;
        } else if (typeof relances === "string") {
          content = relances;
        }
        setMessages((prev) => [...prev, { role: "assistant", content }]);
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur");
    }
  };

  const handleAnalyseRentabilite = async () => {
    if (!selectedDevisId) return;
    setShowRentabiliteDialog(false);
    try {
      const result = await rentabiliteQuery.refetch();
      if (result.data) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.data.analyse }]);
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur");
    }
  };

  const handlePredictionTresorerie = async () => {
    try {
      const result = await tresorerieQuery.refetch();
      if (result.data) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.data.prediction }]);
      }
    } catch (error: any) {
      toast.error(error.message || "Erreur");
    }
  };

  const handleResumeDuJour = () => {
    sendMessage("Fais-moi un resume de ma journee : interventions prevues, devis en attente, factures impayees, et les actions prioritaires.");
  };

  const quickActions = [
    { icon: FileText, label: "Generer un devis", color: "text-blue-500", onClick: () => setShowDevisDialog(true) },
    { icon: RefreshCw, label: "Suggestions relance", color: "text-orange-500", onClick: handleSuggestRelances },
    { icon: Calculator, label: "Analyse rentabilite", color: "text-green-500", onClick: () => setShowRentabiliteDialog(true) },
    { icon: TrendingUp, label: "Prediction tresorerie", color: "text-purple-500", onClick: handlePredictionTresorerie },
    { icon: Calendar, label: "Resume du jour", color: "text-amber-500", onClick: handleResumeDuJour },
  ];

  // Simple markdown-like rendering
  const renderContent = (content: string | undefined | null) => {
    if (!content) return "";
    return (content || "")
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="h-[calc(100vh-120px)] flex gap-4">
      {/* Chat zone - 70% */}
      <Card className={`${isMobile ? "flex-1" : "flex-[7]"} flex flex-col`}>
        <CardHeader className="pb-2 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-500" />
            MonAssistant
          </CardTitle>
          <p className="text-sm text-muted-foreground">Assistant IA pour votre gestion quotidienne</p>
        </CardHeader>

        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">Bonjour !</p>
                  <p className="text-sm mt-1">Posez-moi une question ou utilisez les actions rapides.</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="shrink-0 h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div
                        className="text-sm prose-sm"
                        dangerouslySetInnerHTML={{ __html: renderContent(msg.content || "") }}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (
                      <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-3 border-t">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez votre question..."
                className="flex-1 min-h-[44px] max-h-[120px] resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                disabled={isStreaming}
              />
              <Button type="submit" disabled={!input.trim() || isStreaming} className="self-end">
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions - 30% */}
      {!isMobile && (
        <div className="flex-[3] flex flex-col gap-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider px-1">
            Actions rapides
          </h3>
          {quickActions.map((action) => (
            <Card
              key={action.label}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={action.onClick}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="font-medium text-sm">{action.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generate devis dialog */}
      <Dialog open={showDevisDialog} onOpenChange={setShowDevisDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generer un devis avec l'IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description des travaux</Label>
              <Textarea
                value={devisDescription}
                onChange={(e) => setDevisDescription(e.target.value)}
                placeholder="Ex: Renovation complete d'une salle de bain de 8m2, remplacement baignoire par douche italienne..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDevisDialog(false)}>Annuler</Button>
            <Button
              onClick={handleGenerateDevis}
              disabled={!devisDescription.trim() || generateDevisMutation.isPending}
            >
              {generateDevisMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generation...</>
              ) : (
                "Generer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analyse rentabilite dialog */}
      <Dialog open={showRentabiliteDialog} onOpenChange={setShowRentabiliteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analyse de rentabilite</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Selectionner un devis</Label>
              <Select value={selectedDevisId} onValueChange={setSelectedDevisId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un devis..." />
                </SelectTrigger>
                <SelectContent>
                  {(devisList || []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      {d.numero} - {d.objet || "Sans objet"} ({parseFloat(d.totalTTC || d.montantTTC || 0).toFixed(2)} EUR)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRentabiliteDialog(false)}>Annuler</Button>
            <Button onClick={handleAnalyseRentabilite} disabled={!selectedDevisId}>
              Analyser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
