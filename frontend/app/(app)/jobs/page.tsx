"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { JobStatusBadge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

export default function JobsPage() {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: api.listJobs, refetchInterval: 2000 });

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Lịch sử các phiên crawl. Tự động làm mới mỗi 2 giây."
        action={<Button variant="secondary" onClick={() => qc.invalidateQueries({ queryKey: ["jobs"] })}>Làm mới</Button>}
      />

      <Card className="!p-0 overflow-hidden">
        {!jobs.data || jobs.data.length === 0 ? (
          <EmptyState icon={ListChecks} title="Chưa có job nào" description='Vào "Nguồn quét" để bắt đầu một phiên crawl.' />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-xs uppercase text-gray-500 tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left w-16">ID</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-right">Found / Saved</th>
                <th className="px-4 py-3 text-left">Bắt đầu</th>
                <th className="px-4 py-3 text-left">Kết thúc</th>
                <th className="px-4 py-3 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.data.map((j) => (
                <tr key={j.id} className="hover:bg-primary-50/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-400">#{j.id}</td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {j.source}
                    {j.params && Object.keys(j.params).length > 0 && (
                      <span className="ml-2 text-[11px] text-gray-400">
                        ({Object.entries(j.params).map(([k, v]) => `${k}=${v}`).join(", ")})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><JobStatusBadge status={j.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{j.total_saved} / {j.total_found}</td>
                  <td className="px-4 py-3 text-gray-500">{j.started_at ? new Date(j.started_at + "Z").toLocaleTimeString("vi-VN") : "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{j.finished_at ? new Date(j.finished_at + "Z").toLocaleTimeString("vi-VN") : "—"}</td>
                  <td className="px-4 py-3 text-red-600 text-xs max-w-[300px] truncate">{j.error || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
