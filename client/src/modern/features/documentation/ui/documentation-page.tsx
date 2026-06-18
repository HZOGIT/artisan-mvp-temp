import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/modern/shared/ui/card";
import { Input } from "@/modern/shared/ui/input";
import { Button } from "@/modern/shared/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/modern/shared/ui/accordion";
import { Search, Download, LayoutDashboard, Users, FileText, Receipt, Wrench, ShoppingCart, Package, Sparkles, Globe, Lightbulb, CheckCircle, ArrowRight, BookOpen } from "lucide-react";
import { generateGuidePDF } from "@/modern/shared/lib/generateGuidePDF";
import { DOC_SECTIONS, filterSections } from "../domain/documentation-content";

// Page `documentation` (guide d'utilisation) — migration clean-archi de `pages/Documentation.tsx`. Le
// CONTENU (catalogue) vit en domain ; l'UI résout `iconKey` → icône et i18n le chrome. Markup à l'identique.
const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard, Users, FileText, Receipt, Wrench, ShoppingCart, Package, Sparkles, Globe, Lightbulb,
};

function RenderLine({ line }: { line: string }) {
  if (line.startsWith("💡 ")) {
    return (
      <div className="flex gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-2">
        <Lightbulb className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 dark:text-blue-200">{line.slice(2)}</p>
      </div>
    );
  }
  if (line.startsWith("• ")) {
    const parts = line.slice(2).split(" — ");
    return (
      <div className="flex items-start gap-2 ml-2">
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
        <p className="text-sm">
          {parts.length > 1 ? (<><strong>{parts[0]}</strong> — {parts.slice(1).join(" — ")}</>) : line.slice(2)}
        </p>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
}

export default function DocumentationPage() {
  const { t } = useTranslation("documentation");
  const [searchQuery, setSearchQuery] = useState("");
  const filteredSections = useMemo(() => filterSections(DOC_SECTIONS, searchQuery), [searchQuery]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            {t("titre")}
          </h1>
          <p className="text-muted-foreground">{t("sousTitre")}</p>
        </div>
        <Button onClick={() => generateGuidePDF()}>
          <Download className="h-4 w-4 mr-2" />
          {t("telechargerPdf")}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("rechercher")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
      </div>

      {/* Quick nav */}
      {!searchQuery && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t("sommaire")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {DOC_SECTIONS.map((section) => {
                const Icon = ICON_MAP[section.iconKey];
                return (
                  <button
                    key={section.id}
                    onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" })}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border hover:bg-accent transition-colors text-center"
                  >
                    {Icon && <Icon className={`h-5 w-5 ${section.color}`} />}
                    <span className="text-xs font-medium leading-tight">{section.title.replace(/^\d+\.\s*/, "")}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      {filteredSections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("aucunResultat")}</h3>
            <p className="text-muted-foreground text-center">{t("autresMotsCles")}</p>
          </CardContent>
        </Card>
      ) : (
        filteredSections.map((section) => {
          const Icon = ICON_MAP[section.iconKey];
          return (
            <Card key={section.id} id={section.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  {Icon && <Icon className={`h-5 w-5 ${section.color}`} />}
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" defaultValue={searchQuery ? section.subsections.map((_, i) => `${section.id}-${i}`) : []}>
                  {section.subsections.map((sub, i) => (
                    <AccordionItem key={i} value={`${section.id}-${i}`}>
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        <span className="flex items-center gap-2">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          {sub.title}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pl-6">
                          {sub.content.map((line, idx) => <RenderLine key={idx} line={line} />)}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
