import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Users } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

const formatEUR = (v: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

const BAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export function TopClientsWidget() {
  const { data, isLoading } = trpc.dashboard.getTopClients.useQuery({ limit: 5 });
  const [, setLocation] = useLocation();

  if (isLoading) return <WidgetSkeleton height={240} />;

  const list = (data || []).filter((row: any) => Number(row.totalCA ?? 0) > 0);

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2">
        <Users className="h-8 w-8 opacity-30" />
        <p className="text-sm">Pas encore de chiffre d'affaires par client.</p>
      </div>
    );
  }

  const chartData = list.map((row: any, idx: number) => {
    const c = row.client || {};
    const fullName = `${c.prenom || ""} ${c.nom || ""}`.trim() || c.entreprise || `Client #${c.id}`;
    return {
      id: c.id,
      name: fullName.length > 22 ? fullName.slice(0, 20) + "…" : fullName,
      value: Number(row.totalCA ?? 0),
      color: BAR_COLORS[idx % BAR_COLORS.length],
    };
  });

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          onClick={(state: any) => {
            const payload = state?.activePayload?.[0]?.payload;
            if (payload?.id) setLocation(`/clients/${payload.id}`);
          }}
        >
          <CartesianGrid horizontal={false} stroke="currentColor" opacity={0.08} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            opacity={0.6}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <RechartsTooltip
            cursor={{ fill: "currentColor", opacity: 0.05 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--popover))",
              fontSize: 12,
            }}
            formatter={(value: any) => [formatEUR(Number(value)), "CA"]}
          />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            animationDuration={900}
            className="cursor-pointer"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
