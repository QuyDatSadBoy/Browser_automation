"use client";

/**
 * Root-level error boundary — bắt cả lỗi trong root layout (RootLayout / providers).
 * Phải tự render <html>/<body> vì layout không khả dụng khi nó crash.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff7f7" }}>
        <div style={{ maxWidth: 560, margin: "10vh auto", padding: 24, border: "1px solid #fecaca", borderRadius: 16, background: "#fff" }}>
          <h2 style={{ color: "#b91c1c", margin: 0, fontSize: 20 }}>Lỗi nghiêm trọng</h2>
          <p style={{ color: "#7f1d1d", marginTop: 8 }}>
            App gặp lỗi ở root layout. Reload trang để thử lại.
          </p>
          {error?.message && (
            <pre style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 8, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 200, overflow: "auto" }}>
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 12, padding: "8px 14px", background: "#dc2626", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
