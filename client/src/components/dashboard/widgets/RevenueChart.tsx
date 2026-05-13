import { trpc } from "@/lib/trpc";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { WidgetSkeleton } from "./WidgetSkeleton";

const formatEUR = (v: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

export function RevenueChartWidget() {
  const { data, isLoading } = trpc.dashboard.getMonthlyCA.useQuery({ months: 6 });

  if (isLoading) return <WidgetSkeleton height={220} />;

  const monthLabel = (yyyymm: string): string => {
    if (!yyyymm || yyyymm.length < 7) return yyyymm;
    const [y, m] = yyyymm.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("fr-FR", { month: "short" });
  };

  const chartData = (data || []).map((m: any) => ({
    name: typeof m.month === "string" ? monthLabel(m.month) : m.label || "",
    value: Number(m.ca ?? m.total ?? m.revenue ?? 0),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2">
        <TrendingUp className="h-8 w-8 opacity-30" />
        <p className="text-sm">Pas encore de données de CA à afficher.</p>
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            opacity={0.6}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            opacity={0.6}
            tickFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
            }
          />
          <RechartsTooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--popover))",
              fontSize: 12,
            }}
            formatter={(value: any) => [formatEUR(Number(value)), "CA"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#revenueGradient)"
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
