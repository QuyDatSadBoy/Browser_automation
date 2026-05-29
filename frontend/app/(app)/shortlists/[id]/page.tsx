"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Eye, Wand2, Plus, Search, Trash2, ExternalLink,
  TrendingUp, Edit3, X, Loader2,
} from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { CriteriaEditor } from "@/components/CriteriaEditor";
import { useToast } from "@/lib/toast";

export default function ShortlistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();
  const qc = useQueryClient();
  const { push } = useToast();

  const [criteria, setCriteria] = useState<api.Criteria | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tab, setTab] = useState<"items" | "preview">("items");
  const [addOpen, setAddOpen] = useState(false);
  const [trafficEdit, setTrafficEdit] = useState<{ id: number; value: string } | null>(null);

  const sl = useQuery({ queryKey: ["shortlist", id], queryFn: () => api.getShortlist(id) });
  const itemsQ = useQuery({ queryKey: ["shortlist-items", id], queryFn: () => api.getShortlistItems(id) });
  const previewQ = useQuery({
    queryKey: ["shortlist-preview", id, criteria],
    queryFn: () => api.previewCriteria(criteria!, 100),
    enabled: !!criteria && tab === "preview",
  });

  // Init local state khi load xong
  useEffect(() => {
    if (sl.data && criteria === null) {
      setCriteria(sl.data.criteria);
      setName(sl.data.name);
      setDesc(sl.data.description || "");
    }
  }, [sl.data, criteria]);

  const dirty = useMemo(() => {
    if (!sl.data || !criteria) return false;
    return JSON.stringify(criteria) !== JSON.stringify(sl.data.criteria)
      || name !== sl.data.name
      || (desc || "") !== (sl.data.description || "");
  }, [sl.data, criteria, name, desc]);

  const save = useMutation({
    mutationFn: () => api.updateShortlist(id, { name, description: desc, criteria: criteria! }),
    onSuccess: () => {
      push({ type: "success", message: "Đã lưu thay đổi." });
      qc.invalidateQueries({ queryKey: ["shortlist", id] });
      qc.invalidateQueries({ queryKey: ["shortlists"] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const autoFill = useMutation({
    mutationFn: (replace: boolean) => api.autoFillShortlist(id, 50, replace),
    onSuccess: (r) => {
      push({ type: "success", message: `Đã thêm ${r.added} program.` });
      qc.invalidateQueries({ queryKey: ["shortlist-items", id] });
      qc.invalidateQueries({ queryKey: ["shortlist", id] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const removeItem = useMutation({
    mutationFn: (program_id: number) => api.removeShortlistItem(id, program_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shortlist-items", id] });
      qc.invalidateQueries({ queryKey: ["shortlist", id] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const addItem = useMutation({
    mutationFn: (program_id: number) => api.addShortlistItem(id, program_id, ""),
    onSuccess: () => {
      push({ type: "success", message: "Đã thêm vào shortlist." });
      qc.invalidateQueries({ queryKey: ["shortlist-items", id] });
      qc.invalidateQueries({ queryKey: ["shortlist", id] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const updateTraffic = useMutation({
    mutationFn: (v: { program_id: number; traffic_score: number }) =>
      api.updateProgramTraffic(v.program_id, v.traffic_score),
    onSuccess: () => {
      push({ type: "success", message: "Đã cập nhật traffic." });
      setTrafficEdit(null);
      qc.invalidateQueries({ queryKey: ["shortlist-items", id] });
      qc.invalidateQueries({ queryKey: ["shortlist-preview", id] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const scanTraffic = useMutation({
    mutationFn: (program_id: number) => api.scanProgramTraffic(program_id),
    onSuccess: (r, program_id) => {
      if (r.found) {
        push({ type: "success", title: r.domain, href: `/programs?focus=${program_id}`, message: `SimilarWeb: ${r.monthly_visits.toLocaleString()} visits/tháng (${r.domain}).` });
        setTrafficEdit(trafficEdit ? { ...trafficEdit, value: String(r.monthly_visits) } : null);
      } else {
        push({ type: "info", title: r.domain, href: `/programs?focus=${program_id}`, message: `SimilarWeb không có data cho domain ${r.domain}.` });
      }
      qc.invalidateQueries({ queryKey: ["shortlist-items", id] });
      qc.invalidateQueries({ queryKey: ["shortlist-preview", id] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const del = useMutation({
    mutationFn: () => api.deleteShortlist(id),
    onSuccess: () => { push({ type: "success", message: "Đã xoá shortlist." }); router.push("/shortlists"); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  if (sl.isLoading || !criteria) {
    return <div className="flex items-center gap-2 text-gray-400"><Loader2 className="animate-spin" size={16} /> Đang tải…</div>;
  }
  if (!sl.data) {
    return <Card><p className="text-sm text-gray-500">Không tìm thấy shortlist.</p></Card>;
  }

  const items = itemsQ.data || [];
  const preview = previewQ.data?.items || [];

  return (
    <>
      <div className="mb-4">
        <Link href="/shortlists" className="text-sm text-gray-500 hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Tất cả shortlist
        </Link>
      </div>

      <PageHeader
        title={name || "Shortlist"}
        description={desc || "Tinh chỉnh tiêu chí bên dưới, preview kết quả, rồi auto-fill hoặc thêm tay program."}
        action={
          <div className="flex gap-2">
            {dirty && (
              <Button onClick={() => save.mutate()} loading={save.isPending}>
                <Save size={14} /> Lưu thay đổi
              </Button>
            )}
            <Button variant="secondary" onClick={() => confirm(`Xoá "${sl.data!.name}"?`) && del.mutate()}>
              <Trash2 size={14} /> Xoá
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* LEFT: criteria editor */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-base font-semibold text-ink mb-4">Thông tin</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tên</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Mô tả</label>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
            </div>
          </Card>
          <Card>
            <h3 className="text-base font-semibold text-ink mb-4">Tiêu chí</h3>
            <CriteriaEditor value={criteria} onChange={setCriteria} />
          </Card>
        </div>

        {/* RIGHT: items / preview */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                <TabBtn active={tab === "items"} onClick={() => setTab("items")}>
                  Đã chọn ({sl.data.item_count})
                </TabBtn>
                <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>
                  Preview xếp hạng
                </TabBtn>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} /> Thêm tay
                </Button>
                <Button variant="cta" size="sm"
                  onClick={() => autoFill.mutate(false)} loading={autoFill.isPending}
                  title="Áp dụng tiêu chí hiện tại, thêm top 50 program">
                  <Wand2 size={14} /> Auto-fill
                </Button>
              </div>
            </div>

            {tab === "items" && (
              <>
                {itemsQ.isLoading && <p className="text-sm text-gray-400">Đang tải…</p>}
                {!itemsQ.isLoading && items.length === 0 && (
                  <div className="text-center py-12 text-sm text-gray-500">
                    Shortlist trống. Bấm <strong>Auto-fill</strong> để hệ thống tự thêm program theo tiêu chí, hoặc <strong>Thêm tay</strong> để chọn từng program.
                  </div>
                )}
                <div className="space-y-2">
                  {items.map((it) => (
                    <ItemRow key={it.id} item={it}
                      onRemove={() => removeItem.mutate(it.program_id)}
                      onEditTraffic={() => setTrafficEdit({ id: it.program_id, value: String(it.program?.traffic_score || "") })}
                    />
                  ))}
                </div>
              </>
            )}

            {tab === "preview" && (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Top 100 program khớp tiêu chí hiện tại (đã ghi đè bằng state đang chỉnh). Lưu để dùng cho Auto-fill.
                </p>
                {previewQ.isFetching && <p className="text-sm text-gray-400">Đang tính điểm…</p>}
                {!previewQ.isFetching && preview.length === 0 && (
                  <div className="text-center py-12 text-sm text-gray-500">
                    Không có program nào khớp. Hãy nới ngưỡng (giảm min_traffic, min_commission, min_cookie_days).
                  </div>
                )}
                <div className="space-y-2">
                  {preview.map((row) => (
                    <PreviewRow key={row.program.id} row={row}
                      inShortlist={items.some((i) => i.program_id === row.program.id)}
                      onAdd={() => addItem.mutate(row.program.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Add by search modal */}
      <AddModal open={addOpen} onClose={() => setAddOpen(false)}
        onPick={(pid) => { addItem.mutate(pid); }}
        existingIds={new Set(items.map((i) => i.program_id))} />

      {/* Traffic edit modal */}
      <Modal open={!!trafficEdit} onClose={() => setTrafficEdit(null)} title="Sửa traffic_score" size="sm">
        {trafficEdit && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Nhập số visits/tháng ước tính, hoặc bấm <strong>Quét tự động</strong> để lấy từ SimilarWeb.
            </p>
            <Input type="number" autoFocus
              value={trafficEdit.value}
              onChange={(e) => setTrafficEdit({ ...trafficEdit, value: e.target.value })}
              placeholder="vd: 500000" />
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => scanTraffic.mutate(trafficEdit.id)} loading={scanTraffic.isPending}>
                Quét tự động (SimilarWeb)
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setTrafficEdit(null)}>Huỷ</Button>
                <Button onClick={() => updateTraffic.mutate({ program_id: trafficEdit.id, traffic_score: Number(trafficEdit.value) || 0 })}
                  loading={updateTraffic.isPending}>Lưu</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition
        ${active ? "bg-white text-ink shadow-sm" : "text-gray-500 hover:text-ink"}`}>
      {children}
    </button>
  );
}

function ItemRow({ item, onRemove, onEditTraffic }: { item: api.ShortlistItem; onRemove: () => void; onEditTraffic: () => void }) {
  const p = item.program;
  if (!p) return null;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-primary/30 hover:bg-canvas/40 transition group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-ink truncate">{p.name}</span>
          <Badge variant="neutral">{p.source}</Badge>
          {item.added_manually ? <Badge variant="info">manual</Badge> : <Badge variant="primary">auto</Badge>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
          <span>💰 {p.commission || "-"}</span>
          <span>🍪 {p.cookie_duration || "-"}</span>
          <button onClick={onEditTraffic} className="inline-flex items-center gap-1 hover:text-primary">
            <TrendingUp size={11} /> {p.traffic_score ? p.traffic_score.toLocaleString() : "—"} <Edit3 size={10} />
          </button>
          {item.score !== null && (
            <span className="ml-auto font-semibold text-primary tabular-nums">{(item.score * 100).toFixed(1)}đ</span>
          )}
        </div>
      </div>
      {p.signup_url && (
        <a href={p.signup_url} target="_blank" rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-primary" title="Mở signup">
          <ExternalLink size={14} />
        </a>
      )}
      <button onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition" title="Xoá">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PreviewRow({ row, inShortlist, onAdd }: { row: api.ScoredProgram; inShortlist: boolean; onAdd: () => void }) {
  const p = row.program;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-primary/30 transition">
      <div className="w-12 text-center">
        <div className="text-lg font-bold text-primary tabular-nums">{(row.score * 100).toFixed(0)}</div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wide">điểm</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-ink truncate">{p.name}</span>
          <Badge variant="neutral">{p.source}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
          <span title="Traffic component">T:{(row.breakdown.traffic * 100).toFixed(0)}</span>
          <span title="Commission component">C:{(row.breakdown.commission * 100).toFixed(0)}</span>
          <span title="Cookie component">K:{(row.breakdown.cookie * 100).toFixed(0)}</span>
          <span>💰 {p.commission || "-"} · 🍪 {p.cookie_duration || "-"}</span>
        </div>
      </div>
      {inShortlist ? (
        <Badge variant="success">đã thêm</Badge>
      ) : (
        <Button size="sm" variant="secondary" onClick={onAdd}><Plus size={12} /> Thêm</Button>
      )}
    </div>
  );
}

function AddModal({ open, onClose, onPick, existingIds }: {
  open: boolean; onClose: () => void; onPick: (id: number) => void; existingIds: Set<number>;
}) {
  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["program-search-add", q],
    queryFn: () => api.listPrograms({ search: q || undefined, page: 1, page_size: 20 }),
    enabled: open,
  });
  return (
    <Modal open={open} onClose={onClose} title="Thêm program vào shortlist" size="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên program…" className="pl-9" />
        </div>
        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {(search.data?.items || []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-canvas/60">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{p.name}</div>
                <div className="text-xs text-gray-500">{p.source} · 💰 {p.commission || "-"} · 🍪 {p.cookie_duration || "-"}</div>
              </div>
              {existingIds.has(p.id) ? (
                <Badge variant="success">đã có</Badge>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => onPick(p.id)}><Plus size={12} /> Thêm</Button>
              )}
            </div>
          ))}
          {search.isLoading && <p className="text-xs text-gray-400 py-4 text-center">Đang tìm…</p>}
        </div>
      </div>
    </Modal>
  );
}
