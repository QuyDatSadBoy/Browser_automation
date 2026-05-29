"use client";
import { useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import type { SmsOption } from "@/lib/api";

export function SmsSelect({ label, placeholder, options, value, onChange, loading, hint }: {
  label?: string;
  placeholder: string;
  options: SmsOption[];
  value: string;
  onChange: (v: string) => void;
  loading?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options.slice(0, 200);
    return options.filter((o) => o.name.toLowerCase().includes(term) || o.id === term).slice(0, 200);
  }, [q, options]);

  const selectedName = options.find((o) => o.id === value)?.name || "";

  return (
    <div className="relative">
      {label && <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${label ? "mt-1" : ""} w-full text-left px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-info-200 focus:border-info focus:outline-none flex items-center justify-between gap-2`}
      >
        <span className={`text-sm truncate ${value ? "text-ink font-medium" : "text-gray-400"}`}>
          {loading ? "Đang tải..." : value ? `${selectedName} (#${value})` : placeholder}
        </span>
        {value && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="text-gray-400 hover:text-red-500 text-xs"
            title="Xóa lựa chọn"
          >✕</span>
        )}
      </button>
      {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-gray-100 flex items-center gap-2">
              <SearchIcon size={14} className="text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Tìm trong ${options.length} mục...`}
                className="flex-1 text-sm outline-none"
              />
            </div>
            <div className="max-h-64 overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-xs text-gray-400 text-center">Không tìm thấy</div>
              ) : filtered.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
                  className={`w-full text-left px-3 py-2 hover:bg-info-50 text-sm flex items-center justify-between ${o.id === value ? "bg-info-50 text-info font-medium" : "text-ink"}`}
                >
                  <span className="truncate">{o.name}</span>
                  <span className="text-[11px] text-gray-400 font-mono ml-2">#{o.id}</span>
                </button>
              ))}
              {options.length > filtered.length && q.trim() === "" && (
                <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100 text-center">
                  Hiển thị 200/{options.length} — gõ để tìm kiếm
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
