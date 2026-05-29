"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Play, Check, ExternalLink, Clock, CheckCircle2, XCircle, AlertTriangle, ImageIcon, RefreshCw, Filter, ChevronDown, ChevronUp, ListChecks, X, Search, Loader2, FlaskConical } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { SystemStatusBanner } from "@/components/SystemStatusBanner";
import { ConnectionTestPanel } from "@/components/ConnectionTestPanel";
import { useToast } from "@/lib/toast";

const STATUS_STYLE: Record<string, { variant: any; icon: any; label: string }> = {
  pending: { variant: "neutral", icon: Clock, label: "Chờ" },
  running: { variant: "info", icon: RefreshCw, label: "Đang chạy" },
  success: { variant: "success", icon: CheckCircle2, label: "Thành công" },
  partial: { variant: "warning", icon: AlertTriangle, label: "Một phần" },
  failed: { variant: "error", icon: XCircle, label: "Thất bại" },
  captcha: { variant: "warning", icon: AlertTriangle, label: "Captcha" },
  pending_verify: { variant: "warning", icon: AlertTriangle, label: "Chờ verify email" },
  error: { variant: "error", icon: XCircle, label: "Lỗi" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  const Icon = s.icon;
  return <Badge variant={s.variant}><Icon size={12} /> {s.label}</Badge>;
}

// Parse "30 days", "60d", "2 months", "1 year"... → số ngày. Khớp logic backend.
const COOKIE_RE = /(\d+)\s*(d|day|days|m|month|months|y|year|years|h|hour|hours)?/i;
function parseCookieDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = COOKIE_RE.exec(String(text));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || "d").toLowerCase();
  if (unit.startsWith("d")) return n;
  if (unit.startsWith("h")) return Math.max(1, Math.floor(n / 24));
  if (unit.startsWith("m")) return n * 30;
  if (unit.startsWith("y")) return n * 365;
  return n;
}

const SOURCE_OPTIONS = ["openaffiliate", "lovable", "goaffpro"];

