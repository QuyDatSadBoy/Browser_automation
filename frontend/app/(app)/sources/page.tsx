"use client";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, Sparkles, ShoppingBag, Trophy, ExternalLink, Loader2 } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { useToast } from "@/lib/toast";

const ICONS: Record<string, any> = {
  trophy: Trophy,
  sparkles: Sparkles,
  "shopping-bag": ShoppingBag,
  globe: Globe,
};

const SOURCE_COLORS: Record<string, { from: string; icon: string; ring: string }> = {
  openaffiliate: { from: "from-indigo-500 to-indigo-600", icon: "text-indigo-500", ring: "ring-indigo-200" },
  lovable: { from: "from-pink-500 to-rose-500", icon: "text-pink-500", ring: "ring-pink-200" },
  goaffpro: { from: "from-emerald-500 to-teal-500", icon: "text-emerald-500", ring: "ring-emerald-200" },
};

export default function SourcesPage() {
  const { push } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const [selected, setSelected] = useState<Record<string, Record<string, string>>>({});

  const crawl = useMutation({
    mutationFn: ({ code, params }: { code: string; params?: Record<string, any> }) => api.startCrawl(code, params),
    onSuccess: (data) => {
      push({ type: "success", message: `Đã thêm vào hàng đợi — Job #${data.job_id} (${data.source})` });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      setTimeout(() => router.push("/jobs"), 600);
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nguồn quét"
        description="Chọn 1 trang nguồn — hệ thống sẽ crawl và lưu các affiliate program vào DB."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {sources.data?.map((s) => {
          const Icon = ICONS[s.icon_hint] || Globe;
          const c = SOURCE_COLORS[s.code] || { from: "from-gray-400 to-gray-500", icon: "text-gray-500", ring: "ring-gray-200" };
          const isLoading = crawl.isPending && crawl.variables?.code === s.code;
          const opts = s.options || [];
          const currentSel = selected[s.code] || {};
          const buildParams = () => {
            const p: Record<string, string> = {};
            opts.forEach((o) => { p[o.key] = currentSel[o.key] ?? o.default ?? o.choices[0]?.value ?? ""; });
            return p;
          };
          return (
            <Card key={s.code} className="flex flex-col overflow-hidden !p-0 hover:shadow-soft-md transition-shadow duration-200">
              {/* Gradient top strip */}
              <div className={`h-1.5 bg-gradient-to-r ${c.from}`} />
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ring-2 ${c.ring} bg-white flex items-center justify-center`}>
                    <Icon size={22} className={c.icon} />
                  </div>
                  {s.highlight && (
                    <Badge variant="warning" className="text-[11px]">⭐ Ưu tiên</Badge>
                  )}
                </div>
                <h3 className="text-[15px] font-bold text-ink">{s.name}</h3>
                <p className="text-sm text-gray-400 mt-1.5 flex-1 leading-relaxed">{s.description}</p>
                <a href={s.base_url} target="_blank" rel="noreferrer"
                  className="text-xs text-gray-400 hover:text-primary inline-flex items-center gap-1 mt-3 transition-colors max-w-full">
                  <span className="truncate">{s.base_url}</span> <ExternalLink size={10} className="shrink-0" />
                </a>
                {opts.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {opts.map((o) => (
                      <div key={o.key}>
                        <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1">{o.label}</label>
                        <select
                          aria-label={o.label}
                          value={currentSel[o.key] ?? o.default ?? o.choices[0]?.value}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [s.code]: { ...(prev[s.code] || {}), [o.key]: e.target.value },
                            }))
                          }
                          className="w-full text-sm bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-soft-inset focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {o.choices.map((ch) => (
                            <option key={ch.value} value={ch.value}>{ch.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex items-center justify-between pt-4 border-t border-gray-50">
                  <Badge variant="success">Đang hoạt động</Badge>
                  <Button
                    variant="cta"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => crawl.mutate({ code: s.code, params: opts.length ? buildParams() : undefined })}
                    className="gap-1.5"
                  >
                    {isLoading ? <><Loader2 size={13} className="animate-spin" /> Đang quét…</> : "Quét ngay"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
