"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Search, ExternalLink, Calendar, Clock, X, Loader2, History, Trash2 } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Input, Select, Label } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { useToast } from "@/lib/toast";

const REGIONS: { value: string; label: string }[] = [
  { value: "2704", label: "🇻🇳 Việt Nam" },
  { value: "", label: "🌐 Toàn cầu" },
  { value: "2840", label: "🇺🇸 Mỹ" },
  { value: "2702", label: "🇸🇬 Singapore" },
  { value: "2764", label: "🇹🇭 Thái Lan" },
  { value: "2360", label: "🇮🇩 Indonesia" },
  { value: "2458", label: "🇲🇾 Malaysia" },
  { value: "2608", label: "🇵🇭 Philippines" },
  { value: "2392", label: "🇯🇵 Nhật" },
  { value: "2410", label: "🇰🇷 Hàn Quốc" },
];

const PLATFORMS = [
  { value: "", label: "Tất cả nền tảng" },
  { value: "GOOGLE_SEARCH", label: "Google Search" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "PLAY", label: "Play Store" },
  { value: "MAPS", label: "Maps" },
  { value: "SHOPPING", label: "Shopping" },
];

const FORMATS = [
  { value: "", label: "Mọi định dạng" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
];

function fmtDate(ts?: number) {
  if (!ts) return "—";
  try {
    return new Date(ts * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function FormatBadge({ format }: { format?: string }) {
  const map: Record<string, { variant: "primary" | "info" | "warning" | "success"; label: string }> = {
    text: { variant: "info", label: "Text" },
    image: { variant: "primary", label: "Image" },
    video: { variant: "warning", label: "Video" },
  };
  const m = (format && map[format]) || { variant: "success" as const, label: format || "—" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export default function AdsTransparencyPage() {
  const { push } = useToast();
  const qc = useQueryClient();

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const daysAgoISO = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const [text, setText] = useState("");
  const [platform, setPlatform] = useState("");
  const [creativeFormat, setCreativeFormat] = useState("text");
  const [region, setRegion] = useState("2704");
  const [startDate, setStartDate] = useState(() => daysAgoISO(30));
  const [endDate, setEndDate] = useState(() => todayISO());
  const [numStr, setNumStr] = useState("10");
  const num = Math.max(1, Math.min(100, Number(numStr) || 10));

  const [creatives, setCreatives] = useState<api.AdCreative[]>([]);
  const [nextToken, setNextToken] = useState<string>("");
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<api.AdCreative | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [serpNotice, setSerpNotice] = useState<string>("");

  const search = useMutation({
    mutationFn: (token: string) =>
      api.searchAdsTransparency({
        text: text.trim(),
        platform,
        creative_format: creativeFormat,
        region,
        start_date: startDate.replace(/-/g, ""),
        end_date: endDate.replace(/-/g, ""),
        num,
        next_page_token: token,
      }),
    onSuccess: (data, token) => {
      const list = data.ad_creatives || [];
      setCreatives((prev) => (token ? [...prev, ...list] : list));
      setTotal(data.search_information?.total_results);
      setNextToken(data.pagination?.next_page_token || data.serpapi_pagination?.next_page_token || "");
      // Capture SerpAPI-side empty/error notice for nice UI
      const errMsg: string | undefined = (data as any)?.error;
      const state: string | undefined = (data as any)?.search_information?.results_state;
      if (!token) {
        if (!list.length) {
          setSerpNotice(errMsg || (state === "Fully empty" ? "Google ATC không trả về quảng cáo nào cho truy vấn này." : "Không tìm thấy quảng cáo nào."));
        } else {
          setSerpNotice("");
        }
        qc.invalidateQueries({ queryKey: ["ads-history"] });
      }
    },
    onError: (e: Error) => {
      setSerpNotice(e.message);
      push({ type: "error", message: e.message });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      push({ type: "error", message: "Cần nhập từ khoá / domain (vd: shopee.vn)" });
      return;
    }
    setCreatives([]);
    setNextToken("");
    setTotal(undefined);
    setSerpNotice("");
    setSearched(true);
    search.mutate("");
  };

  const openDetail = async (c: api.AdCreative) => {
    setSelected(c);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await api.getAdDetails(c.advertiser_id, c.ad_creative_id, region);
      setDetail(d);
    } catch (e: any) {
      push({ type: "error", message: e.message });
    } finally {
      setDetailLoading(false);
    }
  };

  // ---- History ----
  const history = useQuery({
    queryKey: ["ads-history"],
    queryFn: () => api.listAdsHistory(30),
    staleTime: 30_000,
  });

  const restoreHistory = (h: api.AdsHistoryItem) => {
    setText(h.text || h.advertiser_id || "");
    setPlatform(h.platform || "");
    setCreativeFormat(h.creative_format || "");
    setRegion(h.region || "");
    const toISO = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);
    if (h.start_date) setStartDate(toISO(h.start_date));
    if (h.end_date) setEndDate(toISO(h.end_date));
    if (h.num) setNumStr(String(h.num));
    setSerpNotice("");
    setSearched(true);
    // Restore cached results if available — không tốn SerpAPI quota
    if (h.results_json) {
      try {
        const cached = JSON.parse(h.results_json);
        setCreatives(cached.ad_creatives || []);
        setTotal(cached.search_information?.total_results);
        setNextToken(cached.pagination?.next_page_token || cached.serpapi_pagination?.next_page_token || "");
        return;
      } catch {
        // fallback: re-search nếu parse lỗi
      }
    }
    // Không có cache → gọi lại API
    setCreatives([]);
    setNextToken("");
    setTotal(undefined);
    setTimeout(() => search.mutate(""), 0);
  };

  const removeHistory = async (id: number) => {
    try {
      await api.deleteAdsHistory(id);
      qc.invalidateQueries({ queryKey: ["ads-history"] });
    } catch (e: any) {
      push({ type: "error", message: e.message });
    }
  };

  const clearHistory = async () => {
    if (!confirm("Xoá toàn bộ lịch sử search?")) return;
    try {
      await api.clearAdsHistory();
      qc.invalidateQueries({ queryKey: ["ads-history"] });
    } catch (e: any) {
      push({ type: "error", message: e.message });
    }
  };

  const relTime = (iso: string | null) => {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const diff = Math.max(0, Date.now() - t);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s trước`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} phút trước`;
    const hr = Math.floor(m / 60);
    if (hr < 24) return `${hr} giờ trước`;
    const d = Math.floor(hr / 24);
    return `${d} ngày trước`;
  };

  // Trích iframe URLs từ ad-details (SerpAPI variations) cho preview
  const iframeUrls = useMemo<string[]>(() => {
    if (!detail) return [];
    const urls: string[] = [];
    const candidates: any[] = ([] as any[])
      .concat(detail.variations || [])
      .concat(detail.ad_creative ? [detail.ad_creative] : []);
    const isUrl = (v: any) => typeof v === "string" && /^https?:\/\//i.test(v);
    const keys = ["iframe", "iframe_src", "preview_iframe", "content_url", "creative_url", "preview", "url"];
    for (const v of candidates) {
      if (!v || typeof v !== "object") continue;
      for (const k of keys) {
        if (isUrl(v[k]) && !urls.includes(v[k])) urls.push(v[k]);
      }
    }
    return urls.slice(0, 3);
  }, [detail]);

  const totalLabel = useMemo(() => {
    if (typeof total !== "number") return null;
    return total.toLocaleString("vi-VN");
  }, [total]);

  return (
    <>
      <PageHeader
        title="Google Ads Transparency"
        description="Tra cứu quảng cáo Google đã/đang chạy theo domain hoặc nhà quảng cáo. Dữ liệu từ Trung tâm Minh bạch của Google (qua SerpAPI)."
      />

      <Card className="mb-6">
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <Label>Từ khoá / Domain *</Label>
            <Input
              placeholder="vd: shopee.vn, lazada, …"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Khu vực</Label>
            <Select value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => <option key={r.value || "global"} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Nền tảng</Label>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p.value || "all"} value={p.value}>{p.label}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Định dạng</Label>
            <Select value={creativeFormat} onChange={(e) => setCreativeFormat(e.target.value)}>
              {FORMATS.map((f) => <option key={f.value || "any"} value={f.value}>{f.label}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Số lượng / trang</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={numStr}
              onChange={(e) => setNumStr(e.target.value)}
              onBlur={() => setNumStr(String(num))}
            />
          </div>
          <div className="md:col-span-3">
            <Label>Từ ngày</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label>Đến ngày</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="md:col-span-6 flex items-end justify-end">
            <Button type="submit" disabled={search.isPending}>
              {search.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Tìm quảng cáo
            </Button>
          </div>
        </form>
      </Card>

      {history.data && history.data.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <History size={16} className="text-primary" />
              Lịch sử tìm kiếm
              <span className="text-xs font-normal text-gray-400">({history.data.length})</span>
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs text-gray-500 hover:text-red-500 inline-flex items-center gap-1"
            >
              <Trash2 size={12} /> Xoá tất cả
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.data.map((h) => {
              const reg = REGIONS.find((r) => r.value === h.region);
              return (
                <div
                  key={h.id}
                  className="group flex items-center gap-2 rounded-full border border-gray-200 hover:border-primary/40 hover:bg-primary/5 transition pl-3 pr-1 py-1 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => restoreHistory(h)}
                    className="flex items-center gap-1.5 text-ink"
                    title={h.results_json ? "Khôi phục kết quả đã lưu (không tốn quota)" : "Chạy lại tìm kiếm này"}
                  >
                    <Clock size={11} className="text-gray-400 group-hover:text-primary" />
                    <span className="font-semibold truncate max-w-[160px]">{h.text || h.advertiser_id || "—"}</span>
                    {reg && <span className="text-gray-400">· {reg.label.split(" ")[0]}</span>}
                    {h.creative_format && <span className="text-gray-400">· {h.creative_format}</span>}
                    <span className="text-gray-400">· {h.result_count} kq</span>
                    <span className="text-gray-300">· {relTime(h.created_at)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistory(h.id)}
                    className="rounded-full p-1 text-gray-300 hover:text-red-500 hover:bg-red-50"
                    title="Xoá"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {totalLabel && (
        <div className="text-sm text-gray-500 mb-3">
          Khớp <span className="font-semibold text-ink">{totalLabel}</span> quảng cáo
          {creatives.length > 0 && <> · Đang hiển thị <span className="font-semibold text-ink">{creatives.length}</span></>}
        </div>
      )}

      {search.isPending && creatives.length === 0 && (
        <Card><p className="text-sm text-gray-400">Đang truy vấn SerpAPI…</p></Card>
      )}

      {!search.isPending && creatives.length === 0 && searched && (
        <EmptyState
          icon={Megaphone}
          title="Google ATC không có kết quả cho truy vấn này"
          description={
            (serpNotice ? serpNotice + " " : "") +
            "Gợi ý: dùng full domain (vd: binance.com thay vì binance), thử đổi Khu vực sang “Toàn cầu”, bỏ lọc Định dạng, hoặc mở rộng khoảng ngày."
          }
        />
      )}

      {!search.isPending && creatives.length === 0 && !searched && (
        <EmptyState
          icon={Megaphone}
          title="Chưa có kết quả"
          description="Nhập domain / từ khoá (vd: shopee.vn) rồi bấm Tìm quảng cáo để xem các quảng cáo Google đã/đang chạy."
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {creatives.map((c) => (
          <Card key={`${c.advertiser_id}_${c.ad_creative_id}`} className="hover:shadow-lg transition cursor-pointer flex flex-col" >
            <div onClick={() => openDetail(c)} className="flex-1 flex flex-col">
              {c.image ? (
                <div className="aspect-video w-full bg-gray-50 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image} alt={c.advertiser || ""} className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="aspect-video w-full rounded-lg mb-3 p-4 flex flex-col justify-center bg-gradient-to-br from-primary/5 via-white to-primary/10 border border-primary/10 relative overflow-hidden">
                  <div className="absolute top-2 left-2 text-[10px] font-semibold text-primary/70 uppercase tracking-wider flex items-center gap-1">
                    <Megaphone size={10} /> Ad · {(c.format || "text").toString()}
                  </div>
                  <div className="text-primary text-sm font-semibold truncate mt-3">
                    {c.target_domain || c.advertiser || "Quảng cáo"}
                  </div>
                  <div className="text-ink text-base font-bold leading-snug line-clamp-2 mt-1">
                    {c.advertiser || "—"}
                  </div>
                  <div className="text-gray-500 text-xs line-clamp-2 mt-1">
                    Quảng cáo dạng văn bản — bấm để xem chi tiết các biến thể.
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-semibold text-ink text-sm truncate flex-1">{c.advertiser || "—"}</div>
                <FormatBadge format={c.format} />
              </div>
              {c.target_domain && (
                <div className="text-xs text-primary truncate mb-2">{c.target_domain}</div>
              )}
              <div className="mt-auto flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1"><Clock size={12} /> {c.total_days_shown ?? "—"} ngày</span>
                <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(c.last_shown)}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {nextToken && (
        <div className="flex justify-center mt-6">
          <Button
            variant="secondary"
            onClick={() => search.mutate(nextToken)}
            disabled={search.isPending}
          >
            {search.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            Tải thêm
          </Button>
        </div>
      )}

      <Modal open={!!selected} onClose={() => { setSelected(null); setDetail(null); }} title={selected?.advertiser || "Chi tiết quảng cáo"}>
        {selected && (
          <div className="space-y-4">
            {selected.image && (
              <div className="w-full bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.image} alt="" className="max-w-full max-h-72 object-contain" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-400">Định dạng</div>
                <div><FormatBadge format={selected.format} /></div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Domain đích</div>
                <div className="text-ink truncate">{selected.target_domain || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Số ngày hiển thị</div>
                <div className="text-ink">{selected.total_days_shown ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Lần đầu / Lần cuối</div>
                <div className="text-ink">{fmtDate(selected.first_shown)} → {fmtDate(selected.last_shown)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-400">Advertiser ID</div>
                <div className="text-ink font-mono text-xs break-all">{selected.advertiser_id}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-400">Creative ID</div>
                <div className="text-ink font-mono text-xs break-all">{selected.ad_creative_id}</div>
              </div>
            </div>

            {selected.details_link && (
              <a
                href={selected.details_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Xem trên Trung tâm Minh bạch <ExternalLink size={14} />
              </a>
            )}

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Chi tiết bổ sung</div>
              {detailLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Đang tải…
                </div>
              )}
              {!detailLoading && iframeUrls.length > 0 && (
                <div className="space-y-2 mb-3">
                  <div className="text-[11px] text-gray-400">
                    Preview iframe (Google có thể chặn embed bằng X-Frame-Options — nếu trắng thì mở link trực tiếp):
                  </div>
                  {iframeUrls.map((u) => (
                    <div key={u} className="rounded-lg border border-gray-100 overflow-hidden bg-white">
                      <iframe
                        src={u}
                        title="Ad creative preview"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        loading="lazy"
                        className="w-full h-72 bg-white"
                      />
                      <a href={u} target="_blank" rel="noreferrer" className="block px-2 py-1 text-[10px] text-gray-400 hover:text-primary truncate border-t border-gray-100">
                        {u}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {!detailLoading && detail && (
                <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-auto max-h-64 text-gray-600">
                  {JSON.stringify(
                    {
                      regions_detail: detail.regions_detail,
                      variations: (detail.variations || []).slice(0, 3),
                      ad_creative: detail.ad_creative,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
