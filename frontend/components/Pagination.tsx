"use client";
import { Button } from "./Button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
  pageSizes?: number[];
};

function buildPages(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set<number>([1, totalPages, current, current - 1, current + 1, 2, totalPages - 1]);
  const arr = Array.from(set).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && arr[i] - arr[i - 1] > 1) out.push("…");
    out.push(arr[i]);
  }
  return out;
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = [10, 20, 50, 100] }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = buildPages(page, totalPages);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
      <div className="flex items-center gap-3 text-gray-500">
        <span>Hiển thị <b className="text-ink">{from}–{to}</b> trên <b className="text-ink">{total}</b></span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="text-gray-400">/ trang</span>
            <select
              className="border border-gray-200 rounded px-1.5 py-0.5 text-sm bg-white"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(1)} title="Đầu">
          <ChevronsLeft size={14} />
        </Button>
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)} title="Trước">
          <ChevronLeft size={14} />
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={
                "min-w-[34px] h-[30px] rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
                (p === page
                  ? "bg-primary text-white"
                  : "border border-gray-200 bg-white text-ink hover:bg-canvas")
              }
            >
              {p}
            </button>
          )
        )}
        <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} title="Sau">
          <ChevronRight size={14} />
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} title="Cuối">
          <ChevronsRight size={14} />
        </Button>
      </div>
    </div>
  );
}
