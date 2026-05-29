"use client";
import { useState } from "react";
import * as api from "@/lib/api";
import { Input } from "@/components/Input";

type Props = {
  value: api.Criteria;
  onChange: (next: api.Criteria) => void;
  compact?: boolean;
};

export function CriteriaEditor({ value, onChange, compact }: Props) {
  const w = value.weights;
  // % hiển thị (sum = 100). Mỗi lần slider đổi → recompute để tổng = 100.
  const total = Math.max(0.0001, w.traffic + w.commission + w.cookie);
  const pct = {
    traffic: Math.round((w.traffic / total) * 100),
    commission: Math.round((w.commission / total) * 100),
    cookie: Math.round((w.cookie / total) * 100),
  };

  function setWeight(key: "traffic" | "commission" | "cookie", newPct: number) {
    // Giữ tổng = 100 bằng cách phân bổ phần còn lại theo tỉ lệ 2 trục còn lại.
    const others = (["traffic", "commission", "cookie"] as const).filter((k) => k !== key);
    const remaining = Math.max(0, 100 - newPct);
    const otherSum = pct[others[0]] + pct[others[1]];
    let a = otherSum > 0 ? Math.round((pct[others[0]] / otherSum) * remaining) : remaining / 2;
    let b = remaining - a;
    const next = { traffic: 0, commission: 0, cookie: 0 } as api.Weights;
    // Lưu dạng 0-1 (sum=1) cho backend, UI sẽ normalize lại để hiển thị %.
    next[key] = newPct / 100;
    next[others[0]] = a / 100;
    next[others[1]] = b / 100;
    onChange({ ...value, weights: next });
  }

  function setThreshold<K extends keyof api.Thresholds>(key: K, v: number) {
    onChange({ ...value, thresholds: { ...value.thresholds, [key]: v } });
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-ink">Trọng số tiêu chí</h4>
          <span className="text-xs text-gray-400">Tổng luôn = 100%</span>
        </div>
        <div className="space-y-3">
          <WeightRow label="Traffic" color="bg-primary" pct={pct.traffic} onChange={(v) => setWeight("traffic", v)} />
          <WeightRow label="Commission" color="bg-cta" pct={pct.commission} onChange={(v) => setWeight("commission", v)} />
          <WeightRow label="Cookie" color="bg-amber-500" pct={pct.cookie} onChange={(v) => setWeight("cookie", v)} />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink mb-2">Ngưỡng tối thiểu</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumField label="Traffic / tháng" value={value.thresholds.min_traffic} onChange={(v) => setThreshold("min_traffic", v)} suffix="visits" placeholder="300000" />
          <NumField label="Commission" value={value.thresholds.min_commission} onChange={(v) => setThreshold("min_commission", v)} suffix="%" placeholder="15" />
          <NumField label="Cookie" value={value.thresholds.min_cookie_days} onChange={(v) => setThreshold("min_cookie_days", v)} suffix="ngày" placeholder="30" />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink mb-2">Khi program thiếu Traffic</h4>
        <div className="flex gap-2 flex-wrap">
          {(["zero", "ignore", "include"] as const).map((p) => (
            <button key={p} type="button" onClick={() => onChange({ ...value, missing_traffic_policy: p })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition
                ${value.missing_traffic_policy === p
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"}`}>
              {p === "zero" ? "Coi như 0" : p === "ignore" ? "Loại bỏ" : "Cho qua"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Hầu hết program crawl về chưa có traffic — chọn “Cho qua” để vẫn xếp hạng, hoặc nhập tay traffic trong từng program.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Nguồn (cách nhau dấu phẩy)</label>
          <Input value={value.sources.join(",")} onChange={(e) => onChange({ ...value, sources: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="goaffpro, openaffiliate" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Danh mục (cách nhau dấu phẩy)</label>
          <Input value={value.categories.join(",")} onChange={(e) => onChange({ ...value, categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Fashion, Beauty" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Từ khoá trong tên</label>
        <Input value={value.search} onChange={(e) => onChange({ ...value, search: e.target.value })} placeholder="vd: skincare" />
      </div>
    </div>
  );
}

function WeightRow({ label, color, pct, onChange }: { label: string; color: string; pct: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-semibold text-ink tabular-nums">{pct}%</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={100} value={pct} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary" />
        <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, suffix, placeholder }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; placeholder?: string }) {
  const [raw, setRaw] = useState(String(value || ""));
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      <div className="relative">
        <Input type="number" value={raw} placeholder={placeholder}
          onChange={(e) => { setRaw(e.target.value); onChange(Number(e.target.value) || 0); }} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}
