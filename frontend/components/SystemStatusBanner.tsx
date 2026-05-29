"use client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertCircle, Settings } from "lucide-react";
import * as api from "@/lib/api";

/**
 * Banner báo trạng thái config (LLM/CapSolver/SMS/IMAP/Proxy).
 * Hiển thị compact khi mọi thứ OK, expand cảnh báo khi thiếu key.
 */
export function SystemStatusBanner() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["system-status"],
    queryFn: api.getSystemStatus,
    refetchInterval: 30000,
    retry: 2,
  });

  if (isLoading) return null;

  if (isError || !data) {
    return (
      <div className="rounded-xl border p-4 mb-4 bg-amber-50 border-amber-200 flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Không tải được trạng thái config</div>
          <div className="mt-0.5">Backend chưa sẵn sàng hoặc token hết hạn — thử đăng nhập lại / reload trang.</div>
        </div>
      </div>
    );
  }

  const allOk = data.fully_configured;
  const hasRequiredMissing = data.missing_required.length > 0;

  return (
    <div
      className={[
        "rounded-xl border p-4 mb-4 transition-colors",
        hasRequiredMissing
          ? "bg-red-50 border-red-200"
          : allOk
          ? "bg-emerald-50 border-emerald-200"
          : "bg-amber-50 border-amber-200",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {hasRequiredMissing ? (
            <XCircle size={20} className="text-red-600" />
          ) : allOk ? (
            <CheckCircle2 size={20} className="text-emerald-600" />
          ) : (
            <AlertCircle size={20} className="text-amber-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 flex items-center gap-2">
            <Settings size={14} />
            {hasRequiredMissing
              ? "Thiếu config bắt buộc — agent không chạy được"
              : allOk
              ? "Tất cả subsystem đã sẵn sàng — 100% automation"
              : `Thiếu ${data.missing_optional.length} config tuỳ chọn — site khó có thể FAIL`}
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.subsystems.map((s) => (
              <div
                key={s.key}
                className={[
                  "rounded-lg px-3 py-2 text-sm border flex items-start gap-2",
                  s.enabled
                    ? "bg-white border-emerald-200"
                    : s.required
                    ? "bg-white border-red-200"
                    : "bg-white border-amber-200",
                ].join(" ")}
                title={s.note || s.value}
              >
                {s.enabled ? (
                  <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                ) : s.required ? (
                  <XCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800 truncate">{s.label}</div>
                  {s.enabled && s.value && (
                    <div className="text-xs text-slate-500 truncate">{s.value}</div>
                  )}
                  {!s.enabled && s.note && (
                    <div className="text-xs text-slate-600 leading-tight mt-0.5">{s.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!allOk && (
            <div className="mt-3 text-xs text-slate-600">
              Điền key thiếu vào <code className="px-1.5 py-0.5 rounded bg-slate-100">backend/.env</code> rồi <b>restart backend</b> (file <code className="px-1.5 py-0.5 rounded bg-slate-100">.env</code> không auto-reload — uvicorn chỉ reload khi sửa code <code className="px-1.5 py-0.5 rounded bg-slate-100">.py</code>).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
