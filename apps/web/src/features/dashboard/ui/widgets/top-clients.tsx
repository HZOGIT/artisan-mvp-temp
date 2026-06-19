import { useTranslation } from "react-i18next";
import { useLocation } from "@/shared/router/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Users } from "lucide-react";
import { useTopClients } from "../../application/use-dashboard-widgets";
import { WidgetSkeleton } from "./widget-skeleton";

/** Top clients par CA (barres horizontales). Re-port de widgets/TopClients (clean-archi, i18n, typé). */
const formatEUR = (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const BAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export function TopClientsWidget() {
  const { t } = useTranslation("dashboard");
  const { rows, isLoading } = useTopClients();
  const [, setLocation] = useLocation();
  if (isLoading) return <WidgetSkeleton height={240} />;
  const list = rows.filter((row) => Number(row.totalCA ?? 0) > 0);
  if (list.length === 0) {
    return <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2"><Users className="h-8 w-8 opacity-30" /><p className="text-sm">{t("tc_aucun")}</p></div>;
  }
  const chartData = list.map((row, idx) => {
    const c = row.client || {};
    const fullName = `${c.prenom || ""} ${c.nom || ""}`.trim() || c.entreprise || t("tc_clientNum", { id: c.id });
    return { id: c.id, name: fullName.length > 22 ? fullName.slice(0, 20) + "…" : fullName, value: Number(row.totalCA ?? 0), color: BAR_COLORS[idx % BAR_COLORS.length] };
  });
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }} onClick={(state) => { const pl = (state as { activePayload?: Array<{ payload?: { id?: number } }> })?.activePayload?.[0]?.payload; if (pl?.id) setLocation(`/clients/${pl.id}`); }}>
          <CartesianGrid horizontal={false} stroke="currentColor" opacity={0.08} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} opacity={0.6} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} width={110} />
          <RechartsTooltip cursor={{ fill: "currentColor", opacity: 0.05 }} contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", fontSize: 12 }} formatter={(value) => [formatEUR(Number(value)), t("tc_ca")]} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={900} className="cursor-pointer">
            {chartData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
