"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import type {
  TrafficCountryRow,
  TrafficDetails,
  TrafficGlobalPoint,
  TrafficSocialPoint,
  TrafficSourceBreakdown,
} from "@/lib/api";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";

type Props = {
  details: TrafficDetails;
  scannedAt: string | null;
  domain?: string | null;
};

const ACCENT = "#6366F1";
const ACCENT_TINT = "#A5B4FC";
const PALETTE = ["#6366F1", "#06B6D4", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#0EA5E9", "#EF4444"];
const PALETTE_BG = [
  "bg-[#6366F1]",
  "bg-[#06B6D4]",
  "bg-[#F59E0B]",
  "bg-[#10B981]",
  "bg-[#EC4899]",
  "bg-[#8B5CF6]",
  "bg-[#0EA5E9]",
  "bg-[#EF4444]",
];

function compact(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function full(n: number | null | undefined, opts: Intl.NumberFormatOptions = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("vi-VN", opts).format(n);
}
function formatMonth(ym: string | undefined | null) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return `T${parseInt(m, 10)}/${y}`;
}
function secondsToReadable(s: number | null | undefined) {
  if (!s || !Number.isFinite(s)) return "—";
  const total = Math.round(s);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}m ${ss.toString().padStart(2, "0")}s`;
}
function pctChange(curr?: number, prev?: number) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

const TooltipStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  backgroundColor: "white",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.10), 0 2px 6px rgb(0 0 0 / 0.06)",
  fontSize: 12,
  padding: "8px 10px",
};

function KpiCard({
  label,
  value,
  change,
  invertColor,
}: {
  label: string;
  value: string;
  change: number | null;
  invertColor?: boolean;
}) {
  const positive = change != null ? change >= 0 : null;
  const good = invertColor ? !positive : positive;
  const tone = good == null ? "text-gray-400" : good ? "text-emerald-600" : "text-rose-600";
  const Icon = positive == null ? null : positive ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink truncate" title={value}>{value}</p>
      {change != null ? (
        <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
          {Icon ? <Icon size={14} /> : null}
          {change.toFixed(2)}%<span className="text-gray-400 font-normal">so kỳ trước</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-gray-300">—</div>
      )}
    </div>
  );
}

function SourceBars({ source }: { source: TrafficSourceBreakdown }) {
  const data = useMemo(() => {
    const rows = [
      { key: "Tìm kiếm tự nhiên", value: source.organic_search },
      { key: "Truy cập trực tiếp", value: source.direct },
      { key: "Giới thiệu", value: source.referrals },
      { key: "Mạng xã hội", value: source.social },
      { key: "Tìm kiếm trả phí", value: source.paid_search },
      { key: "Email", value: source.email },
      { key: "Quảng cáo hiển thị", value: source.display_ads },
    ];
    const total = rows.reduce((s, r) => s + (r.value || 0), 0) || 1;
    return rows
      .map((r) => ({ key: r.key, value: r.value, share: (r.value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [source]);

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 24, left: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
          <XAxis type="number" tickFormatter={(v) => compact(Number(v))} tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
          <YAxis type="category" dataKey="key" width={150} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TooltipStyle}
            formatter={(v: number, _n, item: any) => [
              `${full(v)} (${item?.payload?.share?.toFixed(1)}%)`,
              "Lượt truy cập",
            ]}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SocialPie({ social }: { social: TrafficSocialPoint[] }) {
  const data = useMemo(
    () =>
      social
        .filter((s) => s.share_percentage && s.share_percentage > 0)
        .map((s) => ({ name: s.platform_name, value: Number(s.share_percentage) * 100 }))
        .sort((a, b) => b.value - a.value),
    [social],
  );

  if (data.length === 0) {
    return <div className="flex h-[240px] items-center justify-center text-sm text-gray-400">Không có dữ liệu social</div>;
  }
  const top = data.slice(0, 6);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="h-[220px] w-full lg:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {top.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 truncate text-gray-700">
              {/* eslint-disable-next-line react/forbid-dom-props */}
              <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${PALETTE_BG[i % PALETTE_BG.length]}`} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-gray-900">{d.value.toFixed(2)}%</span>
          </li>
        ))}
        {data.length > top.length ? (
          <li className="pt-1 text-[11px] text-gray-400">+ {data.length - top.length} nền tảng khác</li>
        ) : null}
      </ul>
    </div>
  );
}

