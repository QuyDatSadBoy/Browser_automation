"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2, Calendar, Target } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { CriteriaEditor } from "@/components/CriteriaEditor";
import { useToast } from "@/lib/toast";

export default function ShortlistsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [criteria, setCriteria] = useState<api.Criteria>(api.DEFAULT_CRITERIA);

  const q = useQuery({ queryKey: ["shortlists"], queryFn: api.listShortlists });

  const create = useMutation({
    mutationFn: () => api.createShortlist({ name, description: desc, criteria }),
    onSuccess: () => {
      push({ type: "success", message: "Đã tạo shortlist." });
      setOpen(false); setName(""); setDesc(""); setCriteria(api.DEFAULT_CRITERIA);
      qc.invalidateQueries({ queryKey: ["shortlists"] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteShortlist(id),
    onSuccess: () => { push({ type: "success", message: "Đã xoá." }); qc.invalidateQueries({ queryKey: ["shortlists"] }); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const items = q.data || [];

  return (
    <>
      <PageHeader
        title="Tuyển chọn"
        description="Lọc & xếp hạng program theo tiêu chí riêng — traffic, commission, cookie. Lưu nhiều bộ sưu tập, mỗi bộ một tiêu chí."
        action={
          <Button onClick={() => setOpen(true)}><Plus size={16} /> Tạo shortlist</Button>
        }
      />

      {q.isLoading && <Card><p className="text-sm text-gray-400">Đang tải…</p></Card>}

      {!q.isLoading && items.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="Chưa có shortlist nào"
          description="Tạo shortlist đầu tiên — thiết lập tiêu chí (traffic, commission, cookie), system sẽ tự xếp hạng program phù hợp."
          action={<Button onClick={() => setOpen(true)}><Plus size={16} /> Tạo shortlist</Button>}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((sl) => (
          <Card key={sl.id} className="hover:shadow-lg transition group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <Link href={`/shortlists/${sl.id}`} className="font-semibold text-ink hover:text-primary truncate block">{sl.name}</Link>
                {sl.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sl.description}</p>}
              </div>
              <button
                onClick={() => confirm(`Xoá "${sl.name}"?`) && del.mutate(sl.id)}
                className="opacity-0 group-hover:opacity-100 transition p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                title="Xoá">
                <Trash2 size={14} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="primary">T {Math.round(sl.criteria.weights.traffic * 100)}%</Badge>
              <Badge variant="warning">C {Math.round(sl.criteria.weights.commission * 100)}%</Badge>
              <Badge variant="info">K {Math.round(sl.criteria.weights.cookie * 100)}%</Badge>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
              <span className="flex items-center gap-1"><Target size={12} /> {sl.item_count} program</span>
              <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(sl.updated_at).toLocaleDateString("vi-VN")}</span>
            </div>

            <Link href={`/shortlists/${sl.id}`}
              className="mt-3 block text-center text-sm font-medium text-primary hover:text-primary-600 border border-primary/20 hover:border-primary/40 rounded-lg py-1.5 transition">
              Mở chi tiết →
            </Link>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Tạo shortlist mới" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Tên *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Top Beauty Q1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Mô tả</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ngắn gọn mục đích của shortlist này" />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <CriteriaEditor value={criteria} onChange={setCriteria} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Tạo</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
