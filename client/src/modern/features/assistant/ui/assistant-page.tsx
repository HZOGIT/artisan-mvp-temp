import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Streamdown } from "streamdown";
import { Sparkles, Send, FileText, RefreshCw, Calculator, TrendingUp, Calendar, Loader2, User, Bot, Mic, MicOff, Phone, PhoneOff, Radio, Plus, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Textarea } from "@/modern/shared/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/modern/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/modern/shared/ui/select";
import { Label } from "@/modern/shared/ui/label";
import { useVoiceSession } from "@/modern/shared/voice/use-voice-session";
import { useIsMobile } from "@/modern/shared/hooks/useMobile";
import { useSpeechRecognition } from "@/modern/shared/hooks/useSpeechRecognition";
import { useAssistant, streamMessage, type DevisLigne, type Relances } from "../application/use-assistant";
import { sliceHistory, navigateTarget, buildDevisMarkdown, buildRelancesMarkdown, type Message } from "../domain/assistant";

const THREAD_LS_KEY = "operioz.assistant.thread";

// Page `assistant` — migration clean-archi de `pages/Assistant.tsx`. Markup à l'identique. Flux SSE +
// parsing/markdown en domain/application ; voix & dictée via les hooks partagés (useVoiceSession/Speech).
export default function AssistantPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation("assistant");
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const compact = embedded || isMobile;

  const initialThreadId = (() => {
    if (typeof window === "undefined") return undefined;
    const raw = new URLSearchParams(window.location.search).get("thread");
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) return n;
    if (embedded) { const saved = parseInt(window.localStorage.getItem(THREAD_LS_KEY) || "", 10); if (Number.isFinite(saved)) return saved; }
    return undefined;
  })();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState<number | undefined>(initialThreadId);
  const [activeTools, setActiveTools] = useState<{ name: string; ok?: boolean }[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedThreadRef = useRef(false);
  const liveUserRef = useRef(false);
  const liveAsstRef = useRef(false);

  const [showDevisDialog, setShowDevisDialog] = useState(false);
  const [devisDescription, setDevisDescription] = useState("");
  const [showRentabiliteDialog, setShowRentabiliteDialog] = useState(false);
  const [selectedDevisId, setSelectedDevisId] = useState("");

  const { threadQuery, generateDevis, suggestRelances, rentabilite, tresorerie, devisList } = useAssistant(initialThreadId, selectedDevisId);

  useEffect(() => { if (threadId) { try { window.localStorage.setItem(THREAD_LS_KEY, String(threadId)); } catch { /* ignore */ } } }, [threadId]);

  useEffect(() => {
    if (loadedThreadRef.current || !threadQuery.data) return;
    loadedThreadRef.current = true;
    setMessages(threadQuery.data.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.transcript ?? "" })));
  }, [threadQuery.data]);

  const voice = useVoiceSession({
    threadId,
    onThreadId: useCallback((id: number) => setThreadId((prev) => prev ?? id), []),
    onUserTranscript: useCallback((text: string) => {
      if (!text.trim()) return;
      const startNew = !liveUserRef.current;
      liveUserRef.current = true; liveAsstRef.current = false;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (startNew || !last || last.role !== "user") return [...prev, { role: "user", content: text }];
        const copy = [...prev]; copy[copy.length - 1] = { role: "user", content: text }; return copy;
      });
    }, []),
    onAssistantDelta: useCallback((delta: string) => {
      if (!delta) return;
      const startNew = !liveAsstRef.current;
      liveAsstRef.current = true; liveUserRef.current = false;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (startNew || !last || last.role !== "assistant") return [...prev, { role: "assistant", content: delta }];
        const copy = [...prev]; copy[copy.length - 1] = { role: "assistant", content: last.content + delta }; return copy;
      });
    }, []),
    onTurnComplete: useCallback(() => { liveUserRef.current = false; liveAsstRef.current = false; }, []),
  });

  const speech = useSpeechRecognition();
  const userEditedRef = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const scrollToBottom = useCallback(() => { const el = scrollContainerRef.current; if (el) el.scrollTop = el.scrollHeight; }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (speech.isListening) { userEditedRef.current = false; setInput(speech.transcript); } }, [speech.isListening, speech.transcript]);
  useEffect(() => { if (speech.error) toast.error(speech.error); }, [speech.error]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setMessages((prev) => [...prev, { role: "user", content: text.trim() }, { role: "assistant", content: "" }]);
    setActiveTools([]);
    setInput(""); setIsStreaming(true);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const history = sliceHistory(messages);
      await streamMessage({ message: text.trim(), history, threadId }, (ev) => {
        if (ev.threadId && !threadId) setThreadId(ev.threadId);
        if (ev.content) setMessages((prev) => { const u = [...prev]; const last = u[u.length - 1]; if (last.role === "assistant") u[u.length - 1] = { ...last, content: last.content + ev.content }; return u; });
        if (ev.error) toast.error(ev.error);
        if (ev.navigate) { window.location.href = navigateTarget(ev.navigate, ev.filtre); try { window.dispatchEvent(new CustomEvent("operioz:open-assistant")); } catch { /* ignore */ } }
        if (ev.invalidate) for (const key of ev.invalidate) queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.some((k) => typeof k === "string" && k.includes(key)) });
        if (ev.toolStart) setActiveTools((prev) => [...prev, { name: ev.toolStart!.name }]);
        if (ev.toolEnd) setActiveTools((prev) => prev.map((t) => t.name === ev.toolEnd!.name && t.ok === undefined ? { ...t, ok: ev.toolEnd!.ok } : t));
      }, controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : t("errConnexion"));
      setMessages((prev) => { const u = [...prev]; if (u.length > 0 && u[u.length - 1].role === "assistant" && !u[u.length - 1].content) u.pop(); return u; });
    } finally { setIsStreaming(false); abortRef.current = null; }
  }, [isStreaming, messages, threadId, queryClient, t]);

  // Compte à rebours d'envoi auto après dictée
  useEffect(() => {
    if (!speech.isListening && speech.finalTranscript && !userEditedRef.current && countdown === null) { setInput(speech.finalTranscript); setCountdown(3); }
  }, [speech.isListening, speech.finalTranscript, countdown]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const text = speech.finalTranscript.trim();
      if (text && !userEditedRef.current) { sendMessage(text); setInput(""); speech.resetTranscript(); }
      setCountdown(null); return;
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, speech, sendMessage]);

  const cancelAutoSend = () => { setCountdown(null); speech.resetTranscript(); setInput(""); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleVoiceToggle = async () => { if (voice.isVoiceActive) { await voice.stopVoice(); } else { liveUserRef.current = false; liveAsstRef.current = false; await voice.startVoice(); } };
  const handleMicClick = () => {
    if (countdown !== null) { setCountdown(null); speech.resetTranscript(); setInput(""); speech.startListening(); return; }
    if (!speech.isSupported) { toast.info(t("dicteeIndispo")); return; }
    if (speech.isListening) speech.stopListening(); else speech.startListening();
  };

  const handleGenerateDevis = async () => {
    if (!devisDescription.trim()) return;
    setShowDevisDialog(false);
    const desc = devisDescription; setDevisDescription("");
    try {
      const result = await generateDevis.mutateAsync({ description: desc });
      const lignes = (result.lignes ?? []) as DevisLigne[];
      setMessages((prev) => [...prev, { role: "assistant", content: buildDevisMarkdown(desc, lignes) }]);
    } catch (error) { toast.error(error instanceof Error ? error.message : t("errGenerationDevis")); }
  };
  const handleSuggestRelances = async () => {
    try { const r = await suggestRelances.refetch(); if (r.data !== undefined) setMessages((prev) => [...prev, { role: "assistant", content: buildRelancesMarkdown(r.data as Relances) }]); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("erreur")); }
  };
  const handleAnalyseRentabilite = async () => {
    if (!selectedDevisId) return;
    setShowRentabiliteDialog(false);
    try { const r = await rentabilite.refetch(); if (r.data) setMessages((prev) => [...prev, { role: "assistant", content: r.data.analyse }]); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("erreur")); }
  };
  const handlePredictionTresorerie = async () => {
    try { const r = await tresorerie.refetch(); if (r.data) setMessages((prev) => [...prev, { role: "assistant", content: r.data.prediction }]); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("erreur")); }
  };
  const handleResumeDuJour = () => sendMessage(t("resumeDuJourPrompt"));

  const newThread = useCallback(() => {
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    setIsStreaming(false); setMessages([]); setThreadId(undefined); setInput("");
    try { window.localStorage.removeItem(THREAD_LS_KEY); } catch { /* ignore */ }
  }, []);

  const quickActions = [
    { icon: FileText, label: t("genererDevis"), color: "text-blue-500", onClick: () => setShowDevisDialog(true) },
    { icon: RefreshCw, label: t("suggestionsRelance"), color: "text-orange-500", onClick: handleSuggestRelances },
    { icon: Calculator, label: t("analyseRentabilite"), color: "text-green-500", onClick: () => setShowRentabiliteDialog(true) },
    { icon: TrendingUp, label: t("predictionTresorerie"), color: "text-purple-500", onClick: handlePredictionTresorerie },
    { icon: Calendar, label: t("resumeDuJour"), color: "text-amber-500", onClick: handleResumeDuJour },
  ];

  return (
    <div className={`${embedded ? "h-full" : "h-[calc(100dvh-190px)] md:h-[calc(100dvh-120px)]"} flex gap-4 overflow-hidden`}>
      <Card className={`${compact ? "flex-1" : "flex-[7]"} flex flex-col overflow-hidden`}>
        <CardHeader className="pb-2 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-amber-500" />{t("monAssistant")}</CardTitle>
            <Button variant="outline" size="sm" onClick={newThread} title={t("nouvelleConversation")} aria-label={t("nouvelleConversation")} className="gap-1.5 h-8">
              <Plus className="h-4 w-4" /><span className="hidden sm:inline text-xs">{t("nouveau")}</span>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("sousTitre")}</p>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden min-h-0">
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">{t("bonjour")}</p>
                  <p className="text-sm mt-1">{t("accueil")}</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (<div className="shrink-0 h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Bot className="h-4 w-4 text-amber-600 dark:text-amber-400" /></div>)}
                  <div className={`max-w-[75%] rounded-lg p-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {msg.role === "assistant" && isStreaming && i === messages.length - 1 && activeTools.length > 0 && (
                      <div className="mb-2 flex flex-col gap-1">
                        {activeTools.map((tool, ti) => (
                          <span key={ti} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {tool.ok === undefined ? (
                              <><Loader2 className="h-3 w-3 animate-spin text-amber-500" /><span className="font-mono">{tool.name}</span></>
                            ) : tool.ok ? (
                              <><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="font-mono">{tool.name}</span></>
                            ) : (
                              <><XCircle className="h-3 w-3 text-red-500" /><span className="font-mono">{tool.name}</span></>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.role === "assistant" ? (<div className="text-sm prose-sm"><Streamdown>{msg.content || ""}</Streamdown></div>) : (<p className="text-sm whitespace-pre-wrap">{msg.content}</p>)}
                    {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (<span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />)}
                  </div>
                  {msg.role === "user" && (<div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-4 w-4 text-primary" /></div>)}
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 border-t">
            <form onSubmit={handleSubmit} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => { userEditedRef.current = true; if (countdown !== null) setCountdown(null); setInput(e.target.value); }}
                  placeholder={voice.isVoiceActive ? t("placeholderVocalActif") : speech.isListening ? t("placeholderEcoute") : t("placeholderDefaut")}
                  className={`flex-1 min-h-[44px] max-h-[120px] resize-none ${speech.isListening || voice.isVoiceActive ? "italic text-muted-foreground" : ""}`}
                  rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
                  disabled={isStreaming || voice.isVoiceActive}
                />
                {!voice.isVoiceActive && (
                  <div className="relative self-end">
                    {speech.isListening && (<span aria-hidden className="absolute inset-0 rounded-md bg-red-500/40 animate-ping" />)}
                    <Button type="button" variant={speech.isListening ? "destructive" : "outline"} onClick={handleMicClick} disabled={!speech.isSupported || isStreaming} className="relative" aria-label={speech.isListening ? t("arreterDictee") : t("dicteeVocale")} title={!speech.isSupported ? t("dicteeIndispoTitre") : speech.isListening ? t("arreterDictee") : t("dicteeVocale")}>
                      {speech.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
                {voice.isVoiceActive && (
                  <Button type="button" variant={voice.isMuted ? "default" : "outline"} onClick={voice.toggleMute} className={`self-end ${voice.isMuted ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`} aria-label={voice.isMuted ? t("reactiverMicro") : t("couperMicro")} title={voice.isMuted ? t("microCoupe") : t("couperMicroGemini")}>
                    {voice.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                <div className="relative self-end">
                  {voice.isVoiceActive && (<span aria-hidden className="absolute inset-0 rounded-md bg-emerald-500/40 animate-ping" />)}
                  <Button type="button" variant={voice.isVoiceActive ? "default" : "outline"} onClick={handleVoiceToggle} disabled={isStreaming} className={`relative ${voice.isVoiceActive ? "bg-emerald-600 hover:bg-emerald-700" : ""}`} aria-label={voice.isVoiceActive ? t("couperModeVocal") : t("modeVocal")} title={voice.isVoiceActive ? t("couperModeVocal") : t("modeVocalTitre")}>
                    {voice.isVoiceActive ? <PhoneOff className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  </Button>
                </div>
                <Button type="submit" disabled={!input.trim() || isStreaming || voice.isVoiceActive} className="self-end">
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {voice.isVoiceActive && (
                <div className="flex items-center gap-1.5 px-1">
                  <Radio className={`h-3 w-3 ${voice.isMuted ? "text-amber-500" : "text-emerald-500"} animate-pulse`} />
                  <p className={`text-[11px] font-medium ${voice.isMuted ? "text-amber-600" : "text-emerald-600"}`}>
                    {voice.isMuted && t("microCoupeSilence")}
                    {!voice.isMuted && voice.voiceState === "connecting" && t("connexionEnCours")}
                    {!voice.isMuted && voice.voiceState === "listening" && t("ecouteParlez")}
                    {!voice.isMuted && voice.voiceState === "speaking" && t("geminiRepond")}
                    {!voice.isMuted && voice.voiceState === "error" && `${t("erreurVocale")}${voice.error ? ": " + voice.error : ""}`}
                  </p>
                </div>
              )}
              {voice.error && !voice.isVoiceActive && (<p className="text-[11px] text-red-500 px-1">{voice.error}</p>)}
              {speech.isListening && !voice.isVoiceActive && (<p className="text-[11px] text-red-500 font-medium px-1">{t("ecouteAutoStop")}</p>)}
              {countdown !== null && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[11px] text-blue-600 font-medium">{t("envoiDans", { n: countdown })}</p>
                  <button type="button" onClick={cancelAutoSend} className="text-[11px] text-red-500 hover:text-red-700 underline">{t("annulerEnvoi")}</button>
                </div>
              )}
            </form>
          </div>
        </CardContent>
      </Card>

      {!compact && (
        <div className="flex-[3] flex flex-col gap-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider px-1">{t("actionsRapides")}</h3>
          {quickActions.map((action) => (
            <Card key={action.label} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={action.onClick}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${action.color}`}><action.icon className="h-5 w-5" /></div>
                <span className="font-medium text-sm">{action.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDevisDialog} onOpenChange={setShowDevisDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("genererDevisIa")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("descriptionTravaux")}</Label>
              <Textarea value={devisDescription} onChange={(e) => setDevisDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDevisDialog(false)}>{t("annuler")}</Button>
            <Button onClick={handleGenerateDevis} disabled={!devisDescription.trim() || generateDevis.isPending}>
              {generateDevis.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("generation")}</> : t("generer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRentabiliteDialog} onOpenChange={setShowRentabiliteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("analyseRentabiliteTitre")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("selectionnerDevis")}</Label>
              <Select value={selectedDevisId} onValueChange={setSelectedDevisId}>
                <SelectTrigger><SelectValue placeholder={t("choisirDevis")} /></SelectTrigger>
                <SelectContent>
                  {devisList.map((d) => (<SelectItem key={d.id} value={d.id.toString()}>{t("devisOption", { numero: d.numero, objet: d.objet || t("sansObjet"), montant: parseFloat(String(d.totalTTC ?? 0)).toFixed(2) })}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRentabiliteDialog(false)}>{t("annuler")}</Button>
            <Button onClick={handleAnalyseRentabilite} disabled={!selectedDevisId}>{t("analyser")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