// Nút test inline cho từng email/proxy ở list — bấm 1 nút riêng, không trigger select
function InlineTestButton({
  onTest, lastOk, lastError, title,
}: {
  onTest: () => Promise<{ ok: boolean; error?: string; ip?: string; inbox_count?: number; elapsed_ms?: number }>;
  lastOk?: boolean;
  lastError?: string;
  title?: string;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(
    lastOk === true ? { ok: true, text: "OK" }
    : lastOk === false ? { ok: false, text: lastError || "fail" }
    : null
  );
  async function run(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true);
    try {
      const r = await onTest();
      const text = r.ok
        ? (r.ip ? `OK · ${r.ip}` : r.inbox_count != null ? `OK · ${r.inbox_count} mail` : "OK")
        : (r.error || "fail");
      setRes({ ok: r.ok, text });
      push({ type: r.ok ? "success" : "error", message: `${title || "Test"}: ${text}` });
    } catch (err: any) {
      setRes({ ok: false, text: err?.message || "fail" });
      push({ type: "error", message: err?.message || "Test fail" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={res?.text || title || "Test kết nối"}
      className={[
        "text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition shrink-0",
        busy ? "opacity-60 cursor-wait" : "",
        res == null ? "bg-white border-gray-300 text-gray-600 hover:border-primary hover:text-primary"
          : res.ok ? "bg-emerald-50 border-emerald-300 text-emerald-700"
          : "bg-red-50 border-red-300 text-red-700",
      ].join(" ")}
    >
      {busy ? <Loader2 size={10} className="animate-spin" /> : <FlaskConical size={10} />}
      Test
    </button>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { push } = useToast();

  const [selectedPrograms, setSelectedPrograms] = useState<number[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedProxies, setSelectedProxies] = useState<string[]>([]);
  const [selectedInstructions, setSelectedInstructions] = useState<string[]>([]);
  const [selectedSmsProfile, setSelectedSmsProfile] = useState<string>("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [headless, setHeadless] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  // ---- Shortlist + filter state ----
  const [shortlistId, setShortlistId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fSearch, setFSearch] = useState("");
  const [fSources, setFSources] = useState<string[]>([]);
  const [fCategories, setFCategories] = useState<string[]>([]);
  const [fOnlyWithSignup, setFOnlyWithSignup] = useState(true);
  const [fCommissionMin, setFCommissionMin] = useState<string>("");
  const [fCommissionMax, setFCommissionMax] = useState<string>("");
  const [fTrafficMin, setFTrafficMin] = useState<string>("");
  const [fCookieMin, setFCookieMin] = useState<string>("");
  const [fSignupStatus, setFSignupStatus] = useState<"all" | "done" | "not_yet">("all");

  const shortlistsQ = useQuery({ queryKey: ["shortlists"], queryFn: api.listShortlists });
  const itemsQ = useQuery({
    queryKey: ["shortlist-items", shortlistId],
    queryFn: () => api.getShortlistItems(shortlistId as number),
    enabled: shortlistId != null,
  });
  const profilesQ = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const instructionsQ = useQuery({ queryKey: ["instructions"], queryFn: api.listInstructions });
  const emailsQ = useQuery({ queryKey: ["emails"], queryFn: api.listEmails });
  const proxiesQ = useQuery({ queryKey: ["proxies"], queryFn: api.listProxies });
  const smsProfilesQ = useQuery({ queryKey: ["sms-profiles"], queryFn: api.listSmsProfiles });
  const jobsQ = useQuery({
    queryKey: ["signup-jobs"],
    queryFn: api.listSignupJobs,
    refetchInterval: 3000,
  });

  // Auto-pick shortlist đầu tiên khi load xong
  useEffect(() => {
    if (shortlistId == null && shortlistsQ.data && shortlistsQ.data.length > 0) {
      setShortlistId(shortlistsQ.data[0].id);
    }
  }, [shortlistsQ.data, shortlistId]);

  // Trạng thái expand của batch trong lịch sử
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Group jobs theo batch_id để hiện thống kê gộp
  const jobGroups = useMemo(() => {
    const jobs = jobsQ.data || [];
    const batchMap = new Map<string, api.SignupJob[]>();
    for (const j of jobs) {
      if (j.batch_id) {
        if (!batchMap.has(j.batch_id)) batchMap.set(j.batch_id, []);
        batchMap.get(j.batch_id)!.push(j);
      }
    }
    const seen = new Set<string>();
    const result: Array<{ type: "batch"; batch_id: string; jobs: api.SignupJob[] } | { type: "job"; job: api.SignupJob }> = [];
    for (const j of jobs) {
      if (j.batch_id && !seen.has(j.batch_id)) {
        seen.add(j.batch_id);
        result.push({ type: "batch", batch_id: j.batch_id, jobs: batchMap.get(j.batch_id)! });
      } else if (!j.batch_id) {
        result.push({ type: "job", job: j });
      }
    }
    return result;
  }, [jobsQ.data]);

  // Bản đồ program_id → trạng thái đăng ký gần nhất (từ history jobs)
  const signedStatusMap = useMemo(() => {
    const map = new Map<number, string>();
    const jobs = jobsQ.data || [];
    // jobs đã sort desc theo id ở BE, duyệt ngược để giữ lần GẦN NHẤT
    for (let i = jobs.length - 1; i >= 0; i--) {
      for (const r of jobs[i].results || []) {
        if (r.program_id != null) map.set(r.program_id, r.status);
      }
    }
    return map;
  }, [jobsQ.data]);

  // Lấy raw programs từ shortlist items
  const rawPrograms = useMemo(() => {
    const items = itemsQ.data || [];
    return items.map((it) => it.program).filter((p): p is api.Program => !!p);
  }, [itemsQ.data]);

  // Danh sách category sẵn có trong shortlist hiện tại (dùng cho filter chip)
  const availableCategories = useMemo(() => {
    const s = new Set<string>();
    rawPrograms.forEach((p) => { if (p.category) s.add(p.category); });
    return Array.from(s).sort();
  }, [rawPrograms]);

  // Áp filter
  const programs = useMemo(() => {
    const cMin = fCommissionMin.trim() === "" ? null : Number(fCommissionMin);
    const cMax = fCommissionMax.trim() === "" ? null : Number(fCommissionMax);
    const tMin = fTrafficMin.trim() === "" ? null : Number(fTrafficMin);
    const kMin = fCookieMin.trim() === "" ? null : Number(fCookieMin);
    const q = fSearch.trim().toLowerCase();
    return rawPrograms.filter((p) => {
      if (fOnlyWithSignup && !(p.signup_url || p.url)) return false;
      if (q && !(`${p.name} ${p.source}`.toLowerCase().includes(q))) return false;
      if (fSources.length && !fSources.includes(p.source)) return false;
      if (fCategories.length && (!p.category || !fCategories.includes(p.category))) return false;
      if (cMin != null && !Number.isNaN(cMin) && (p.commission_value ?? -Infinity) < cMin) return false;
      if (cMax != null && !Number.isNaN(cMax) && (p.commission_value ?? Infinity) > cMax) return false;
      if (tMin != null && !Number.isNaN(tMin) && (p.traffic_score ?? -Infinity) < tMin) return false;
      if (kMin != null && !Number.isNaN(kMin)) {
        const d = parseCookieDays(p.cookie_duration);
        if (d == null || d < kMin) return false;
      }
      if (fSignupStatus !== "all") {
        const st = signedStatusMap.get(p.id);
        const done = st === "success" || st === "partial";
        if (fSignupStatus === "done" && !done) return false;
        if (fSignupStatus === "not_yet" && done) return false;
      }
      return true;
    });
  }, [rawPrograms, fOnlyWithSignup, fSearch, fSources, fCategories, fCommissionMin, fCommissionMax, fTrafficMin, fCookieMin, fSignupStatus, signedStatusMap]);

  const filteredIds = useMemo(() => programs.map((p) => p.id), [programs]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedPrograms.includes(id));
  const selectedProgramObjs = useMemo(() => {
    const map = new Map(rawPrograms.map((p) => [p.id, p]));
    return selectedPrograms.map((id) => map.get(id)).filter(Boolean) as api.Program[];
  }, [selectedPrograms, rawPrograms]);

  const toggleProgram = (id: number) =>
    setSelectedPrograms((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleProfile = (id: string) =>
    setSelectedProfiles((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleInArray = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const selectAllFiltered = () => {
    setSelectedPrograms((s) => Array.from(new Set([...s, ...filteredIds])));
  };
  const deselectAllFiltered = () => {
    const f = new Set(filteredIds);
    setSelectedPrograms((s) => s.filter((id) => !f.has(id)));
  };
  const resetFilters = () => {
    setFSearch(""); setFSources([]); setFCategories([]);
    setFOnlyWithSignup(true);
    setFCommissionMin(""); setFCommissionMax("");
    setFTrafficMin(""); setFCookieMin("");
    setFSignupStatus("all");
  };

  const create = useMutation({
    mutationFn: () => api.createSignupJob({
      program_ids: selectedPrograms,
      profile_ids: selectedProfiles,
      email_ids: selectedEmails,
      proxy_ids: selectedProxies,
      instruction_names: selectedInstructions,
      extra_prompt: extraPrompt || undefined,
      headless,
      sms_profile_id: selectedSmsProfile || undefined,
    }),
    onSuccess: (job) => {
      push({ type: "success", message: `Job #${job.id} đã khởi tạo.` });
      qc.invalidateQueries({ queryKey: ["signup-jobs"] });
      setActiveJobId(job.id);
      setSelectedPrograms([]);
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const activeJob = jobsQ.data?.find((j) => j.id === activeJobId)
    || (jobsQ.data && jobsQ.data.length > 0 ? jobsQ.data[0] : undefined);

  const canRun = selectedPrograms.length > 0 && selectedProfiles.length > 0 && !create.isPending;

  return (
    <div>
      <PageHeader
        title="Đăng ký tự động"
        description="AI Agent (Gemini 3 Flash) tự mở trình duyệt stealth, điền form, tự giải Cloudflare / reCAPTCHA / hCaptcha qua CapSolver. Nếu 1 profile fail → tự thử profile khác."
      />

      <SystemStatusBanner />
      <ConnectionTestPanel />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Programs picker — Shortlist + filters nâng cao */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="font-semibold flex items-center gap-2">
              <Bot size={18}/> 1. Chọn dự án trong tuyển chọn
              <Badge variant="neutral">{selectedPrograms.length} đã chọn</Badge>
            </h3>
            <div className="flex items-center gap-2">
              <label htmlFor="signup-shortlist" className="text-xs text-gray-500">Shortlist:</label>
              <select
                id="signup-shortlist"
                aria-label="Chọn shortlist"
                value={shortlistId ?? ""}
                onChange={(e) => { setShortlistId(e.target.value ? Number(e.target.value) : null); setSelectedPrograms([]); }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                {(shortlistsQ.data || []).length === 0 && <option value="">(chưa có shortlist)</option>}
                {(shortlistsQ.data || []).map((sl) => (
                  <option key={sl.id} value={sl.id}>{sl.name} ({sl.item_count})</option>
                ))}
              </select>
              <Button
                variant="secondary"
                onClick={() => setShowFilters((v) => !v)}
                aria-label="Bật / tắt bộ lọc"
                className="!px-2"
              >
                <Filter size={14}/> Lọc {showFilters ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              </Button>
            </div>
          </div>

          {/* Quick search row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                type="text"
                placeholder="Tìm theo tên hoặc source..."
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
            </div>
            <Button variant="secondary" onClick={selectAllFiltered} disabled={filteredIds.length === 0 || allFilteredSelected} className="!px-3" aria-label="Chọn tất cả theo bộ lọc">
              <ListChecks size={14}/> Chọn tất cả
            </Button>
            <Button variant="secondary" onClick={deselectAllFiltered} disabled={selectedPrograms.length === 0} className="!px-3" aria-label="Bỏ chọn tất cả">
              <X size={14}/> Bỏ chọn
            </Button>
          </div>

          {/* Advanced filters */}
          {showFilters && (
            <div className="border border-amber-100 bg-amber-50/40 rounded-lg p-3 mb-3 space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Source</div>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCE_OPTIONS.map((s) => {
                    const on = fSources.includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => setFSources((arr) => toggleInArray(arr, s))}
                        className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-300 hover:border-amber-400"}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {availableCategories.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">Category ({availableCategories.length})</div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {availableCategories.map((c) => {
                      const on = fCategories.includes(c);
                      return (
                        <button key={c} type="button"
                          onClick={() => setFCategories((arr) => toggleInArray(arr, c))}
                          className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-300 hover:border-amber-400"}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Commission min (%)</label>
                  <input type="number" min={0} step="0.1" placeholder="0" aria-label="Commission tối thiểu" value={fCommissionMin} onChange={(e) => setFCommissionMin(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Commission max (%)</label>
                  <input type="number" min={0} step="0.1" placeholder="100" aria-label="Commission tối đa" value={fCommissionMax} onChange={(e) => setFCommissionMax(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Traffic score min</label>
                  <input type="number" min={0} step="1000" placeholder="300000" aria-label="Traffic score tối thiểu" value={fTrafficMin} onChange={(e) => setFTrafficMin(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cookie ≥ (ngày)</label>
                  <input type="number" min={0} step="1" placeholder="30" aria-label="Cookie tối thiểu (ngày)" value={fCookieMin} onChange={(e) => setFCookieMin(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"/>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={fOnlyWithSignup} onChange={(e) => setFOnlyWithSignup(e.target.checked)} className="accent-amber-500"/>
                  Chỉ hiện dự án có signup_url
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Trạng thái đăng ký:</span>
                  {([
                    { v: "all", l: "Tất cả" },
                    { v: "not_yet", l: "Chưa đăng ký" },
                    { v: "done", l: "Đã đăng ký" },
                  ] as const).map((opt) => (
                    <button key={opt.v} type="button"
                      onClick={() => setFSignupStatus(opt.v)}
                      className={`px-2 py-1 rounded border text-xs ${fSignupStatus === opt.v ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-300 hover:border-amber-400"}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={resetFilters}
                  className="ml-auto text-xs text-amber-600 hover:underline">
                  Reset bộ lọc
                </button>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="text-xs text-gray-500 mb-2">
            Hiển thị <span className="font-medium text-gray-700">{programs.length}</span> / {rawPrograms.length} dự án trong shortlist
            {selectedPrograms.length > 0 && <> · đã chọn <span className="font-medium text-amber-600">{selectedPrograms.length}</span></>}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y">
            {shortlistId == null && (
              <div className="p-4 text-sm text-gray-500">
                Chưa có shortlist. <a className="text-amber-600 underline" href="/shortlists">Tạo shortlist</a> trước để chọn dự án đăng ký.
              </div>
            )}
            {shortlistId != null && itemsQ.isLoading && <div className="p-4 text-sm text-gray-500">Đang tải...</div>}
            {shortlistId != null && !itemsQ.isLoading && rawPrograms.length === 0 && (
              <div className="p-4 text-sm text-gray-500">
                Shortlist này chưa có dự án. Vào <a className="text-amber-600 underline" href="/shortlists">/shortlists</a> để auto-fill hoặc thêm tay.
              </div>
            )}
            {shortlistId != null && !itemsQ.isLoading && rawPrograms.length > 0 && programs.length === 0 && (
              <div className="p-4 text-sm text-gray-500">Không có dự án khớp bộ lọc.</div>
            )}
            {programs.map((p) => {
              const selected = selectedPrograms.includes(p.id);
              const signedSt = signedStatusMap.get(p.id);
              const done = signedSt === "success" || signedSt === "partial";
              return (
                <div key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-amber-50 transition ${selected ? "bg-amber-50" : ""}`}>
                  <button
                    type="button"
                    onClick={() => toggleProgram(p.id)}
                    aria-label={selected ? `Bỏ chọn ${p.name}` : `Chọn ${p.name}`}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <span className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                      {selected && <Check size={14} className="text-white"/>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{p.name}</span>
                        {done && <Badge variant="success">đã ĐK</Badge>}
                        {signedSt && !done && <Badge variant="warning">{signedSt}</Badge>}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {p.source}
                        {p.category && <> · {p.category}</>}
                        {p.commission_value != null && <> · {p.commission_value}%</>}
                        {p.traffic_score != null && <> · traffic {Math.round(p.traffic_score).toLocaleString()}</>}
                        {p.cookie_duration && <> · cookie {p.cookie_duration}</>}
                      </span>
                    </span>
                  </button>
                  {(p.signup_url || p.url) && (
                    <a
                      href={p.signup_url || p.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-amber-600 hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
                      aria-label={`Mở link đăng ký ${p.name}`}
                    >
                      <ExternalLink size={12}/>
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected sidebar */}
          {selectedProgramObjs.length > 0 && (
            <div className="mt-3 border border-amber-200 bg-amber-50/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-amber-700">Đã chọn ({selectedProgramObjs.length})</span>
                <button type="button" onClick={() => setSelectedPrograms([])} className="text-xs text-gray-500 hover:text-red-600">Xoá hết</button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedProgramObjs.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 bg-white border border-amber-300 rounded-full pl-2 pr-1 py-0.5 text-xs">
                    <span className="max-w-[160px] truncate">{p.name}</span>
                    <button type="button" onClick={() => toggleProgram(p.id)} aria-label={`Bỏ ${p.name}`}
                      className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-amber-100 text-gray-500">
                      <X size={11}/>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Profiles + options */}
        <Card>
          <h3 className="font-semibold mb-3">2. Chọn profile ({selectedProfiles.length})</h3>
          <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg divide-y mb-3">
            {profilesQ.isLoading && <div className="p-3 text-sm text-gray-500">Đang tải...</div>}
            {profilesQ.data?.length === 0 && (
              <div className="p-4 text-sm text-gray-500">
                Chưa có profile. <a className="text-amber-600 underline" href="/profiles">Tạo profile</a> trước.
              </div>
            )}
            {profilesQ.data?.map((p) => {
              const selected = selectedProfiles.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggleProfile(p.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-amber-50 ${selected ? "bg-amber-50" : ""}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selected ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                    {selected && <Check size={12} className="text-white"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.full_name || p.id}</div>
                    <div className="text-xs text-gray-400 font-mono truncate">{p.id}</div>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedProfiles.length > 1 && (
            <p className="text-xs text-gray-500 mb-3">Nhiều profile → agent sẽ tự fallback nếu profile đầu fail.</p>
          )}

          <h3 className="font-semibold mb-2">3. Email ({selectedEmails.length})</h3>
          <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y mb-3">
            {emailsQ.isLoading && <div className="p-3 text-sm text-gray-500">Đang tải...</div>}
            {emailsQ.data?.length === 0 && (
              <div className="p-4 text-sm text-gray-500">
                Chưa có email. <a className="text-amber-600 underline" href="/library?tab=email">Thêm email</a> trước.
              </div>
            )}
            {emailsQ.data?.map((e) => {
              const sel = selectedEmails.includes(e.id);
              return (
                <div key={e.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-amber-50 ${sel ? "bg-amber-50" : ""}`}>
                  <button type="button"
                    onClick={() => setSelectedEmails((cur) => sel ? cur.filter((x) => x !== e.id) : [...cur, e.id])}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${sel ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                      {sel && <Check size={12} className="text-white"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{e.address}</div>
                      <div className="text-[11px] text-gray-500 flex gap-2">
                        <span>{e.provider || "—"}</span>
                        {e.has_app_password && <span className="text-emerald-600">APP</span>}
                        {e.has_totp && <span className="text-blue-600">2FA</span>}
                      </div>
                    </div>
                  </button>
                  <InlineTestButton
                    title={`Test IMAP ${e.address}`}
                    lastOk={e.last_test_result === "ok" ? true : e.last_test_result === "fail" ? false : undefined}
                    lastError={e.last_test_error}
                    onTest={async () => {
                      const r = await api.testEmail(e.id);
                      qc.invalidateQueries({ queryKey: ["emails"] });
                      return { ok: r.ok, error: r.error, inbox_count: r.inbox_count, elapsed_ms: r.elapsed_ms };
                    }}
                  />
                </div>
              );
            })}
          </div>

          <h3 className="font-semibold mb-2">4. Proxy ({selectedProxies.length})</h3>
          <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y mb-3">
            {proxiesQ.isLoading && <div className="p-3 text-sm text-gray-500">Đang tải...</div>}
            {proxiesQ.data?.length === 0 && (
              <div className="p-4 text-sm text-gray-500">
                Chưa có proxy. <a className="text-amber-600 underline" href="/library?tab=proxy">Thêm proxy</a> trước.
              </div>
            )}
            {proxiesQ.data?.map((px) => {
              const sel = selectedProxies.includes(px.id);
              return (
                <div key={px.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-amber-50 ${sel ? "bg-amber-50" : ""}`}>
                  <button type="button"
                    onClick={() => setSelectedProxies((cur) => sel ? cur.filter((x) => x !== px.id) : [...cur, px.id])}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${sel ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                      {sel && <Check size={12} className="text-white"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate">{px.host}:{px.port}</div>
                      <div className="text-[11px] text-gray-500 flex gap-2">
                        <span>{px.country || "—"}</span>
                        <span>{px.type}</span>
                        {px.last_test_result === "ok" && <span className="text-emerald-600">OK · {px.last_test_ip}</span>}
                      </div>
                    </div>
                  </button>
                  <InlineTestButton
                    title={`Test proxy ${px.host}:${px.port}`}
                    lastOk={px.last_test_result === "ok" ? true : px.last_test_result === "fail" ? false : undefined}
                    onTest={async () => {
                      const r = await api.testProxy(px.id);
                      qc.invalidateQueries({ queryKey: ["proxies"] });
                      return { ok: r.ok, error: r.error, ip: r.ip, elapsed_ms: r.elapsed_ms };
                    }}
                  />
                </div>
              );
            })}
          </div>

          <h3 className="font-semibold mb-2">5. SMS Profile (tuỳ chọn)</h3>
          <div className="mb-3">
            <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-lg divide-y">
              <button
                type="button"
                onClick={() => setSelectedSmsProfile("")}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-amber-50 ${!selectedSmsProfile ? "bg-amber-50" : ""}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!selectedSmsProfile ? "border-amber-500" : "border-gray-300"}`}>
                  {!selectedSmsProfile && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">Mặc định</div>
                  <div className="text-[11px] text-gray-500">Theo <code>.env</code> hoặc preset SMS của từng program</div>
                </div>
              </button>
              {(smsProfilesQ.data || []).map((p) => {
                const sel = selectedSmsProfile === p.id;
                const okTest = p.last_test_result === "ok";
                const failTest = p.last_test_result === "fail";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedSmsProfile(p.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-amber-50 ${sel ? "bg-amber-50" : ""}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sel ? "border-amber-500" : "border-gray-300"}`}>
                      {sel && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink truncate">{p.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {p.country_name || `#${p.country_id}`} · {p.service_name || `#${p.service_id}`}
                      </div>
                    </div>
                    {okTest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">OK</span>}
                    {failTest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shrink-0">Fail</span>}
                    {!okTest && !failTest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 shrink-0">Chưa test</span>}
                  </button>
                );
              })}
              {(smsProfilesQ.data || []).length === 0 && (
                <div className="p-3 text-xs text-gray-500">
                  Chưa có profile nào. <a className="text-amber-600 underline" href="/library?tab=sms">Tạo profile</a> để chọn combo country/service nhanh.
                </div>
              )}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Override SMS country/service cho cả job — thống nhất 1 combo cho mọi program.{" "}
              <a className="text-amber-600 underline" href="/library?tab=sms">Quản lý profiles</a>
            </div>
          </div>

          <h3 className="font-semibold mb-2">6. Tuỳ chọn</h3>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hướng dẫn (chọn nhiều — sẽ gộp lại)</label>
          <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y mb-3">
            {instructionsQ.data?.length === 0 && (
              <div className="p-3 text-xs text-gray-500">Chưa có hướng dẫn. <a className="text-amber-600 underline" href="/library?tab=instruction">Tạo hướng dẫn</a>.</div>
            )}
            {instructionsQ.data?.map((i) => {
              const sel = selectedInstructions.includes(i.name);
              return (
                <button key={i.name} type="button"
                  onClick={() => setSelectedInstructions((cur) => sel ? cur.filter((x) => x !== i.name) : [...cur, i.name])}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-amber-50 ${sel ? "bg-amber-50" : ""}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${sel ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                    {sel && <Check size={12} className="text-white"/>}
                  </div>
                  <div className="text-sm truncate">{i.name}</div>
                </button>
              );
            })}
          </div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Gợi ý thêm cho agent</label>
          <textarea value={extraPrompt} onChange={(e) => setExtraPrompt(e.target.value)} rows={3}
            placeholder="VD: Nếu được hỏi traffic source, chọn TikTok..."
            className="w-full mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"/>

          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} className="accent-amber-500"/>
            Headless (ẩn cửa sổ) — bỏ chọn để xem trực tiếp
          </label>

          <Button className="w-full" disabled={!canRun} loading={create.isPending} onClick={() => create.mutate()}>
            <Play size={16}/> Bắt đầu đăng ký
          </Button>
        </Card>
      </div>

      {/* Job detail */}
      {activeJob && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <h3 className="font-semibold">Job #{activeJob.id}</h3>
              <p className="text-xs text-gray-500">
                {activeJob.total} program × {activeJob.profile_ids.length} profile · ok {activeJob.succeeded} / fail {activeJob.failed}
              </p>
            </div>
            <StatusBadge status={activeJob.status}/>
          </div>
          {/* Thống kê tổng quan: progress bar + % */}
          {(() => {
            const total = activeJob.succeeded + activeJob.failed;
            const pct = total > 0 ? Math.round((activeJob.succeeded / total) * 100) : 0;
            const pending = Math.max(0, activeJob.total - total);
            return (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600">Tỉ lệ thành công</span>
                  <span className="font-semibold">
                    <span className="text-emerald-600">{activeJob.succeeded} OK</span>
                    <span className="text-gray-400"> · </span>
                    <span className="text-red-600">{activeJob.failed} fail</span>
                    {pending > 0 && (
                      <>
                        <span className="text-gray-400"> · </span>
                        <span className="text-amber-600">{pending} chờ</span>
                      </>
                    )}
                    <span className="text-gray-400"> · </span>
                    <span className="text-gray-700">{pct}%</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${activeJob.total > 0 ? (activeJob.succeeded / activeJob.total) * 100 : 0}%` }}/>
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${activeJob.total > 0 ? (activeJob.failed / activeJob.total) * 100 : 0}%` }}/>
                </div>
              </div>
            );
          })()}
          {activeJob.error && <div className="text-sm text-red-600 mb-3 whitespace-pre-wrap">{activeJob.error}</div>}
          <div className="space-y-2">
            {activeJob.results.map((r, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium">Program #{r.program_id} · profile {r.profile_id || "—"}</div>
                  <StatusBadge status={r.status}/>
                </div>
                {r.message && <div className="text-gray-600 mb-1 whitespace-pre-wrap">{r.message}</div>}
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  {r.steps != null && <span>Steps: {r.steps}</span>}
                  {r.duration_sec != null && <span>{Math.round(r.duration_sec)}s</span>}
                  {r.final_url && <a className="text-amber-600 hover:underline inline-flex items-center gap-1" href={r.final_url} target="_blank" rel="noreferrer">URL <ExternalLink size={11}/></a>}
                  {r.screenshot && <a className="inline-flex items-center gap-1 text-amber-600 hover:underline" href={`/api/signup/screenshots/${r.screenshot.split("/").pop()}`} target="_blank" rel="noreferrer"><ImageIcon size={12}/> Screenshot</a>}
                </div>
                {r.screenshot && (
                  <a href={`/api/signup/screenshots/${r.screenshot.split("/").pop()}`} target="_blank" rel="noreferrer" className="block mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/signup/screenshots/${r.screenshot.split("/").pop()}`} alt="screenshot" className="w-full max-w-md border border-gray-200 rounded" />
                  </a>
                )}
              </div>
            ))}
            {activeJob.results.length === 0 && activeJob.status === "running" && (
              <div className="text-sm text-gray-500">Agent đang xử lý, vui lòng đợi...</div>
            )}
          </div>
        </Card>
      )}

      {/* Recent jobs */}
      <Card>
        <h3 className="font-semibold mb-3">Lịch sử jobs</h3>
        {!jobsQ.data || jobsQ.data.length === 0 ? (
          <EmptyState icon={Bot} title="Chưa có job nào" description="Tạo job đầu tiên ở trên."/>
        ) : (
          <div className="divide-y">
            {jobGroups.map((group) => {
              if (group.type === "job") {
                const j = group.job;
                const tot = j.succeeded + j.failed;
                const pct = tot > 0 ? Math.round((j.succeeded / tot) * 100) : 0;
                return (
                  <button key={j.id} type="button" onClick={() => setActiveJobId(j.id)}
                    className={`w-full flex items-center justify-between py-2 px-2 text-left hover:bg-amber-50 rounded ${activeJobId === j.id ? "bg-amber-50" : ""}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">Job #{j.id} · {j.total} program × {j.profile_ids.length} profile</div>
                      <div className="text-xs text-gray-500">{j.created_at}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs">
                        <span className="text-emerald-600 font-medium">{j.succeeded}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-red-600 font-medium">{j.failed}</span>
                        {tot > 0 && <span className="text-gray-500 ml-1">({pct}%)</span>}
                      </span>
                      <StatusBadge status={j.status}/>
                    </div>
                  </button>
                );
              }

              // ---- BATCH row ----
              const { batch_id, jobs } = group;
              const batchOk = jobs.reduce((s, j) => s + j.succeeded, 0);
              const batchFail = jobs.reduce((s, j) => s + j.failed, 0);
              const batchTotal = jobs.reduce((s, j) => s + j.total, 0);
              const batchPct = (batchOk + batchFail) > 0 ? Math.round((batchOk / (batchOk + batchFail)) * 100) : 0;
              const allDone = jobs.every((j) => !["pending","running"].includes(j.status));
              const anyRunning = jobs.some((j) => j.status === "running");
              const batchStatus = !allDone ? (anyRunning ? "running" : "pending")
                : batchFail === 0 ? "success"
                : batchOk === 0 ? "failed"
                : "partial";
              const isExpanded = expandedBatches.has(batch_id);
              return (
                <div key={batch_id}>
                  {/* Batch header */}
                  <button type="button"
                    onClick={() => setExpandedBatches((prev) => {
                      const next = new Set(prev);
                      next.has(batch_id) ? next.delete(batch_id) : next.add(batch_id);
                      return next;
                    })}
                    className="w-full flex items-center justify-between py-2 px-2 text-left hover:bg-amber-50 rounded">
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400 shrink-0"/> : <ChevronDown size={14} className="text-gray-400 shrink-0"/>}
                      <div>
                        <div className="text-sm font-semibold">Batch · {jobs.length} jobs · {batchTotal} programs</div>
                        <div className="text-xs text-gray-500">{jobs[0]?.created_at}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs">
                        <span className="text-emerald-600 font-medium">{batchOk}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-red-600 font-medium">{batchFail}</span>
                        {(batchOk + batchFail) > 0 && <span className="text-gray-500 ml-1">({batchPct}%)</span>}
                      </span>
                      <StatusBadge status={batchStatus}/>
                    </div>
                  </button>
                  {/* Expanded: child jobs */}
                  {isExpanded && (
                    <div className="ml-6 border-l border-gray-200 divide-y mb-1">
                      {jobs.map((j) => {
                        const tot = j.succeeded + j.failed;
                        const pct = tot > 0 ? Math.round((j.succeeded / tot) * 100) : 0;
                        return (
                          <button key={j.id} type="button" onClick={() => setActiveJobId(j.id)}
                            className={`w-full flex items-center justify-between py-1.5 px-2 text-left hover:bg-amber-50 ${activeJobId === j.id ? "bg-amber-50" : ""}`}>
                            <div className="min-w-0">
                              <div className="text-xs font-medium">Job #{j.id} · prog {j.program_ids[0]}</div>
                              {j.results?.[0] && (
                                <div className="text-[11px] text-gray-500 truncate max-w-[220px]">
                                  {j.results[0].message || `prog #${j.results[0].program_id}`}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs">
                                <span className="text-emerald-600 font-medium">{j.succeeded}</span>
                                <span className="text-gray-400">/</span>
                                <span className="text-red-600 font-medium">{j.failed}</span>
                                {tot > 0 && <span className="text-gray-500 ml-1">({pct}%)</span>}
                              </span>
                              <StatusBadge status={j.status}/>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
