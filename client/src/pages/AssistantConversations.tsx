import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, MessageSquare, Plus, Loader2, ChevronRight } from "lucide-react";

type AiThread = {
  id: number;
  title: string;
  mode: string | null;
  lastMessageAt: string | Date;
  createdAt: string | Date;
};

function formatRelative(date: string | Date): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function AssistantConversations() {
  const [, setLocation] = useLocation();
  const { data: threads, isLoading } = trpc.assistant.getThreads.useQuery();

  const openThread = (id: number) => setLocation(`/assistant?thread=${id}`);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6 text-violet-500" />
          <h1 className="text-xl font-semibold">Mes conversations</h1>
        </div>
        <Button onClick={() => setLocation("/assistant")} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle conversation
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!isLoading && (!threads || threads.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
            <p className="font-medium">Aucune conversation pour le moment</p>
            <p className="text-sm mt-1">Démarrez un échange avec MonAssistant.</p>
            <Button className="mt-4" onClick={() => setLocation("/assistant")}>
              <Plus className="h-4 w-4 mr-1.5" />
              Démarrer
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && threads && threads.length > 0 && (
        <div className="space-y-2">
          {(threads as AiThread[]).map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => openThread(t.id)}
            >
              <CardHeader className="py-3">
                <CardTitle className="flex items-center justify-between gap-3 text-base font-medium">
                  <span className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="h-4 w-4 shrink-0 text-violet-500" />
                    <span className="truncate">{t.title || "Conversation"}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-xs font-normal text-muted-foreground">
                    {formatRelative(t.lastMessageAt)}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
