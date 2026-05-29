"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Edit, Copy, Trash2, Search, X } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/Input";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/lib/toast";

export default function ProfilesPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [niche, setNiche] = useState("");
  const [tag, setTag] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const dup = useMutation({
    mutationFn: (id: string) => api.duplicateProfile(id),
    onSuccess: (r) => { push({ type: "success", message: `Đã nhân bản → ${r.id}` }); qc.invalidateQueries({ queryKey: ["profiles"] }); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => { push({ type: "success", message: "Đã xoá profile." }); qc.invalidateQueries({ queryKey: ["profiles"] }); },
  });

  // Gom mọi country/niche xuất hiện để render dropdown gợi ý
  const countries = useMemo(() => Array.from(new Set((q.data || []).map((p) => p.country).filter(Boolean))).sort(), [q.data]);
  const allNiches = useMemo(() => Array.from(new Set((q.data || []).flatMap((p) => p.niche || []))).sort(), [q.data]);
  const allTags = useMemo(() => Array.from(new Set((q.data || []).flatMap((p) => p.tags || []))).sort(), [q.data]);

  const filtered = useMemo(() => {
    const items = q.data || [];
    const kw = search.trim().toLowerCase();
    return items.filter((p) => {
      if (kw) {
        const hay = `${p.id} ${p.full_name} ${p.country} ${(p.niche || []).join(" ")} ${(p.tags || []).join(" ")} ${p.notes}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (country && p.country !== country) return false;
      if (niche && !(p.niche || []).includes(niche)) return false;
      if (tag && !(p.tags || []).includes(tag)) return false;
      return true;
    });
  }, [q.data, search, country, niche, tag]);

  const resetFilter = () => {
    setSearch(""); setCountry(""); setNiche(""); setTag("");
  };
  const activeCount = [country, niche, tag].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Profiles"
        description="Danh tính ảo phục vụ phase auto-register. Lưu thành JSON tại data/profiles/<user_id>/."
        action={
          <Link href="/profiles/new"><Button><Plus size={16} /> Tạo profile</Button></Link>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, email, niche, ghi chú…" className="pl-9" />
          </div>
          <Button variant="secondary" onClick={() => setShowAdvanced((v) => !v)}>
            Bộ lọc {activeCount > 0 && <Badge variant="info">{activeCount}</Badge>}
          </Button>
          {(search || activeCount > 0) && (
            <Button variant="secondary" onClick={resetFilter}><X size={14} /> Xoá lọc</Button>
          )}
        </div>
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Quốc gia</label>
              <select aria-label="Quốc gia" className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">— Tất cả —</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Niche</label>
              <select aria-label="Niche" className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={niche} onChange={(e) => setNiche(e.target.value)}>
                <option value="">— Tất cả —</option>
                {allNiches.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nhãn</label>
              <select aria-label="Nhãn" className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">— Tất cả —</option>
                {allTags.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="text-xs text-gray-500 mt-3">Hiển thị <b>{filtered.length}</b> / {q.data?.length || 0} profile.</div>
      </Card>

      {!q.data || q.data.length === 0 ? (
        <Card><EmptyState icon={Users} title="Chưa có profile nào" description="Tạo profile đầu tiên để chuẩn bị cho auto-register." action={<Link href="/profiles/new"><Button>Tạo ngay</Button></Link>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Search} title="Không khớp bộ lọc" description="Thử nới điều kiện lọc hoặc xoá từ khoá." action={<Button variant="secondary" onClick={resetFilter}>Xoá lọc</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            return (
              <Card key={p.id} className="hover:border-primary-300 hover:shadow-soft-md transition-all duration-200 flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-brand text-white font-semibold flex items-center justify-center text-base shadow-soft">
                    {(p.full_name || p.id)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink truncate">{p.full_name || p.id}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{p.id}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 mb-3">
                  {p.country && <Badge variant="info">{p.country}</Badge>}
                </div>

                {p.niche.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.niche.map((n) => <Badge key={n} variant="info">{n}</Badge>)}
                  </div>
                )}
                {(p.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(p.tags || []).map((t) => (
                      <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]">#{t}</span>
                    ))}
                  </div>
                )}
                {p.notes && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{p.notes}</p>}
                <div className="flex gap-2 pt-3 mt-auto border-t border-gray-100">
                  <Link href={`/profiles/${p.id}`} className="flex-1"><Button size="sm" variant="secondary" className="w-full"><Edit size={14} /> Sửa</Button></Link>
                  <Button size="sm" variant="secondary" onClick={() => dup.mutate(p.id)} loading={dup.isPending && dup.variables === p.id}><Copy size={14} /></Button>
                  <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Xoá "${p.id}"?`)) del.mutate(p.id); }} className="text-red-600 hover:bg-red-50"><Trash2 size={14} /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
