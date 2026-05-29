"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Edit3 } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/lib/toast";

export default function InstructionsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["instructions"], queryFn: api.listInstructions });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const create = useMutation({
    mutationFn: () => api.createInstruction(newName, ""),
    onSuccess: () => { push({ type: "success", message: "Đã tạo." }); qc.invalidateQueries({ queryKey: ["instructions"] }); setCreating(false); setNewName(""); router.push(`/instructions/${encodeURIComponent(newName)}`); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });
  const del = useMutation({
    mutationFn: (name: string) => api.deleteInstruction(name),
    onSuccess: () => { push({ type: "success", message: "Đã xoá." }); qc.invalidateQueries({ queryKey: ["instructions"] }); },
  });

  return (
    <div>
      <PageHeader
        title="Hướng dẫn"
        description="Mỗi hướng dẫn là 1 file TXT — dùng làm system prompt cho phase auto-register / browser-use."
        action={<Button onClick={() => setCreating(true)}><Plus size={16} /> Tạo mới</Button>}
      />

      {creating && (
        <Card className="!p-4 mb-4">
          <div className="flex gap-2">
            <Input autoFocus placeholder="vd: goaffpro-signup.txt" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newName) create.mutate(); }} />
            <Button loading={create.isPending} onClick={() => newName && create.mutate()}>Tạo</Button>
            <Button variant="secondary" onClick={() => { setCreating(false); setNewName(""); }}>Huỷ</Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Chỉ chứa chữ, số, dấu - _ . — vd <code>goaffpro-signup.txt</code></p>
        </Card>
      )}

      {!q.data || q.data.length === 0 ? (
        <Card><EmptyState icon={FileText} title="Chưa có hướng dẫn nào" description="Tạo file đầu tiên để bắt đầu." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {q.data.map((i) => (
            <Card key={i.name} className="hover:border-amber-300 hover:shadow-soft-md transition-all duration-200">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">{i.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{i.size} bytes · {new Date(i.updated_at).toLocaleString("vi-VN")}</div>
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <Link href={`/instructions/${encodeURIComponent(i.name)}`} className="flex-1"><Button size="sm" variant="secondary" className="w-full"><Edit3 size={14} /> Mở</Button></Link>
                <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Xoá "${i.name}"?`)) del.mutate(i.name); }} className="text-red-600 hover:bg-red-50"><Trash2 size={14} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
