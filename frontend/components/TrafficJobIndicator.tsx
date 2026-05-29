"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Loader2, CheckCircle2, AlertCircle, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTrafficJob } from "@/lib/traffic-job-context";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";

export function TrafficJobIndicator() {
  const { jobId, job, isRunning, clear } = useTrafficJob();
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (jobId == null) return null;

  const total = job?.total ?? 0;
  const done = job ? job.scanned + job.skipped + job.failed : 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const isFailed = job?.status === "failed";
  const hasErrors = (job?.failed ?? 0) > 0 || isFailed;
  const isSuccess = job?.status === "success" && !hasErrors;

  // Màu viền/icon theo trạng thái
  const ring = isRunning
    ? "border-primary/40"
    : isFailed
    ? "border-red-300"
    : hasErrors
    ? "border-amber-300"
    : "border-emerald-300";

  const StatusIcon = isRunning ? Loader2 : isFailed ? AlertCircle : hasErrors ? AlertCircle : CheckCircle2;
  const statusColor = isRunning
    ? "text-primary"
    : isFailed
    ? "text-red-500"
    : hasErrors
    ? "text-amber-500"
    : "text-emerald-500";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tiến độ quét traffic"
        title={isRunning ? `Đang quét ${done}/${total} (${pct}%)` : "Tiến độ quét traffic"}
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border ${ring} shadow-soft hover:border-primary-200 transition`}
      >
        <Gauge size={18} className="text-ink" />
        {/* Mini status dot */}
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-white border border-gray-200">
          <StatusIcon size={11} className={`${statusColor} ${isRunning ? "animate-spin" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[320px] rounded-xl border border-gray-200 bg-white shadow-soft-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="font-semibold text-ink text-sm">
              {isRunning
                ? "Đang quét traffic"
                : isFailed
                ? "Quét traffic thất bại"
                : hasErrors
                ? "Quét xong (có lỗi)"
                : isSuccess
                ? "Quét traffic hoàn tất"
                : "Tiến độ quét traffic"}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="text-gray-400 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-2.5">
            {!job ? (
              <div className="text-xs text-gray-500">Đang tải tiến độ…</div>
            ) : (
              <>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full transition-all ${isFailed ? "bg-red-500" : hasErrors ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    {done}/{total} dự án
                  </span>
                  <span className="tabular-nums font-medium text-ink">{pct}%</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">Thấy</div>
                    <div className="text-sm font-semibold text-ink tabular-nums">{job.found}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Bỏ qua</div>
                    <div className="text-sm font-semibold text-ink tabular-nums">{job.skipped}</div>
                  </div>
                  <div className="rounded-lg bg-red-50/60 border border-red-100 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-red-600 font-semibold">Lỗi</div>
                    <div className="text-sm font-semibold text-ink tabular-nums">{job.failed}</div>
                  </div>
                </div>
                {isFailed && job.error && (
                  <div className="text-[11px] text-red-600 break-all bg-red-50/40 border border-red-100 rounded-md px-2 py-1.5">
                    {job.error.split("\n")[0]}
                  </div>
                )}
                {isRunning && (
                  <div className="text-[11px] text-gray-500">
                    Job chạy nền — bạn có thể chuyển trang, kết quả sẽ tự cập nhật.
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex border-t border-gray-100">
            <button
              onClick={() => {
                setOpen(false);
                setDetailOpen(true);
              }}
              className="flex-1 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              Xem chi tiết
            </button>
            {!isRunning && (
              <button
                onClick={() => {
                  clear();
                  setOpen(false);
                }}
                className="px-3 py-2.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50/40 border-l border-gray-100 transition-colors"
                title="Ẩn thông báo"
              >
                Ẩn
              </button>
            )}
          </div>
        </div>
      )}

      <TrafficJobResultsDialog open={detailOpen} onClose={() => setDetailOpen(false)} job={job} />
    </div>
  );
}

type JobLite = NonNullable<ReturnType<typeof useTrafficJob>["job"]>;

function TrafficJobResultsDialog({ open, onClose, job }: { open: boolean; onClose: () => void; job: JobLite | null }) {
  const [filter, setFilter] = useState<"all" | "ok" | "empty" | "skipped" | "failed">("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const list = job?.results || [];
    const kw = search.trim().toLowerCase();
    return list.filter((r) => (filter === "all" || r.status === filter) && (!kw || r.name.toLowerCase().includes(kw)));
  }, [job, filter, search]);

  const counts = useMemo(() => {
    const c = { all: 0, ok: 0, empty: 0, skipped: 0, failed: 0 } as Record<string, number>;
    for (const r of job?.results || []) { c.all += 1; c[r.status] = (c[r.status] || 0) + 1; }
    return c;
  }, [job]);

  if (!job) return null;

  const title = `Kết quả quét traffic #${job.id} — ${job.scanned}/${job.total} dự án`;

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ["all", "Tất cả"],
            ["ok", "Có traffic"],
            ["empty", "Không thấy"],
            ["skipped", "Bỏ qua"],
            ["failed", "Lỗi"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-2.5 py-1 rounded-full text-xs border transition ${
                filter === key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:border-primary-200"
              }`}
            >
              {label} <span className="opacity-70">({counts[key] ?? 0})</span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên dự án…"
          className="w-full sm:w-64 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-primary"
        />
      </div>

      <div className="text-xs text-gray-500 mb-2">
        Tóm tắt: Thấy <b className="text-emerald-600">{job.found}</b> · Bỏ qua <b>{job.skipped}</b> · Lỗi <b className="text-red-600">{job.failed}</b> · Khoảng quét: {job.months} tháng · Concurrency: {job.concurrency}
      </div>

      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Dự án</th>
              <th className="text-left px-3 py-2 font-medium">Trạng thái</th>
              <th className="text-right px-3 py-2 font-medium">Visits/tháng</th>
              <th className="text-left px-3 py-2 font-medium">Tháng</th>
              <th className="text-right px-3 py-2 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">Không có dữ liệu phù hợp.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.program_id} className="border-t border-gray-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-ink line-clamp-1">{r.name}</div>
                  {r.error && <div className="text-[11px] text-red-500 line-clamp-1" title={r.error}>{r.error}</div>}
                </td>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.monthly_visits ? r.monthly_visits.toLocaleString("vi-VN") : "—"}</td>
                <td className="px-3 py-2 text-gray-500">{r.period_month || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/programs?focus=${r.program_id}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Mở <ExternalLink size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function StatusPill({ status }: { status: "ok" | "empty" | "skipped" | "failed" }) {
  const map = {
    ok: { variant: "success" as const, label: "Có traffic" },
    empty: { variant: "neutral" as const, label: "Không thấy" },
    skipped: { variant: "neutral" as const, label: "Bỏ qua" },
    failed: { variant: "error" as const, label: "Lỗi" },
  };
  const { variant, label } = map[status] || map.empty;
  return <Badge variant={variant}>{label}</Badge>;
}
