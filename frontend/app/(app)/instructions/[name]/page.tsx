"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Eye, EyeOff, Columns2 } from "lucide-react";
import dynamic from "next/dynamic";
import * as api from "@/lib/api";
import { Button } from "@/components/Button";
import { useToast } from "@/lib/toast";

// Lazy-load MDEditor — tránh SSR issues
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type ViewMode = "edit" | "preview" | "split";

export default function InstructionEdit({ params }: { params: { name: string } }) {
  const { name } = params;
  const decoded = decodeURIComponent(name);
  const router = useRouter();
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["instruction", decoded], queryFn: () => api.getInstruction(decoded) });
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");

  useEffect(() => {
    if (q.data) { setContent(q.data.content ?? ""); setDirty(false); }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.updateInstruction(decoded, content),
    onSuccess: () => {
      push({ type: "success", message: "Đã lưu hướng dẫn." });
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["instructions"] });
      qc.invalidateQueries({ queryKey: ["instruction", decoded] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) save.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, save]);

  const lineCount = content.split("\n").length;

  if (q.isLoading) return <div className="text-gray-500 py-10 text-center">Đang tải...</div>;
  if (!q.data) return <div className="text-red-500 py-10 text-center">Không tìm thấy hướng dẫn.</div>;

  return (
    <div className="flex flex-col gap-4" data-color-mode="light">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/library?tab=instruction")}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary"
          >
            <ArrowLeft size={16} /> Quay lại
          </button>
          <div>
            <h1 className="text-xl font-bold text-ink leading-tight">{decoded}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {lineCount} dòng · {content.length} ký tự
              {q.data.updated_at ? ` · Cập nhật: ${new Date(q.data.updated_at).toLocaleString("vi-VN")}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${viewMode === "edit" ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-50"}`}
              title="Chỉ soạn thảo"
            >
              <EyeOff size={13} /> Soạn
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors border-x border-gray-200 ${viewMode === "split" ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-50"}`}
              title="Soạn thảo + Xem trước"
            >
              <Columns2 size={13} /> Chia đôi
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${viewMode === "preview" ? "bg-primary text-white" : "text-gray-500 hover:bg-gray-50"}`}
              title="Chỉ xem trước"
            >
              <Eye size={13} /> Xem
            </button>
          </div>

          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            <Save size={14} />
            {dirty ? "Lưu •" : "Lưu"}
          </Button>
        </div>
      </div>

      {dirty && (
        <p className="text-xs text-amber-600 -mt-2">
          Ctrl+S để lưu nhanh · Có thay đổi chưa lưu
        </p>
      )}

      {/* MDEditor — toolbar đầy đủ như TinyMCE */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <MDEditor
          value={content}
          onChange={(val) => { setContent(val ?? ""); setDirty(true); }}
          preview={viewMode === "split" ? "live" : viewMode === "preview" ? "preview" : "edit"}
          height={640}
          visibleDragbar={false}
          textareaProps={{ placeholder: "# Viết hướng dẫn ở đây...\n\nHỗ trợ Markdown: **bold**, _italic_, # header, - list, `code`..." }}
          style={{ borderRadius: 0, border: "none" }}
        />
      </div>
    </div>
  );
}
