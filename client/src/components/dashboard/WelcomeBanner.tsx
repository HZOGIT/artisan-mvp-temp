import { motion } from "framer-motion";
import { Calendar, FileText, Plus, Receipt } from "lucide-react";

interface WelcomeBannerProps {
  /** Prénom affiché (peut être null/undefined → fallback "bonjour"). */
  firstName?: string | null;
  /** Nombre de devis en attente — affiché dans le résumé. */
  devisEnAttente?: number;
  /** Nombre de factures impayées. */
  facturesImpayees?: number;
  /** Nombre d'interventions à venir. */
  interventionsAVenir?: number;
  onCreateDevis?: () => void;
  onCreateFacture?: () => void;
  onCreateIntervention?: () => void;
}

/**
 * Bandeau de bienvenue plein-largeur :
 * - Dégradé bleu profond avec deux "blobs" animés (CSS pur, pas de canvas).
 * - Salutation + date du jour formatée en français.
 * - Résumé contextuel (1-3 phrases selon les compteurs).
 * - 3 boutons d'action rapide en bas.
 */
export function WelcomeBanner({
  firstName,
  devisEnAttente = 0,
  facturesImpayees = 0,
  interventionsAVenir = 0,
  onCreateDevis,
  onCreateFacture,
  onCreateIntervention,
}: WelcomeBannerProps) {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hour = new Date().getHours();
  const greeting =
    hour < 6 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  const summaryParts: string[] = [];
  if (devisEnAttente > 0) {
    summaryParts.push(`${devisEnAttente} devis en attente`);
  }
  if (facturesImpayees > 0) {
    summaryParts.push(`${facturesImpayees} facture${facturesImpayees > 1 ? "s" : ""} impayée${facturesImpayees > 1 ? "s" : ""}`);
  }
  if (interventionsAVenir > 0) {
    summaryParts.push(`${interventionsAVenir} intervention${interventionsAVenir > 1 ? "s" : ""} à venir`);
  }
  const summary =
    summaryParts.length === 0
      ? "Tout est sous contrôle pour le moment. Bonne journée !"
      : `Vous avez ${summaryParts.join(", ").replace(/, ([^,]*)$/, " et $1")}.`;

  return (
    <motion.section
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white shadow-lg"
    >
      {/* Particules animées (pure CSS) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl animate-blob" />
        <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-fuchsia-400/15 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/3 h-40 w-40 rounded-full bg-emerald-300/10 blur-2xl animate-blob animation-delay-4000" />
      </div>

      <div className="relative p-6 md:p-8">
        <p className="text-xs uppercase tracking-widest font-medium text-blue-200/80">
          {today}
        </p>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold leading-tight">
          {greeting}{firstName ? ` ${firstName}` : ""} 👋
        </h1>
        <p className="mt-2 text-sm md:text-base text-blue-100/90 max-w-2xl">{summary}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {onCreateDevis && (
            <button
              type="button"
              onClick={onCreateDevis}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium transition-all border border-white/20 hover:border-white/30"
            >
              <Plus className="h-4 w-4" /> <FileText className="h-3.5 w-3.5" /> Devis
            </button>
          )}
          {onCreateFacture && (
            <button
              type="button"
              onClick={onCreateFacture}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium transition-all border border-white/20 hover:border-white/30"
            >
              <Plus className="h-4 w-4" /> <Receipt className="h-3.5 w-3.5" /> Facture
            </button>
          )}
          {onCreateIntervention && (
            <button
              type="button"
              onClick={onCreateIntervention}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 text-sm font-medium transition-all border border-white/20 hover:border-white/30"
            >
              <Plus className="h-4 w-4" /> <Calendar className="h-3.5 w-3.5" /> Intervention
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
