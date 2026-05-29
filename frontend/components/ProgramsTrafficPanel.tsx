"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Program } from "@/lib/api";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

type Props = {
  items: Program[];
  total: number;
};

type SourceAgg = {
  source: string;
  avgTraffic: number;
  count: number;
};

function compact(n: number) {
  return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function tinyName(name: string, limit = 18) {
  if (name.length <= limit) return name;
  return `${name.slice(0, limit - 1)}…`;
}

export function ProgramsTrafficPanel({ items, total }: Props) {
  const trafficRows = useMemo(
    () => items.filter((p) => (p.traffic_score || 0) > 0).map((p) => ({ ...p, traffic: Number(p.traffic_score || 0) })),
    [items]
  );

  const sourceAgg = useMemo<SourceAgg[]>(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const p of trafficRows) {
      const key = p.source || "unknown";
      const curr = map.get(key) || { sum: 0, count: 0 };
      curr.sum += p.traffic;
      curr.count += 1;
      map.set(key, curr);
    }
    return Array.from(map.entries())
      .map(([source, v]) => ({ source, avgTraffic: v.count ? v.sum / v.count : 0, count: v.count }))
      .sort((a, b) => b.avgTraffic - a.avgTraffic);
  }, [trafficRows]);

  const topTraffic = useMemo(
    () => [...trafficRows].sort((a, b) => b.traffic - a.traffic).slice(0, 8).map((p) => ({ name: tinyName(p.name), traffic: p.traffic })),
    [trafficRows]
  );

  const stats = useMemo(() => {
    const vals = trafficRows.map((x) => x.traffic);
    const sum = vals.reduce((acc, x) => acc + x, 0);
    const avg = vals.length ? sum / vals.length : 0;
    const med = median(vals);
    const coverage = items.length ? Math.round((vals.length / items.length) * 100) : 0;
    return { avg, med, coverage, known: vals.length };
  }, [trafficRows, items.length]);

  return (
    <Card className="mb-4 !p-4 md:!p-5 bg-gradient-to-br from-white via-canvas to-primary-50/60 border-primary-100">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm md:text-base font-semibold text-ink">Traffic Insights</h3>
          <p className="text-xs md:text-sm text-gray-500">
            Tổng <b className="text-ink">{total.toLocaleString("vi-VN")}</b> dự án khớp bộ lọc · biểu đồ tổng hợp top <b className="text-ink">{items.length.toLocaleString("vi-VN")}</b> dự án có traffic cao nhất (không phụ thuộc trang hiện tại).
          </p>
        </div>
        <Badge variant="info">
          {stats.known}/{items.length} có traffic
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Metric title="Avg traffic" value={compact(stats.avg)} subtitle={`Trung bình/tháng · ${stats.known} dự án có traffic`} />
        <Metric title="Median traffic" value={compact(stats.med)} subtitle="Trung vị/tháng (loại bỏ outlier)" />
        <Metric title="Coverage" value={`${stats.coverage}%`} subtitle={`Có traffic / ${items.length} mẫu top traffic`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 rounded-xl border border-primary-100/80 bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Top programs theo traffic</div>
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={topTraffic} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="programTrafficGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E7FF" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={(v) => compact(Number(v))} />
                <Tooltip
                  cursor={{ stroke: "#C7D2FE", strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E0E7FF", background: "#ffffff", boxShadow: "0 10px 30px rgba(79,70,229,0.15)" }}
                  formatter={(value: number) => [new Intl.NumberFormat("vi-VN").format(value), "Traffic/tháng"]}
                />
                <Area type="monotone" dataKey="traffic" stroke="#4F46E5" strokeWidth={2.2} fill="url(#programTrafficGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-2 rounded-xl border border-primary-100/80 bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Traffic trung bình theo nguồn</div>
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceAgg} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="source" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={(v) => compact(Number(v))} />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", background: "#fff" }}
                  formatter={(value: number, _name, payload) => [
                    `${new Intl.NumberFormat("vi-VN").format(Math.round(value))} visits`,
                    `Avg (${payload?.payload?.count || 0} programs)`,
                  ]}
                />
                <Bar dataKey="avgTraffic" radius={[8, 8, 0, 0]} fill="#0EA5E9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-primary-100/80 bg-white/85 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}
