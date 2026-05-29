"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, ExternalLink, Trash2, Briefcase, Eye, Download, Upload,
  ArrowUp, ArrowDown, ArrowUpDown, Sparkles, Filter, X,
  Gauge, Loader2, ChevronDown, AlertCircle, Plus,
} from "lucide-react";
import * as api from "@/lib/api";
import type { TrafficDetails } from "@/lib/api";
import { useTrafficJob } from "@/lib/traffic-job-context";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Input, Select } from "@/components/Input";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Pagination } from "@/components/Pagination";
import { Modal } from "@/components/Modal";
import { ProgramsTrafficPanel } from "@/components/ProgramsTrafficPanel";
import { ProgramTrafficDetail } from "@/components/ProgramTrafficDetail";
import { useToast } from "@/lib/toast";

const SOURCE_COLORS: Record<string, "primary" | "info" | "warning"> = {
  openaffiliate: "primary",
  lovable: "info",
  goaffpro: "warning",
};

type SortKey = "name" | "source" | "category" | "commission_value" | "crawled_at";
type Order = "asc" | "desc";

export default function ProgramsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [source, setSource] = useState(() => searchParams.get("source") || "");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [minComm, setMinComm] = useState("");
  const [maxComm, setMaxComm] = useState("");
  const [minTraffic, setMinTraffic] = useState("");
  const [minCookieDays, setMinCookieDays] = useState("");
  const [hasTraffic, setHasTraffic] = useState<"" | "yes" | "no">("");
  const [hasSignup, setHasSignup] = useState<"" | "yes" | "no">("");
  // directory_status filter — generic cho mọi source. Mặc định "active" khi source = lovable/openaffiliate/goaffpro.
  const [directoryStatus, setDirectoryStatus] = useState<"" | "active" | "inactive">(
    () => (["lovable", "openaffiliate", "goaffpro"].includes(searchParams.get("source") || "") ? "active" : "")
  );
  // Filter đặc thù theo nguồn
  const [networks, setNetworks] = useState<string[]>([]);          // openaffiliate
  const [approval, setApproval] = useState<"" | "auto" | "manual">(""); // openaffiliate
  const [registrationsOpen, setRegistrationsOpen] = useState<"" | "yes" | "no">(""); // goaffpro
  const [payoutCurrency, setPayoutCurrency] = useState("");        // openaffiliate/goaffpro
  const [payoutFrequency, setPayoutFrequency] = useState("");      // openaffiliate
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<SortKey>("crawled_at");
  const [order, setOrder] = useState<Order>("desc");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<api.Program | null>(null);
  const [slDialogOpen, setSlDialogOpen] = useState(false);  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanSkipExisting, setScanSkipExisting] = useState(true);
  const [scanMonths, setScanMonths] = useState(3);
  const [scanConcurrency, setScanConcurrency] = useState(2);
  const {
    jobId: trafficJobId,
    setJobId: setTrafficJobId,
    job: trafficJob,
    isRunning: trafficJobRunning,
  } = useTrafficJob();
  const [slChosen, setSlChosen] = useState<number | null>(null);
  const [slCreating, setSlCreating] = useState(false);
  const [slNewName, setSlNewName] = useState("");
  const [importing, setImporting] = useState(false);

  const importCsv = useMutation({
    mutationFn: (file: File) => api.importProgramsCsv(file),
    onSuccess: (r) => {
      push({
        type: r.errors.length ? "info" : "success",
        title: "Import xong",
        message: `Đã lưu ${r.saved} program${r.skipped ? `, bỏ qua ${r.skipped} dòng lỗi` : ""}.`,
      });
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => push({ type: "error", title: "Import thất bại", message: e.message }),
    onSettled: () => setImporting(false),
  });

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      setImporting(true);
      importCsv.mutate(f);
    };
    input.click();
  };

  // Sync ?source=... khi user đổi dropdown (giữ URL đồng bộ, dễ share link)
  useEffect(() => {
    const current = searchParams.get("source") || "";
    if (current === source) return;
    const params = new URLSearchParams(searchParams.toString());
    if (source) params.set("source", source);
    else params.delete("source");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [source, pathname, router, searchParams]);

  // Sync state khi URL ?source thay đổi từ ngoài (nav từ /sources, back/forward…)
  useEffect(() => {
    const next = searchParams.get("source") || "";
    setSource((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  // Khi source đổi → reset filter đặc thù + mặc định "active" cho directory_status.
  useEffect(() => {
    if (source) {
      setDirectoryStatus((prev) => (prev === "" ? "active" : prev));
    } else {
      setDirectoryStatus("");
    }
    // Reset filter đặc thù không còn hợp lệ
    if (source !== "openaffiliate") {
      setNetworks([]);
      setApproval("");
      setPayoutFrequency("");
    }
    if (source !== "goaffpro") {
      setRegistrationsOpen("");
    }
    if (source !== "openaffiliate" && source !== "goaffpro") {
      setPayoutCurrency("");
    }
  }, [source]);

  // Load facets (network/currency/frequency…) theo source — đổ vào dropdown đặc thù.
  const facetsQ = useQuery({
    queryKey: ["program-facets", source],
    queryFn: () => api.listProgramFacets(source || undefined),
    staleTime: 60_000,
  });

  // Mở preview dialog khi URL có ?focus=<id> (ví dụ: click vào notification)
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    const id = Number(focus);
    if (!Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await api.getProgram(id);
        if (!cancelled) setPreview(p);
      } catch {
        /* ignore */
      } finally {
        // Xoá param khỏi URL để không mở lại khi re-render
        const params = new URLSearchParams(searchParams.toString());
        params.delete("focus");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, pathname, router]);

  const filterPayload = useMemo<api.ProgramFilter>(() => ({
    source: source || undefined,
    category: category || undefined,
    search: search || undefined,
    min_commission: minComm ? Number(minComm) : undefined,
    max_commission: maxComm ? Number(maxComm) : undefined,
    min_traffic: minTraffic ? Number(minTraffic) : undefined,
    min_cookie_days: minCookieDays ? Number(minCookieDays) : undefined,
    has_traffic: hasTraffic === "yes" ? true : hasTraffic === "no" ? false : undefined,
    has_signup: hasSignup === "yes" ? true : hasSignup === "no" ? false : undefined,
    directory_status: directoryStatus || undefined,
    networks: networks.length ? networks : undefined,
    approval: approval || undefined,
    registrations_open: registrationsOpen === "yes" ? true : registrationsOpen === "no" ? false : undefined,
    payout_currency: payoutCurrency || undefined,
    payout_frequency: payoutFrequency || undefined,
  }), [source, category, search, minComm, maxComm, minTraffic, minCookieDays, hasTraffic, hasSignup, directoryStatus, networks, approval, registrationsOpen, payoutCurrency, payoutFrequency]);

  const q = useQuery({
    queryKey: ["programs", filterPayload, page, pageSize, sortBy, order],
    queryFn: () =>
      api.listPrograms({
        ...filterPayload,
        page,
        page_size: pageSize,
        sort_by: sortBy,
        order,
      }),
  });

  const shortlistsQ = useQuery({ queryKey: ["shortlists"], queryFn: api.listShortlists });

  const chartQ = useQuery({
    queryKey: ["programs-traffic-chart", filterPayload],
    queryFn: () =>
      api.listPrograms({
        ...filterPayload,
        page: 1,
        page_size: 120,
        sort_by: "traffic_score",
        order: "desc",
      }),
    staleTime: 20_000,
  });

  const cats = useQuery({
    queryKey: ["program-categories", source],
    queryFn: () => api.listProgramCategories(source || undefined),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteProgram(id),
    onSuccess: () => {
      push({ type: "success", message: "Đã xoá program." });
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const bulkDel = useMutation({
    mutationFn: (ids: number[]) => api.bulkDeletePrograms(ids),
    onSuccess: (r) => {
      push({ type: "success", message: `Đã xoá ${r.deleted} program.` });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const bulkScan = useMutation({
    mutationFn: ({ ids, skip_existing, months, concurrency }: { ids: number[]; skip_existing: boolean; months: number; concurrency: number }) =>
      api.createTrafficScanJob(ids, skip_existing, months, concurrency),
    onSuccess: (job) => {
      setTrafficJobId(job.id);
      push({ type: "info", message: `Đã đưa ${job.total} dự án vào hàng đợi quét traffic (job #${job.id}).` });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  // Poll + toast khi job kết thúc đã được lift lên TrafficJobProvider (xem lib/traffic-job-context.tsx)

  const createShortlistMut = useMutation({
    mutationFn: (name: string) => api.createShortlist({ name, criteria: api.DEFAULT_CRITERIA }),
    onSuccess: (sl) => {
      push({ type: "success", message: `Đã tạo shortlist "${sl.name}"` });
      qc.invalidateQueries({ queryKey: ["shortlists"] });
      setSlChosen(sl.id);
      setSlCreating(false);
      setSlNewName("");
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const bulkAddToShortlist = useMutation({
    mutationFn: async ({ sid, ids }: { sid: number; ids: number[] }) => {
      const results = await Promise.allSettled(ids.map((pid) => api.addShortlistItem(sid, pid)));
      const added = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - added;
      return { added, failed };
    },
    onSuccess: (r) => {
      push({
        type: r.failed > 0 ? "info" : "success",
        message: r.failed > 0
          ? `Đã thêm ${r.added} program (${r.failed} bỏ qua — có thể đã tồn tại).`
          : `Đã thêm ${r.added} program vào shortlist.`,
      });
      setSelected(new Set());
      setSlDialogOpen(false);
      setSlChosen(null);
      qc.invalidateQueries({ queryKey: ["shortlists"] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const selectAllFilteredMut = useMutation({
    mutationFn: async () => {
      return await api.listProgramIds({
        ...filterPayload,
        sort_by: sortBy,
        order,
      });
    },
    onSuccess: (ids) => {
      setSelected(new Set(ids));
      push({ type: "success", message: `Đã chọn ${ids.length} dự án khớp bộ lọc.` });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const items = q.data?.items || [];
  const total = q.data?.total || 0;

  const allOnPageSelected = items.length > 0 && items.every((p) => selected.has(p.id));
  const someSelected = items.some((p) => selected.has(p.id));

  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) items.forEach((p) => next.delete(p.id));
    else items.forEach((p) => next.add(p.id));
    setSelected(next);
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const onHeaderSort = (key: SortKey) => {
    if (sortBy === key) setOrder(order === "asc" ? "desc" : "asc");
    else { setSortBy(key); setOrder("asc"); }
    setPage(1);
  };

  const sortIcon = (key: SortKey) =>
    sortBy !== key ? <ArrowUpDown size={12} className="opacity-40" /> :
    order === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;

  const exportFilteredUrl = useMemo(() =>
    api.exportProgramsCsvUrl({
      source: source || undefined,
      category: category || undefined,
      search: search || undefined,
      min_commission: minComm ? Number(minComm) : undefined,
      max_commission: maxComm ? Number(maxComm) : undefined,
      min_traffic: minTraffic ? Number(minTraffic) : undefined,
      min_cookie_days: minCookieDays ? Number(minCookieDays) : undefined,
      has_traffic: hasTraffic === "yes" ? true : hasTraffic === "no" ? false : undefined,
      has_signup: hasSignup === "yes" ? true : hasSignup === "no" ? false : undefined,
    }), [source, category, search, minComm, maxComm, minTraffic, minCookieDays, hasTraffic, hasSignup]);

  const exportSelectedUrl = api.exportProgramsCsvUrl({ ids: Array.from(selected) });

  const resetFilters = () => {
    setSource(""); setCategory(""); setSearch("");
    setMinComm(""); setMaxComm(""); setMinTraffic(""); setMinCookieDays("");
    setHasTraffic(""); setHasSignup(""); setDirectoryStatus("");
    setNetworks([]); setApproval(""); setRegistrationsOpen("");
    setPayoutCurrency(""); setPayoutFrequency("");
    setPage(1); setSortBy("crawled_at"); setOrder("desc");
  };
  const activeFilterCount =
    (source ? 1 : 0) + (category ? 1 : 0) + (search ? 1 : 0) +
    (minComm ? 1 : 0) + (maxComm ? 1 : 0) +
    (minTraffic ? 1 : 0) + (minCookieDays ? 1 : 0) +
    (hasTraffic ? 1 : 0) + (hasSignup ? 1 : 0) +
    (directoryStatus ? 1 : 0) +
    (networks.length ? 1 : 0) + (approval ? 1 : 0) +
    (registrationsOpen ? 1 : 0) +
    (payoutCurrency ? 1 : 0) + (payoutFrequency ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Chương trình"
        description={q.data ? `${total} program đã quét.` : "Đang tải..."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleImportClick} loading={importing} disabled={importing}>
              <Upload size={14} /> Nhập CSV
            </Button>
            {(() => {
              const selCount = selected.size;
              const hasSel = selCount > 0;
              const hasFilter = activeFilterCount > 0;
              const href = hasSel ? exportSelectedUrl : exportFilteredUrl;
              const label = hasSel
                ? `Xuất CSV (${selCount} đã chọn)`
                : hasFilter
                  ? `Xuất CSV (đang lọc · ${total})`
                  : `Xuất CSV (toàn bộ · ${total})`;
              const onClick = (e: React.MouseEvent) => {
                if (!hasSel && !hasFilter) {
                  if (!confirm(`Bạn đang xuất TOÀN BỘ ${total} program (không filter, không chọn). Tiếp tục?`)) {
                    e.preventDefault();
                  }
                }
              };
              return (
                <a href={href} onClick={onClick}>
                  <Button variant={hasSel ? "primary" : "secondary"} size="sm">
                    <Download size={14} /> {label}
                  </Button>
                </a>
              );
            })()}
          </div>
        }
      />

      <Card className="!p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder="Tìm theo tên..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={source} onChange={(e) => { setSource(e.target.value); setCategory(""); setPage(1); }} aria-label="Lọc nguồn">
            <option value="">Tất cả nguồn</option>
            <option value="openaffiliate">OpenAffiliate</option>
            <option value="lovable">Lovable</option>
            <option value="goaffpro">GoAffPro</option>
          </Select>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-primary/40 transition-colors cursor-pointer"
          >
            <Filter size={14} />
            Bộ lọc nâng cao
            {activeFilterCount > 0 && (
              <Badge variant="primary" className="!px-1.5 !py-0 !text-[10px] !min-w-[18px]">{activeFilterCount}</Badge>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Lọc category">
                <option value="">Tất cả category</option>
                {(cats.data || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Hoa hồng tối thiểu (%)</label>
              <Input type="number" min={0} placeholder="VD: 15" value={minComm}
                onChange={(e) => { setMinComm(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Hoa hồng tối đa (%)</label>
              <Input type="number" min={0} placeholder="VD: 80" value={maxComm}
                onChange={(e) => { setMaxComm(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Traffic tối thiểu/tháng</label>
              <Input type="number" min={0} placeholder="VD: 300000" value={minTraffic}
                onChange={(e) => { setMinTraffic(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Cookie tối thiểu (ngày)</label>
              <Input type="number" min={0} placeholder="VD: 30" value={minCookieDays}
                onChange={(e) => { setMinCookieDays(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Dữ liệu traffic</label>
              <Select value={hasTraffic} onChange={(e) => { setHasTraffic(e.target.value as "" | "yes" | "no"); setPage(1); }} aria-label="Lọc theo traffic">
                <option value="">Tất cả</option>
                <option value="yes">Đã có traffic</option>
                <option value="no">Chưa quét traffic</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Link đăng ký</label>
              <Select value={hasSignup} onChange={(e) => { setHasSignup(e.target.value as "" | "yes" | "no"); setPage(1); }} aria-label="Lọc theo signup">
                <option value="">Tất cả</option>
                <option value="yes">Có link signup</option>
                <option value="no">Chưa có signup</option>
              </Select>
            </div>
            {source && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Trạng thái directory</label>
                <Select
                  value={directoryStatus}
                  onChange={(e) => { setDirectoryStatus(e.target.value as "" | "active" | "inactive"); setPage(1); }}
                  aria-label="Lọc theo directory status"
                >
                  <option value="active">Active / Verified / Auto-approve</option>
                  <option value="inactive">Inactive / Closed / Manual</option>
                  <option value="">Tất cả</option>
                </Select>
              </div>
            )}

            {/* Filter đặc thù — OpenAffiliate */}
            {source === "openaffiliate" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Network (OpenAffiliate)</label>
                  <Select
                    value={networks[0] || ""}
                    onChange={(e) => { setNetworks(e.target.value ? [e.target.value] : []); setPage(1); }}
                    aria-label="Lọc theo network"
                  >
                    <option value="">Tất cả network</option>
                    {(facetsQ.data?.networks || []).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Duyệt đơn (OpenAffiliate)</label>
                  <Select
                    value={approval}
                    onChange={(e) => { setApproval(e.target.value as "" | "auto" | "manual"); setPage(1); }}
                    aria-label="Lọc theo approval"
                  >
                    <option value="">Tất cả</option>
                    <option value="auto">Tự động</option>
                    <option value="manual">Thủ công</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Chu kỳ payout</label>
                  <Select
                    value={payoutFrequency}
                    onChange={(e) => { setPayoutFrequency(e.target.value); setPage(1); }}
                    aria-label="Lọc theo payout frequency"
                  >
                    <option value="">Tất cả</option>
                    {(facetsQ.data?.frequencies || []).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            {/* Filter đặc thù — GoAffPro */}
            {source === "goaffpro" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Trạng thái đăng ký (GoAffPro)</label>
                <Select
                  value={registrationsOpen}
                  onChange={(e) => { setRegistrationsOpen(e.target.value as "" | "yes" | "no"); setPage(1); }}
                  aria-label="Lọc theo registrations open"
                >
                  <option value="">Tất cả</option>
                  <option value="yes">Đang mở đăng ký</option>
                  <option value="no">Đã đóng</option>
                </Select>
              </div>
            )}

            {/* Currency: chung cho openaffiliate + goaffpro */}
            {(source === "openaffiliate" || source === "goaffpro") && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Đơn vị payout</label>
                <Select
                  value={payoutCurrency}
                  onChange={(e) => { setPayoutCurrency(e.target.value); setPage(1); }}
                  aria-label="Lọc theo currency"
                >
                  <option value="">Tất cả</option>
                  {(facetsQ.data?.currencies || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span>Đang áp dụng <b className="text-ink">{activeFilterCount}</b> bộ lọc.</span>
            <button onClick={resetFilters} className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1">
              <X size={12} /> Xoá bộ lọc
            </button>
          </div>
        )}
      </Card>

      {items.length > 0 && <ProgramsTrafficPanel items={chartQ.data?.items || items} total={total} />}

      {selected.size > 0 && (
        <Card className="!p-3 mb-4 border-primary/30 bg-primary-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-ink">
              Đã chọn <b>{selected.size}</b> program.
              <button onClick={() => setSelected(new Set())} className="ml-3 text-primary hover:underline text-xs cursor-pointer">Bỏ chọn</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => setSlDialogOpen(true)}>
                <Sparkles size={14} /> Gửi vào Shortlist
              </Button>
              <Button size="sm" variant="secondary"
                onClick={() => { setScanSkipExisting(true); setScanDialogOpen(true); }}
                loading={bulkScan.isPending || trafficJobRunning}
                disabled={bulkScan.isPending || trafficJobRunning}
              >
                <Gauge size={14} /> Quét traffic
              </Button>
              <a href={exportSelectedUrl}>
                <Button size="sm" variant="secondary"><Download size={14} /> Xuất CSV đã chọn</Button>
              </a>
              <Button size="sm" variant="danger"
                onClick={() => {
                  if (confirm(`Xoá ${selected.size} program đã chọn?`)) bulkDel.mutate(Array.from(selected));
                }}
                loading={bulkDel.isPending}
              >
                <Trash2 size={14} /> Xoá hàng loạt
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        {!q.data || items.length === 0 ? (
          <EmptyState icon={Briefcase} title="Chưa có program nào" description='Vào "Nguồn quét" để bắt đầu một phiên crawl.' />
        ) : (
          <>
          <div className="px-3 sm:px-4 py-2.5 border-b border-gray-100 bg-canvas/60 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs sm:text-sm text-gray-600">
              {selected.size > 0 ? (
                <>Đã chọn <b className="text-ink">{selected.size}</b> / {total} dự án</>
              ) : (
                <>Tổng <b className="text-ink">{total}</b> dự án khớp bộ lọc</>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="lg:hidden"
                onClick={toggleAllOnPage}
                disabled={items.length === 0}
              >
                {allOnPageSelected ? "Bỏ chọn trang này" : `Chọn ${items.length} dự án trang này`}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => selectAllFilteredMut.mutate()}
                loading={selectAllFilteredMut.isPending}
                disabled={total === 0 || selected.size === total}
              >
                Chọn tất cả {total} dự án khớp lọc
              </Button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-primary hover:bg-white rounded-md transition-colors cursor-pointer"
                >
                  <X size={14} /> Bỏ chọn tất cả
                </button>
              )}
            </div>
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-xs uppercase text-gray-500 tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả trên trang"
                      checked={allOnPageSelected}
                      ref={(el) => { if (el) el.indeterminate = !allOnPageSelected && someSelected; }}
                      onChange={toggleAllOnPage}
                      className="cursor-pointer accent-primary"
                    />
                  </th>
                  <SortableTh label="Tên" k="name" current={sortBy} onSort={onHeaderSort} icon={sortIcon("name")} />
                  <SortableTh label="Nguồn" k="source" current={sortBy} onSort={onHeaderSort} icon={sortIcon("source")} />
                  <SortableTh label="Category" k="category" current={sortBy} onSort={onHeaderSort} icon={sortIcon("category")} />
                  <SortableTh label="Commission" k="commission_value" current={sortBy} onSort={onHeaderSort} icon={sortIcon("commission_value")} />
                  <th className="px-4 py-3 text-left">Payout</th>
                  <th className="px-4 py-3 text-left">Traffic/th</th>
                  <SortableTh label="Crawled" k="crawled_at" current={sortBy} onSort={onHeaderSort} icon={sortIcon("crawled_at")} />
                  <th className="px-4 py-3 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((p) => (
                  <tr key={p.id} className={`hover:bg-primary-50/40 transition-colors ${selected.has(p.id) ? "bg-primary-50/30" : ""}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${p.name}`}
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="cursor-pointer accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {p.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.logo_url}
                            alt=""
                            className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-canvas border border-gray-100"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : null}
                        <div className="min-w-0">
                          <button onClick={() => setPreview(p)} className="font-medium text-ink hover:text-primary text-left">
                            {p.name}
                          </button>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {p.directory_status && (
                              <Badge variant={/(verified|active|auto)/i.test(p.directory_status) ? "success" : "neutral"} className="!text-[10px] !py-0">
                                {p.directory_status}
                              </Badge>
                            )}
                            {p.directory_network && (
                              <Badge variant="info" className="!text-[10px] !py-0">{p.directory_network}</Badge>
                            )}
                          </div>
                          {(p.short_description || p.description) && (
                            <div className="text-xs text-gray-500 truncate max-w-md mt-0.5">{p.short_description || p.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={SOURCE_COLORS[p.source] || "neutral"}>{p.source}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.category || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{p.commission || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{p.payout || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {p.traffic_score ? p.traffic_score.toLocaleString("vi-VN") : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(p.crawled_at + "Z").toLocaleString("vi-VN")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setPreview(p)} className="p-1.5 text-gray-400 hover:text-primary" title="Xem chi tiết" aria-label="Xem chi tiết">
                          <Eye size={16} />
                        </button>
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-primary" title="Mở URL" aria-label="Mở URL">
                            <ExternalLink size={16} />
                          </a>
                        )}
                        <button
                          onClick={() => { if (confirm(`Xoá "${p.name}"?`)) del.mutate(p.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-600" title="Xoá" aria-label="Xoá"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-gray-100">
            {items.map((p) => (
              <div key={p.id} className={`p-3 sm:p-4 ${selected.has(p.id) ? "bg-primary-50/30" : "bg-white"}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${p.name}`}
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="mt-1 cursor-pointer accent-primary"
                  />
                  {p.logo_url ? (
                    <img
                      src={p.logo_url}
                      alt=""
                      className="w-9 h-9 rounded object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => setPreview(p)} className="font-semibold text-ink text-left break-words leading-snug">
                        {p.name}
                      </button>
                      <Badge variant={SOURCE_COLORS[p.source] || "neutral"}>{p.source}</Badge>
                    </div>

                    {(p.directory_status || p.directory_network) && (
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {p.directory_status && (
                          <Badge variant={/(verified|active|auto)/i.test(p.directory_status) ? "success" : "neutral"} className="!text-[10px] !py-0">
                            {p.directory_status}
                          </Badge>
                        )}
                        {p.directory_network && (
                          <Badge variant="neutral" className="!text-[10px] !py-0">
                            {p.directory_network}
                          </Badge>
                        )}
                      </div>
                    )}

                    {(p.short_description || p.description) && (
                      <div className="text-xs text-gray-500 line-clamp-2 mt-1">{p.short_description || p.description}</div>
                    )}

                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <span className="text-gray-500">Commission</span>
                      <span className="text-ink text-right truncate">{p.commission || "—"}</span>
                      <span className="text-gray-500">Traffic/th</span>
                      <span className="text-ink text-right">{p.traffic_score ? p.traffic_score.toLocaleString("vi-VN") : "—"}</span>
                      <span className="text-gray-500">Cookie</span>
                      <span className="text-ink text-right truncate">{p.cookie_duration || "—"}</span>
                      <span className="text-gray-500">Category</span>
                      <span className="text-ink text-right truncate">{p.category || "—"}</span>
                    </div>

                    <div className="mt-2 text-[11px] text-gray-400">
                      {new Date(p.crawled_at + "Z").toLocaleString("vi-VN")}
                    </div>

                    <div className="mt-2 flex items-center justify-end gap-1">
                      <button onClick={() => setPreview(p)} className="p-1.5 text-gray-400 hover:text-primary" title="Xem chi tiết" aria-label="Xem chi tiết">
                        <Eye size={16} />
                      </button>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-primary" title="Mở URL" aria-label="Mở URL">
                          <ExternalLink size={16} />
                        </a>
                      )}
                      <button
                        onClick={() => { if (confirm(`Xoá "${p.name}"?`)) del.mutate(p.id); }}
                        className="p-1.5 text-gray-400 hover:text-red-600" title="Xoá" aria-label="Xoá"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {q.data && total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        )}
      </Card>

      <ProgramDetailDrawer
        program={preview}
        onClose={() => setPreview(null)}
        onDeleted={() => { setPreview(null); qc.invalidateQueries({ queryKey: ["programs"] }); }}
      />

      <Modal
        open={slDialogOpen}
        onClose={() => { setSlDialogOpen(false); setSlChosen(null); setSlCreating(false); setSlNewName(""); }}
        title={`Gửi ${selected.size} program vào Shortlist`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Chọn shortlist đích. Program đã tồn tại trong shortlist sẽ bị bỏ qua an toàn.
          </p>

          {shortlistsQ.isLoading && <div className="text-sm text-gray-400">Đang tải shortlist…</div>}

          {/* Danh sách shortlist hiện có */}
          {!shortlistsQ.isLoading && (shortlistsQ.data?.length || 0) > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                {shortlistsQ.data!.map((sl) => (
                  <button
                    key={sl.id}
                    onClick={() => setSlChosen(sl.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      slChosen === sl.id
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "hover:bg-gray-50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-ink text-sm truncate">{sl.name}</div>
                      {sl.description && <div className="text-xs text-gray-400 truncate">{sl.description}</div>}
                    </div>
                    <Badge variant="neutral">{sl.item_count}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Inline tạo shortlist mới */}
          {slCreating ? (
            <div className="flex gap-2 items-center">
              <input
                autoFocus
                type="text"
                value={slNewName}
                onChange={(e) => setSlNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && slNewName.trim()) createShortlistMut.mutate(slNewName.trim());
                  if (e.key === "Escape") { setSlCreating(false); setSlNewName(""); }
                }}
                placeholder="Tên shortlist mới…"
                className="flex-1 px-3 py-2 text-sm border border-primary/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                size="sm"
                variant="primary"
                loading={createShortlistMut.isPending}
                disabled={!slNewName.trim()}
                onClick={() => createShortlistMut.mutate(slNewName.trim())}
              >
                Tạo
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setSlCreating(false); setSlNewName(""); }}>Huỷ</Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSlCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary border border-dashed border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
            >
              <Plus size={14} /> Tạo shortlist mới
            </button>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setSlDialogOpen(false); setSlChosen(null); setSlCreating(false); setSlNewName(""); }}>Huỷ</Button>
            <Button
              variant="primary"
              disabled={!slChosen || bulkAddToShortlist.isPending}
              loading={bulkAddToShortlist.isPending}
              onClick={() => {
                if (slChosen) bulkAddToShortlist.mutate({ sid: slChosen, ids: Array.from(selected) });
              }}
            >
              <Sparkles size={14} /> Thêm vào shortlist
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={scanDialogOpen}
        onClose={() => setScanDialogOpen(false)}
        title={`Quét traffic cho ${selected.size} dự án`}
        size="md"
      >
        <div className="space-y-5">
          {/* Banner mô tả */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary-50/60 border border-primary/20">
            <Gauge size={20} className="text-primary mt-0.5 shrink-0" />
            <div className="text-sm text-ink leading-relaxed">
              Lấy dữ liệu traffic từ <b>SimilarWeb</b> cho từng dự án.
              Bạn có thể tinh chỉnh các tham số bên dưới trước khi chạy.
            </div>
          </div>

          {/* Progress khi có job đang chạy / vừa xong */}
          {trafficJob && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50/60 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                <span>Tiến độ job #{trafficJob.id}</span>
                <span className={
                  trafficJob.status === "success" ? "text-emerald-600" :
                  trafficJob.status === "failed" ? "text-red-600" :
                  "text-primary"
                }>
                  {trafficJob.status === "pending" && "Đang chờ…"}
                  {trafficJob.status === "running" && "Đang quét…"}
                  {trafficJob.status === "success" && "Hoàn tất"}
                  {trafficJob.status === "failed" && "Lỗi"}
                </span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {(() => {
                  const done = trafficJob.scanned + trafficJob.skipped + trafficJob.failed;
                  const pct = trafficJob.total > 0 ? Math.round((done / trafficJob.total) * 100) : 0;
                  return (
                    <>
                      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full transition-all ${trafficJob.status === "failed" ? "bg-red-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between text-xs text-gray-600 gap-2">
                        <div>{done}/{trafficJob.total} dự án ({pct}%)</div>
                        <div className="flex gap-3 tabular-nums">
                          <span>Quét <b className="text-ink">{trafficJob.scanned}</b></span>
                          <span>Thấy <b className="text-emerald-600">{trafficJob.found}</b></span>
                          {trafficJob.skipped > 0 && <span>Bỏ qua <b className="text-ink">{trafficJob.skipped}</b></span>}
                          {trafficJob.failed > 0 && <span>Lỗi <b className="text-red-600">{trafficJob.failed}</b></span>}
                        </div>
                      </div>
                      {trafficJobRunning && (
                        <div className="text-[11px] text-gray-500">
                          Bạn có thể đóng cửa sổ này — job vẫn chạy nền, kết quả sẽ tự cập nhật.
                        </div>
                      )}
                      {trafficJob.status === "failed" && trafficJob.error && (
                        <div className="text-xs text-red-600 break-all">{trafficJob.error.split("\n")[0]}</div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Danh sách kết quả chi tiết (khi job đã xong) */}
          {trafficJob && !trafficJobRunning && trafficJob.results.length > 0 && (() => {
            const failedItems = trafficJob.results.filter((r) => r.status === "failed");
            const emptyItems = trafficJob.results.filter((r) => r.status === "empty");
            const okItems = trafficJob.results.filter((r) => r.status === "ok");
            return (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50/60 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between">
                  <span>Chi tiết kết quả</span>
                  <span className="font-normal normal-case text-[11px] text-gray-400">
                    {failedItems.length > 0 && <span className="text-red-600">Lỗi {failedItems.length}</span>}
                    {failedItems.length > 0 && emptyItems.length > 0 && " · "}
                    {emptyItems.length > 0 && <span>Rỗng {emptyItems.length}</span>}
                    {(failedItems.length > 0 || emptyItems.length > 0) && okItems.length > 0 && " · "}
                    {okItems.length > 0 && <span className="text-emerald-600">OK {okItems.length}</span>}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {failedItems.length > 0 && (
                    <div className="px-4 py-2 bg-red-50/40">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-red-600 mb-1.5">
                        Lỗi ({failedItems.length})
                      </div>
                      <div className="space-y-1">
                        {failedItems.map((r) => (
                          <div key={`f-${r.program_id}`} className="text-xs flex items-start gap-2">
                            <AlertCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-ink truncate">{r.name}</div>
                              {r.error && <div className="text-red-600 text-[11px] break-all">{r.error}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {emptyItems.length > 0 && (
                    <div className="px-4 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                        Không có data SimilarWeb ({emptyItems.length})
                      </div>
                      <div className="space-y-1">
                        {emptyItems.map((r) => (
                          <div key={`e-${r.program_id}`} className="text-xs text-gray-600 truncate">
                            {r.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {okItems.length > 0 && (
                    <details className="px-4 py-2">
                      <summary className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 cursor-pointer">
                        Quét OK ({okItems.length}) — bấm để xem
                      </summary>
                      <div className="space-y-1 mt-1.5">
                        {okItems.map((r) => (
                          <div key={`o-${r.program_id}`} className="text-xs flex items-center justify-between gap-2">
                            <span className="text-ink truncate">{r.name}</span>
                            <span className="text-gray-500 tabular-nums shrink-0">
                              {(r.monthly_visits || 0).toLocaleString("vi-VN")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Bảng tham số */}
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50/60 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tham số quét
            </div>

            {/* Skip existing */}
            <label className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/60 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={scanSkipExisting}
                onChange={(e) => setScanSkipExisting(e.target.checked)}
                disabled={trafficJobRunning}
                className="mt-1 h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">Bỏ qua dự án đã có traffic</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Khuyến nghị bật. Tắt nếu muốn quét lại toàn bộ.
                </div>
              </div>
            </label>

            {/* Months */}
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">Số tháng dữ liệu cần lấy</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Lấy traffic của N tháng gần nhất từ SimilarWeb (tối đa 12). Nhiều tháng → biểu đồ xu hướng dài hơn nhưng quét lâu hơn. Mặc định 12 tháng (max).
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setScanMonths((v) => Math.max(1, v - 1))}
                  disabled={trafficJobRunning || scanMonths <= 1}
                  className="w-7 h-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-medium transition-colors"
                  aria-label="Giảm"
                >−</button>
                <div className="w-10 text-center text-sm font-semibold tabular-nums text-ink">{scanMonths}</div>
                <button
                  type="button"
                  onClick={() => setScanMonths((v) => Math.min(12, v + 1))}
                  disabled={trafficJobRunning || scanMonths >= 12}
                  className="w-7 h-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-medium transition-colors"
                  aria-label="Tăng"
                >+</button>
              </div>
            </div>

            {/* Concurrency */}
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">Số luồng song song</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Cao hơn = nhanh hơn nhưng dễ bị SimilarWeb chặn. Mặc định 2.
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScanConcurrency(n)}
                    disabled={trafficJobRunning}
                    className={`w-7 h-7 rounded-md text-sm font-medium tabular-nums transition-colors border ${
                      scanConcurrency === n
                        ? "bg-primary text-white border-primary"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ước lượng thời gian */}
          <div className="text-xs text-gray-500 bg-gray-50/70 rounded-lg px-3 py-2.5 border border-gray-100 leading-relaxed">
            <b className="text-ink">Ước lượng:</b>{" "}
            ~{Math.ceil((selected.size * scanMonths * 2.2) / scanConcurrency)}s cho{" "}
            <b className="text-ink">{selected.size}</b> dự án × <b className="text-ink">{scanMonths}</b> tháng,{" "}
            song song <b className="text-ink">{scanConcurrency}</b> luồng.
            Job chạy nền — bạn có thể đóng cửa sổ này, kết quả tự cập nhật.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setScanDialogOpen(false)}>
              {trafficJobRunning ? "Đóng (chạy nền)" : "Huỷ"}
            </Button>
            <Button
              variant="primary"
              loading={bulkScan.isPending || trafficJobRunning}
              disabled={bulkScan.isPending || trafficJobRunning || selected.size === 0}
              onClick={() => {
                bulkScan.mutate({
                  ids: Array.from(selected),
                  skip_existing: scanSkipExisting,
                  months: scanMonths,
                  concurrency: scanConcurrency,
                });
              }}
            >
              <Gauge size={14} /> {trafficJobRunning ? "Đang chạy…" : "Bắt đầu quét"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Floating badge cũ đã được thay bằng <TrafficJobIndicator /> trên top-bar (xem (app)/layout.tsx) */}
    </div>
  );
}

function SortableTh({ label, k, current, onSort, icon }: {
  label: string; k: SortKey; current: SortKey;
  onSort: (k: SortKey) => void; icon: React.ReactNode;
}) {
  const active = current === k;
  return (
    <th className="px-4 py-3 text-left">
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1.5 uppercase tracking-wider text-xs ${active ? "text-ink" : "text-gray-500"} hover:text-primary`}
      >
        {label} {icon}
      </button>
    </th>
  );
}

function Row({ label, value, link, mono }: { label: string; value: string | null | undefined; link?: boolean; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
      {!value ? <div className="text-gray-300 text-sm">—</div> :
        link ? <a href={value} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline break-all">{value}</a> :
        <div className={`text-sm text-ink ${mono ? "font-mono text-xs" : ""}`}>{value}</div>}
    </div>
  );
}

function ProgramDetailDrawer({
  program, onClose, onDeleted,
}: {
  program: api.Program | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { push } = useToast();
  const qc = useQueryClient();
  const programId = program?.id ?? 0;
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!program) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [program, onClose]);

  const detailQ = useQuery({
    queryKey: ["program", programId],
    queryFn: () => api.getProgram(programId),
    enabled: !!program,
    initialData: program || undefined,
  });

  const scan = useMutation({
    mutationFn: () => api.scanProgramTraffic(programId),
    onSuccess: (res) => {
      push({
        type: res.found ? "success" : "info",
        title: program?.name,
        href: `/programs?focus=${programId}`,
        message: res.found
          ? `Đã quét: ${new Intl.NumberFormat("vi-VN").format(res.monthly_visits)} visits (${res.period_month})`
          : "SimilarWeb không có dữ liệu cho domain này",
      });
      qc.invalidateQueries({ queryKey: ["program", programId] });
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => push({ type: "error", title: program?.name, href: `/programs?focus=${programId}`, message: e.message || "Quét traffic thất bại" }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteProgram(programId),
    onSuccess: () => { push({ type: "success", message: "Đã xoá." }); onDeleted(); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!program) return null;
  const p = detailQ.data || program;

  let tags: string[] = [];
  try { tags = JSON.parse(p.tags_json || "[]"); } catch {}
  let trafficDetails: TrafficDetails | null = null;
  try { trafficDetails = p.traffic_details_json ? JSON.parse(p.traffic_details_json) as TrafficDetails : null; } catch {}
  const hasTraffic = !!(trafficDetails && (trafficDetails.global?.length || trafficDetails.country?.length));
  const domain = (() => {
    const u = p.url || p.signup_url || p.source_url;
    if (!u) return null;
    try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return null; }
  })();

  if (!mounted) return null;
  const node = (
    <div className="fixed inset-0 z-[100] flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative ml-auto h-full w-full sm:w-[640px] lg:w-[860px] max-w-full bg-white shadow-2xl flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {p.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.logo_url}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-canvas border border-gray-100"
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="primary">{p.source}</Badge>
                {p.category && <Badge variant="neutral">{p.category}</Badge>}
                {p.commission_type && <Badge variant="info">{p.commission_type}</Badge>}
                {p.directory_status && (
                  <Badge variant={/(verified|active|auto)/i.test(p.directory_status) ? "success" : "neutral"}>
                    {p.directory_status}
                  </Badge>
                )}
                {p.directory_network && <Badge variant="info">{p.directory_network}</Badge>}
              </div>
              <h2 className="text-lg font-semibold text-ink leading-snug">{p.name}</h2>
              {domain && <div className="text-xs text-gray-400 mt-0.5">{domain}</div>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-gray-400 hover:text-ink p-1 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Action bar */}
        <div className="border-b border-gray-100 px-5 py-3 flex flex-wrap gap-2 bg-canvas/40">
          <Button variant="secondary" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
            {scan.isPending ? "Đang quét…" : hasTraffic ? "Quét lại traffic" : "Quét traffic"}
          </Button>
          {p.signup_url && (
            <a href={p.signup_url} target="_blank" rel="noreferrer">
              <Button variant="cta" size="sm">Mở signup <ExternalLink size={14} /></Button>
            </a>
          )}
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">Mở URL <ExternalLink size={14} /></Button>
            </a>
          )}
          <Link href={`/programs/${p.id}`} target="_blank">
            <Button variant="secondary" size="sm"><Briefcase size={14} /> Mở tab mới</Button>
          </Link>
          <div className="grow" />
          <Button variant="danger" size="sm"
            onClick={() => { if (confirm(`Xoá "${p.name}"?`)) del.mutate(); }}
            disabled={del.isPending}
          >
            <Trash2 size={14} /> Xoá
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-5 space-y-5 grow min-h-0">
          {(p.short_description || p.description) && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{p.short_description || p.description}</p>
          )}
          {p.short_description && p.description && p.short_description !== p.description && (
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line border-l-2 border-gray-200 pl-3">{p.description}</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Row label="Commission" value={p.commission} />
            <Row label="Loại" value={p.commission_type} />
            <Row label="Kỳ commission" value={p.commission_duration} />
            <Row label="Payout" value={p.payout} />
            <Row label="Payout min" value={p.payout_min ? `${p.payout_min} ${p.payout_currency || ""}`.trim() : null} />
            <Row label="Chu kỳ payout" value={p.payout_frequency} />
            <Row label="Cookie" value={p.cookie_duration} />
            <Row label="Traffic / tháng" value={p.traffic_score ? new Intl.NumberFormat("vi-VN").format(p.traffic_score) : null} />
            <Row label="Kỳ traffic" value={p.traffic_period_month} />
            <Row label="Traffic (nguồn)" value={p.directory_traffic} />
            <Row label="Độ phổ biến (nguồn)" value={p.directory_popularity} />
            <Row label="Trạng thái (nguồn)" value={p.directory_status} />
            <Row label="Network" value={p.directory_network} />
            <Row label="Duyệt đơn" value={p.directory_approval} />
            <Row label="Thời gian duyệt" value={p.directory_approval_time} />
            <Row label="Attribution" value={p.directory_attribution} />
            <Row label="Tracking" value={p.directory_tracking} />
            <Row label="Last verified" value={p.directory_last_verified_at} />
            <Row label="Tuổi chương trình" value={p.directory_program_age} />
            <Row
              label="Đăng ký mở"
              value={p.registrations_open === 1 ? "Có" : p.registrations_open === 0 ? "Đã đóng" : null}
            />
            <Row label="External ID" value={p.external_id} mono />
            <Row label="Crawled" value={p.crawled_at ? new Date(p.crawled_at + "Z").toLocaleString("vi-VN") : null} />
            <Row label="Updated" value={p.updated_at ? new Date(p.updated_at + "Z").toLocaleString("vi-VN") : null} />
            <div className="col-span-2 md:col-span-3"><Row label="URL" value={p.url} link /></div>
            <div className="col-span-2 md:col-span-3"><Row label="Signup URL" value={p.signup_url} link /></div>
            {p.source_url && <div className="col-span-2 md:col-span-3"><Row label="Source URL" value={p.source_url} link /></div>}
            {p.commission_conditions && (
              <div className="col-span-2 md:col-span-3"><Row label="Điều kiện commission" value={p.commission_conditions} /></div>
            )}
            {p.payout_methods_json && (() => {
              try {
                const methods = JSON.parse(p.payout_methods_json) as string[];
                if (!Array.isArray(methods) || !methods.length) return null;
                return (
                  <div className="col-span-2 md:col-span-3">
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Phương thức payout</div>
                    <div className="flex flex-wrap gap-1.5">
                      {methods.map((m) => <Badge key={m} variant="info">{m}</Badge>)}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => <Badge key={t} variant="info">#{t}</Badge>)}
            </div>
          )}

          {p.restrictions_json && (() => {
            try {
              const list = JSON.parse(p.restrictions_json) as string[];
              if (!Array.isArray(list) || !list.length) return null;
              return (
                <div>
                  <div className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-500" /> Hạn chế
                  </div>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {list.map((r, i) => (
                      <li key={i} className="flex gap-2"><span className="text-amber-500">•</span><span>{r}</span></li>
                    ))}
                  </ul>
                </div>
              );
            } catch { return null; }
          })()}

          {p.agents_json && (() => {
            try {
              const a = JSON.parse(p.agents_json) as { prompt?: string; keywords?: string[]; use_cases?: string[] };
              if (!a || (!a.prompt && !a.keywords?.length && !a.use_cases?.length)) return null;
              return (
                <div className="rounded-xl border border-primary/20 bg-primary-50/30 p-4 space-y-3">
                  <div className="text-sm font-semibold text-ink flex items-center gap-1.5">
                    <Sparkles size={14} className="text-primary" /> AI Agent recommendation
                  </div>
                  {a.prompt && <p className="text-sm text-gray-700 whitespace-pre-line">{a.prompt}</p>}
                  {a.keywords?.length ? (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Keywords</div>
                      <div className="flex flex-wrap gap-1">
                        {a.keywords.map((k) => <Badge key={k} variant="neutral">{k}</Badge>)}
                      </div>
                    </div>
                  ) : null}
                  {a.use_cases?.length ? (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Use cases</div>
                      <ul className="space-y-1 text-sm text-gray-700">
                        {a.use_cases.map((u, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{u}</span></li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            } catch { return null; }
          })()}

          {hasTraffic && trafficDetails ? (
            <ProgramTrafficDetail details={trafficDetails} scannedAt={p.traffic_scanned_at} domain={domain} />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-canvas/40 p-6 text-center">
              <Gauge size={28} className="mx-auto mb-2 text-gray-300" />
              <div className="text-sm font-medium text-ink">Chưa có dữ liệu traffic chi tiết</div>
              <p className="mt-1 text-xs text-gray-500">
                Bấm <span className="font-medium text-gray-700">Quét traffic</span> ở trên để lấy dữ liệu SimilarWeb.
              </p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary"
            >
              <ChevronDown size={14} className={`transition-transform ${showRaw ? "rotate-180" : ""}`} />
              Raw JSON
            </button>
            {showRaw && (
              <pre className="mt-2 text-xs bg-canvas border border-gray-200 rounded-lg p-3 overflow-auto max-h-80 text-gray-700">
                {p.raw_json ? (() => { try { return JSON.stringify(JSON.parse(p.raw_json), null, 2); } catch { return p.raw_json; } })() : "—"}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
