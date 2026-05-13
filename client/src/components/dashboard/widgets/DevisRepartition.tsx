import { trpc } from "@/lib/trpc";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { FileText } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

const STATUT_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
};

const STATUT_COLOR: Record<string, string> = {
  brouillon: "#94a3b8",
  envoye: "#3b82f6",
  accepte: "#10b981",
  refuse: "#ef4444",
  expire: "#f59e0b",
};

export function DevisRepartitionWidget() {
  const { data, isLoading } = trpc.statistiques.getDevisStats.useQuery();

  if (isLoading) return <WidgetSkeleton height={220} />;

  const parStatut = (data?.parStatut || {}) as Record<string, number>;
  const total = Object.values(parStatut).reduce((s, n) => s + n, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2">
        <FileText className="h-8 w-8 opacity-30" />
        <p className="text-sm">Pas encore de devis dans votre base.</p>
      </div>
    );
  }

  const chartData = Object.entries(parStatut)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: STATUT_LABEL[k] || k,
      value: v,
      color: STATUT_COLOR[k] || "#6b7280",
      pct: Math.round((v / total) * 100),
    }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            animationDuration={900}
            animationBegin={100}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--popover))",
              fontSize: 12,
            }}
            formatter={(value: any, _name: any, props: any) => [
              `${value} devis (${props.payload.pct}%)`,
              props.payload.name,
            ]}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value: string, entry: any) =>
              `${value} ${entry.payload.pct}%`
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
