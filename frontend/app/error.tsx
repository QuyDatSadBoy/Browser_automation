"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Next.js global error boundary — bắt lỗi render bất ngờ ở mọi route.
 * Hiển thị thông báo thân thiện tiếng Việt + nút retry / về trang chính.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // log ra console để dev / culi đọc khi debug
    // eslint-disable-next-line no-console
    console.error("[error.tsx] caught:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-100 p-2 shrink-0">
            <AlertTriangle className="text-red-600" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-red-900 text-lg">Đã xảy ra lỗi</h2>
            <p className="text-sm text-red-800 mt-1">
              Trang gặp lỗi không mong muốn. Chủ nhân có thể thử tải lại; nếu lỗi lặp lại, kiểm tra
              <code className="px-1.5 py-0.5 rounded bg-white/70 mx-1">frontend/logs/frontend.log</code>
              hoặc backend log.
            </p>
            {error?.message && (
              <pre className="mt-3 text-xs bg-white border border-red-200 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-red-900">
                {error.message}
                {error.digest ? `\n\ndigest: ${error.digest}` : ""}
              </pre>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5"
              >
                <RefreshCw size={14} /> Thử lại
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-50 text-red-700 text-sm font-medium px-3 py-1.5"
              >
                <Home size={14} /> Về trang chính
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
