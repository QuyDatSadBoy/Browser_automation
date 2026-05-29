"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import {
  Activity, Brain, Shield, Smartphone, Mail, Globe,
  CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, AlertCircle, Play,
} from "lucide-react";
import * as api from "@/lib/api";
import type { ConnTestResult, SystemTestAllOut } from "@/lib/api";
import { Card } from "./Card";
import { Button } from "./Button";
import { useToast } from "@/lib/toast";

type RowKey = keyof SystemTestAllOut["results"];

const ROWS: Array<{
  key: RowKey;
  label: string;
  icon: any;
  required: boolean;
  fixUrl?: string;
  fixLabel?: string;
  describe: (r: ConnTestResult) => string;
}> = [
  {
    key: "llm", label: "Mô hình AI (LLM)", icon: Brain, required: true,
    describe: (r) => r.ok ? `${r.provider || ""} · ${r.model || ""}` : (r.error || "Chưa cấu hình GEMINI_API_KEY / OPENAI_API_KEY"),
  },
  {
    key: "capsolver", label: "Giải CAPTCHA (CapSolver)", icon: Shield, required: false,
    fixUrl: "https://capsolver.com", fixLabel: "Lấy API key",
    describe: (r) => r.ok ? `Số dư: $${r.balance}` : (r.error || "Chưa cấu hình"),
  },
  {
    key: "sms", label: "Nhận OTP qua SMS", icon: Smartphone, required: false,
    fixUrl: "/library?tab=sms", fixLabel: "Mở SMS OTP",
    describe: (r) => r.ok ? `${r.provider || ""} · Số dư: $${r.balance}` : (r.error || "Chưa cấu hình"),
  },
  {
    key: "imap", label: "Đọc email xác minh (IMAP)", icon: Mail, required: false,
    fixUrl: "/library?tab=email", fixLabel: "Mở Thư viện Email",
    describe: (r) => r.ok
      ? `${r.email || ""} · ${r.inbox_count ?? 0} mail trong inbox`
      : (r.email ? `${r.email}: ${r.error || "fail"}` : (r.error || "Chưa có email")),
  },
  {
    key: "proxy", label: "Proxy ẩn IP", icon: Globe, required: false,
    fixUrl: "/library?tab=proxy", fixLabel: "Mở Thư viện Proxy",
    describe: (r) => r.ok
      ? `${r.proxy_name || ""} → IP ngoài: ${r.ip || ""}`
      : (r.proxy_name ? `${r.proxy_name}: ${r.error || "fail"}` : (r.error || "Chưa có proxy")),
  },
];

type ResultMap = Partial<Record<RowKey, ConnTestResult>>;