function TrendArea({ data }: { data: { month: string; visits: number; unique: number }[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 14, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendVisits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="trendUnique" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT_TINT} stopOpacity={0.25} />
              <stop offset="100%" stopColor={ACCENT_TINT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} tickFormatter={(v) => compact(Number(v))} width={56} />
          <Tooltip
            contentStyle={TooltipStyle}
            labelFormatter={(l) => `Tháng ${l}`}
            formatter={(v: number, n: string) => [full(v), n === "visits" ? "Tổng truy cập" : "Khách duy nhất"]}
          />
          <Area type="monotone" dataKey="unique" stroke={ACCENT_TINT} strokeWidth={2} fill="url(#trendUnique)" />
          <Area type="monotone" dataKey="visits" stroke={ACCENT} strokeWidth={2.5} fill="url(#trendVisits)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CountryTable({ rows }: { rows: TrafficCountryRow[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => r.country_name.toLowerCase().includes(k) || r.country_code.toLowerCase().includes(k));
  }, [rows, q]);
  const sliced = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Traffic theo quốc gia <span className="text-gray-400 font-normal">({filtered.length})</span></h3>
        <div className="w-48 sm:w-56">
          <Input placeholder="Tìm quốc gia…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">Quốc gia</th>
              <th className="px-3 py-2 font-medium text-right">Truy cập</th>
              <th className="px-3 py-2 font-medium text-right">Tỷ trọng</th>
              <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Pages/Visit</th>
              <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Thời lượng</th>
              <th className="px-3 py-2 font-medium text-right hidden md:table-cell">Bounce</th>
            </tr>
          </thead>
          <tbody>
            {sliced.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">Không có dữ liệu</td></tr>
            ) : sliced.map((r, i) => (
              <tr key={`${r.country_code}-${i}`} className="border-t border-gray-100 hover:bg-gray-50/60">
                <td className="px-3 py-2 font-medium text-ink">{r.country_name} <span className="text-xs text-gray-400">{r.country_code}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{compact(r.total_visits_monthly)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.traffic_share_percentage.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700 hidden sm:table-cell">{r.pages_per_visit.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700 hidden md:table-cell">{secondsToReadable(r.avg_visit_duration)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700 hidden md:table-cell">{r.bounce_rate_percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-gray-500">
          <button className="rounded-md border border-gray-200 px-2 py-1 disabled:opacity-50" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Trước</button>
          <span>Trang {page + 1} / {totalPages}</span>
          <button className="rounded-md border border-gray-200 px-2 py-1 disabled:opacity-50" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Sau →</button>
        </div>
      )}
    </div>
  );
}

export function ProgramTrafficDetail({ details, scannedAt, domain }: Props) {
  const global: TrafficGlobalPoint[] = useMemo(
    () => [...(details.global || [])].sort((a, b) => a.period_month.localeCompare(b.period_month)),
    [details],
  );
  const latest = global[global.length - 1];
  const prev = global[global.length - 2];
  const trendData = useMemo(
    () => global.map((g) => ({ month: formatMonth(g.period_month), visits: g.total_visits_monthly, unique: g.unique_visits_monthly })),
    [global],
  );

  const kpis = [
    { label: "Tổng truy cập", value: compact(latest?.total_visits_monthly), change: pctChange(latest?.total_visits_monthly, prev?.total_visits_monthly) },
    { label: "Khách duy nhất", value: compact(latest?.unique_visits_monthly), change: pctChange(latest?.unique_visits_monthly, prev?.unique_visits_monthly) },
    { label: "Khách quay lại", value: compact(latest?.repeat_visits_monthly), change: pctChange(latest?.repeat_visits_monthly, prev?.repeat_visits_monthly) },
    { label: "Pages / Visit", value: full(latest?.pages_per_visit, { maximumFractionDigits: 2 }), change: pctChange(latest?.pages_per_visit, prev?.pages_per_visit) },
    { label: "Thời lượng TB", value: secondsToReadable(latest?.avg_visit_duration), change: pctChange(latest?.avg_visit_duration, prev?.avg_visit_duration) },
    { label: "Tỷ lệ thoát", value: latest ? `${latest.bounce_rate_percentage.toFixed(2)}%` : "—", change: pctChange(latest?.bounce_rate_percentage, prev?.bounce_rate_percentage), invert: true },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Traffic Insights</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {domain ? <><span className="font-medium text-gray-700">{domain}</span> · </> : null}
              Kỳ mới nhất {formatMonth(latest?.period_month)}
              {scannedAt ? <> · Quét lúc {new Date(scannedAt + (scannedAt.endsWith("Z") ? "" : "Z")).toLocaleString("vi-VN")}</> : null}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} change={k.change} invertColor={k.invert} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink">Diễn biến lưu lượng</h3>
              <p className="text-xs text-gray-400">{global.length} kỳ gần nhất</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-gray-600"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Tổng truy cập</span>
              <span className="flex items-center gap-1.5 text-gray-600"><span className="h-2.5 w-2.5 rounded-full bg-primary-200" />Khách duy nhất</span>
            </div>
          </div>
          {trendData.length > 1 ? (
            <TrendArea data={trendData} />
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-gray-400">Cần ít nhất 2 kỳ để hiển thị xu hướng</div>
          )}
        </Card>

        <Card>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">Phân bổ social</h3>
            <p className="text-xs text-gray-400">% từng nền tảng trong tổng social traffic</p>
          </div>
          <SocialPie social={details.social || []} />
        </Card>
      </div>

      {details.source && (
        <Card>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">Nguồn traffic</h3>
            <p className="text-xs text-gray-400">Phân bổ theo kênh trong tháng {formatMonth(details.source.period_month)}</p>
          </div>
          <SourceBars source={details.source} />
        </Card>
      )}

      {details.country && details.country.length > 0 && (
        <Card>
          <CountryTable rows={details.country} />
        </Card>
      )}
    </div>
  );
}
