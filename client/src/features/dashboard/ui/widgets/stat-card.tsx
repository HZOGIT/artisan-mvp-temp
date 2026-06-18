import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type StatCardColor = "blue" | "green" | "orange" | "red" | "violet" | "cyan";

interface StatCardProps {
  title: string;
  /** Valeur numérique (pour le count-up) ou texte préformaté (pourcentage, ratio…). */
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  color: StatCardColor;
  /** Préfixe affiché devant la valeur (ex: rien) — non utilisé par défaut. */
  prefix?: string;
  /** Suffixe (ex: " €", " %"). */
  suffix?: string;
  /** Formate la valeur numérique (ex: en EUR). Si fourni, prend le pas sur prefix/suffix. */
  formatter?: (value: number) => string;
  /** Tendance haut/bas avec libellé. */
  trend?: "up" | "down";
  trendValue?: string;
  /** Index pour la stagger animation (0-N). */
  index?: number;
  /** Badge rouge (compteur) au coin sup. droit. */
  badge?: number;
  /** Si true, fait pulser le card (factures impayées > 0 par ex). */
  pulse?: boolean;
  /** Élément additionnel rendu en bas (ex: barre de progression). */
  footer?: React.ReactNode;
  onClick?: () => void;
}

const COLOR_STYLES: Record<StatCardColor, { iconBg: string; iconColor: string; ring: string }> = {
  blue: { iconBg: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/30" },
  green: { iconBg: "bg-emerald-100 dark:bg-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30" },
  orange: { iconBg: "bg-orange-100 dark:bg-orange-900/30", iconColor: "text-orange-600 dark:text-orange-400", ring: "ring-orange-500/30" },
  red: { iconBg: "bg-rose-100 dark:bg-rose-900/30", iconColor: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/30" },
  violet: { iconBg: "bg-violet-100 dark:bg-violet-900/30", iconColor: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/30" },
  cyan: { iconBg: "bg-cyan-100 dark:bg-cyan-900/30", iconColor: "text-cyan-600 dark:text-cyan-400", ring: "ring-cyan-500/30" },
};

/**
 * Compteur animé framer-motion : passe de 0 à `value` en ~1,2 s avec spring,
 * formaté via `formatter` (ou conversion entière simple).
 */
function AnimatedNumber({
  value,
  formatter,
  prefix,
  suffix,
}: {
  value: number;
  formatter?: (v: number) => string;
  prefix?: string;
  suffix?: string;
}) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 80, damping: 18, mass: 1 });
  const display = useTransform(spring, (latest) => {
    if (formatter) return formatter(latest);
    const isInt = Number.isInteger(value);
    return `${prefix ?? ""}${isInt ? Math.round(latest).toLocaleString("fr-FR") : latest.toFixed(2)}${suffix ?? ""}`;
  });
  const [text, setText] = useState(formatter ? formatter(0) : `${prefix ?? ""}0${suffix ?? ""}`);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    return display.on("change", (v) => setText(String(v)));
  }, [display]);

  return <>{text}</>;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  prefix,
  suffix,
  formatter,
  trend,
  trendValue,
  index = 0,
  badge,
  pulse,
  footer,
  onClick,
}: StatCardProps) {
  const { t } = useTranslation("dashboard");
  const styles = COLOR_STYLES[color];
  const isNumeric = typeof value === "number";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
      whileHover={onClick ? { y: -2, scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      className={`relative text-left bg-card text-card-foreground rounded-xl border border-border p-4 shadow-sm overflow-hidden ${
        onClick ? "cursor-pointer hover:shadow-md transition-shadow" : "cursor-default"
      } ${pulse ? `ring-2 ring-offset-2 ${styles.ring}` : ""} disabled:cursor-default`}
      aria-label={onClick ? t("statVoirDetail", { title }) : title}
    >
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-2 right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow">
          {badge > 99 ? "99+" : badge}
        </span>
      )}

      <div className="flex items-start justify-between mb-3 gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          {title}
        </p>
        <div
          className={`h-9 w-9 shrink-0 rounded-lg ${styles.iconBg} flex items-center justify-center`}
        >
          <Icon className={`h-4 w-4 ${styles.iconColor}`} />
        </div>
      </div>

      <div className="text-2xl font-bold tracking-tight tabular-nums">
        {isNumeric ? (
          <AnimatedNumber
            value={value as number}
            formatter={formatter}
            prefix={prefix}
            suffix={suffix}
          />
        ) : (
          <>{prefix}{value}{suffix}</>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 min-h-[20px]">
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
        {trend && trendValue && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 ${
              trend === "up"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
            }`}
          >
            {trend === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {trendValue}
          </span>
        )}
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </motion.button>
  );
}