export function ConnectionTestPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { push } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [results, setResults] = useState<ResultMap>({});
  // Mặc định chọn tất cả → user có thể bỏ chọn cái không quan tâm
  const [selected, setSelected] = useState<Set<RowKey>>(new Set(ROWS.map((r) => r.key)));
  // Trạng thái loading per-row (Set các key đang test)
  const [pending, setPending] = useState<Set<RowKey>>(new Set());

  function toggle(key: RowKey) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === ROWS.length) setSelected(new Set());
    else setSelected(new Set(ROWS.map((r) => r.key)));
  }

  async function runOne(key: RowKey) {
    setPending((p) => new Set(p).add(key));
    try {
      const out = await api.testOneConnection(key);
      setResults((r) => ({ ...r, [key]: out.result }));
      push({
        type: out.result.ok ? "success" : "error",
        message: `${ROWS.find((x) => x.key === key)?.label}: ${out.result.ok ? "OK" : (out.result.error || "fail")}`,
      });
    } catch (e: any) {
      push({ type: "error", message: e?.message || "Test fail" });
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  }

  const runMany = useMutation({
    mutationFn: async () => {
      const keys = Array.from(selected);
      if (keys.length === 0) throw new Error("Chưa chọn mục nào để test");
      setPending(new Set(keys));
      const t0 = Date.now();
      // Nếu chọn TẤT CẢ → dùng test-all (server-side parallel, đỡ 5 round-trip)
      if (keys.length === ROWS.length) {
        const data = await api.testAllConnections();
        return { results: data.results as ResultMap, total_ms: data.total_ms };
      }
      // Chọn 1 phần → gọi test-one song song
      const outs = await Promise.all(keys.map((k) => api.testOneConnection(k)));
      const map: ResultMap = {};
      for (const o of outs) map[o.key as RowKey] = o.result;
      return { results: map, total_ms: Date.now() - t0 };
    },
    onSuccess: ({ results: r, total_ms }) => {
      setResults((cur) => ({ ...cur, ...r }));
      setPending(new Set());
      const tested = Object.values(r);
      const okCount = tested.filter((x) => x?.ok).length;
      push({
        type: okCount === tested.length ? "success" : okCount === 0 ? "error" : "info",
        message: `Test kết nối: ${okCount}/${tested.length} OK trong ${(total_ms / 1000).toFixed(1)}s`,
      });
    },
    onError: (e: Error) => {
      setPending(new Set());
      push({ type: "error", message: e.message });
    },
  });

  // Đếm trạng thái dựa trên các row đã có kết quả (không phải toàn bộ)
  const testedRows = ROWS.filter((r) => results[r.key]);
  const okCount = testedRows.filter((r) => results[r.key]?.ok).length;
  const allSelected = selected.size === ROWS.length;
  const noneSelected = selected.size === 0;
  const headerBtnLabel = noneSelected
    ? "Chọn mục để test"
    : allSelected ? "Test tất cả" : `Test ${selected.size} mục đã chọn`;

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left flex-1"
        >
          <span className="w-9 h-9 rounded-lg bg-info-50 text-info flex items-center justify-center">
            <Activity size={18} />
          </span>
          <div>
            <div className="font-semibold text-ink flex items-center gap-2">
              Kiểm tra kết nối hệ thống
              {testedRows.length > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${okCount === testedRows.length ? "bg-emerald-100 text-emerald-700" : okCount === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {okCount}/{testedRows.length} OK
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Tick chọn từng mục cần test, hoặc bấm "Test" ngay trên từng dòng.
            </div>
          </div>
          {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>
        <Button
          size="sm"
          onClick={(e) => { e.stopPropagation(); setOpen(true); runMany.mutate(); }}
          loading={runMany.isPending}
          disabled={noneSelected}
        >
          <Activity size={14} /> {headerBtnLabel}
        </Button>
      </div>

      {open && (
        <>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
                onChange={toggleAll}
                className="accent-primary"
              />
              <span>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span>
            </label>
            <span className="text-gray-300">·</span>
            <span>Đã chọn <b className="text-ink">{selected.size}</b>/{ROWS.length}</span>
          </div>

          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            {ROWS.map(({ key, label, icon: Icon, required, fixUrl, fixLabel, describe }) => {
              const r = results[key];
              const isPending = pending.has(key);
              const isSelected = selected.has(key);
              return (
                <div
                  key={key}
                  className={[
                    "rounded-lg border px-3 py-2.5 flex items-start gap-2 transition",
                    !r ? (isSelected ? "bg-white border-gray-200" : "bg-gray-50/60 border-gray-100 opacity-70")
                      : r.ok ? "bg-emerald-50 border-emerald-200"
                      : required ? "bg-red-50 border-red-200"
                      : "bg-amber-50 border-amber-200",
                  ].join(" ")}
                >
                  <label className="mt-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(key)}
                      className="accent-primary"
                      aria-label={`Chọn ${label}`}
                    />
                  </label>
                  <div className="mt-0.5">
                    {isPending ? (
                      <Loader2 size={16} className="text-info animate-spin" />
                    ) : !r ? (
                      <Icon size={16} className="text-gray-400" />
                    ) : r.ok ? (
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    ) : required ? (
                      <XCircle size={16} className="text-red-600" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm text-ink truncate">{label}</div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r?.elapsed_ms != null && (
                          <span className="text-[11px] text-gray-400 font-mono">{r.elapsed_ms}ms</span>
                        )}
                        <button
                          type="button"
                          onClick={() => runOne(key)}
                          disabled={isPending}
                          className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-primary hover:text-white hover:border-primary transition disabled:opacity-50"
                          aria-label={`Test ${label}`}
                          title="Test riêng mục này"
                        >
                          {isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                          Test
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 break-all">
                      {isPending ? "Đang kiểm tra..." : r ? describe(r) : (isSelected ? "Chưa test" : "Bỏ qua (chưa tick)")}
                    </div>
                    {r && !r.ok && fixUrl && (
                      fixUrl.startsWith("http") ? (
                        <a href={fixUrl} target="_blank" rel="noopener noreferrer"
                           className="text-[11px] text-info hover:underline inline-block mt-1">
                          {fixLabel} →
                        </a>
                      ) : (
                        <Link href={fixUrl} className="text-[11px] text-info hover:underline inline-block mt-1">
                          {fixLabel} →
                        </Link>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {testedRows.length > 0 && (
            <div className="text-[11px] text-gray-400 mt-2 text-right">
              Đã test {testedRows.length}/{ROWS.length} mục
            </div>
          )}
        </>
      )}
    </Card>
  );
}


