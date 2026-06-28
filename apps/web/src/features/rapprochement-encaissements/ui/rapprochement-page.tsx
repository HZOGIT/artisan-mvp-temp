import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, Loader2, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useRapprochement } from "../application/use-rapprochement";

function eur(v: string | number) {
  return Number(v).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default function RapprochementPage() {
  const { t } = useTranslation("rapprochementEncaissements");
  const { items, isLoading, rapprocher } = useRapprochement();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">{t("chargement")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6 text-emerald-600" /> {t("titre")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("desc")}</p>
        </div>
        {items.length > 0 && (
          <Badge variant="secondary">{items.length}</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-medium">{t("aucunCredit")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("aucunCreditDesc")}</p>
            <Button asChild variant="outline" className="mt-4">
              <a href="/depenses">{t("voirDepenses")}</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(({ transaction, suggestions }) => (
            <CreditCard
              key={transaction.id}
              transaction={transaction}
              suggestions={suggestions}
              onRapprocher={(factureId) =>
                rapprocher.mutate(
                  { transactionId: transaction.id, factureId },
                  {
                    onSuccess: () => toast.success(t("toastOk")),
                    onError: (e) => toast.error(e.message || t("toastErr")),
                  },
                )
              }
              isPending={rapprocher.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SuggestionItem {
  id: number;
  numero: string | null;
  nomClient: string;
  totalTTC: string;
  dateFacture: Date | string;
  score: number;
}

interface TransactionItem {
  id: number;
  libelle: string;
  montant: string;
  dateTransaction: string;
}

function CreditCard({
  transaction,
  suggestions,
  onRapprocher,
  isPending,
}: {
  transaction: TransactionItem;
  suggestions: SuggestionItem[];
  onRapprocher: (factureId: number) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation("rapprochementEncaissements");
  const [selected, setSelected] = useState<number | null>(suggestions[0]?.id ?? null);

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium truncate">
            <Banknote className="h-4 w-4 text-emerald-600 shrink-0" />
            {transaction.libelle}
          </span>
          <span className="text-emerald-600 font-bold whitespace-nowrap text-base">
            +{eur(transaction.montant)}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {transaction.dateTransaction
            ? format(new Date(transaction.dateTransaction), "dd MMM yyyy", { locale: fr })
            : "—"}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("aucuneSuggestion")}</p>
        ) : (
          <>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("rapprochement")}</p>
            <div className="space-y-1">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className={[
                    "w-full text-left rounded-md border p-2.5 text-sm transition-colors",
                    selected === s.id
                      ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-400"
                      : "border-border hover:bg-muted/40",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium truncate">
                      <Receipt className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      {s.numero ?? `#${s.id}`}
                      <span className="text-muted-foreground font-normal truncate">— {s.nomClient}</span>
                    </span>
                    <span className="font-semibold whitespace-nowrap">{eur(s.totalTTC)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(s.dateFacture), "dd MMM yyyy", { locale: fr })}
                    </span>
                    <Badge
                      variant={s.score >= 100 ? "default" : "secondary"}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {s.score >= 100 ? t("scoreExact") : t("scoreApproche")}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={selected === null || isPending}
                onClick={() => selected !== null && onRapprocher(selected)}
                className="flex-1"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("confirmer")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
