import { useTranslation } from "react-i18next";
import { History, MessageSquare, Plus, Loader2, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Button } from "@/modern/shared/ui/button";
import { useAssistantThreads } from "../application/use-assistant-threads";
import { relativeTime, type RelativeTime } from "../domain/assistant-conversations";

// Page `assistant-conversations` (historique MonAssistant) — migration clean-archi de
// `pages/AssistantConversations.tsx`. Navigation DIRECTE vers `/v2/assistant` (et non `/assistant`) : le
// round-trip legacy `/assistant` → redirect `/v2/assistant` PERDAIT la query `?thread=X` → on ouvrait une
// NOUVELLE conversation au lieu de celle cliquée. En ciblant `/v2/assistant` directement, `?thread=X` est conservé.
function goAssistant(query = "") {
  window.location.href = `/v2/assistant${query}`;
}

function Relative({ value }: { value: RelativeTime }) {
  const { t } = useTranslation("assistantConversations");
  switch (value.kind) {
    case "instant": return <>{t("instant")}</>;
    case "min": return <>{t("minAgo", { n: value.value })}</>;
    case "h": return <>{t("hAgo", { n: value.value })}</>;
    case "j": return <>{t("jAgo", { n: value.value })}</>;
    case "date": return <>{new Date(value.iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</>;
  }
}

export default function AssistantConversationsPage() {
  const { t } = useTranslation("assistantConversations");
  const { threads, isLoading } = useAssistantThreads();

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6 text-violet-500" />
          <h1 className="text-xl font-semibold">{t("titre")}</h1>
        </div>
        <Button onClick={() => goAssistant()} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {t("nouvelle")}
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!isLoading && threads.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
            <p className="font-medium">{t("aucune")}</p>
            <p className="text-sm mt-1">{t("demarrezEchange")}</p>
            <Button className="mt-4" onClick={() => goAssistant()}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t("demarrer")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && threads.length > 0 && (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Card
              key={thread.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => goAssistant(`?thread=${thread.id}`)}
            >
              <CardHeader className="py-3">
                <CardTitle className="flex items-center justify-between gap-3 text-base font-medium">
                  <span className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="h-4 w-4 shrink-0 text-violet-500" />
                    <span className="truncate">{thread.title || t("conversation")}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-xs font-normal text-muted-foreground">
                    <Relative value={relativeTime(thread.lastMessageAt)} />
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
