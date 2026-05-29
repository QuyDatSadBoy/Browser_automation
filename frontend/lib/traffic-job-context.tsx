"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { TrafficScanJob } from "@/lib/api";
import { useToast } from "@/lib/toast";

const STORAGE_KEY = "mic-ace.traffic-job-id";

type Ctx = {
  jobId: number | null;
  job: TrafficScanJob | null;
  isRunning: boolean;
  setJobId: (id: number | null) => void;
  clear: () => void;
};

const TrafficJobContext = createContext<Ctx | null>(null);

export function TrafficJobProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [jobId, setJobIdState] = useState<number | null>(null);
  const [reportedJobId, setReportedJobId] = useState<number | null>(null);

  // Khôi phục jobId từ localStorage khi mount (job vẫn chạy nền dưới BE)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) setJobIdState(n);
      }
    } catch {}
  }, []);

  const setJobId = useCallback((id: number | null) => {
    setJobIdState(id);
    setReportedJobId(null);
    try {
      if (id == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(id));
    } catch {}
  }, []);

  const clear = useCallback(() => setJobId(null), [setJobId]);

  const jobQuery = useQuery({
    queryKey: ["trafficScanJob", jobId],
    queryFn: () => api.getTrafficScanJob(jobId as number),
    enabled: jobId != null,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "success" || s === "failed") return false;
      return 1500;
    },
  });

  const job = jobQuery.data || null;
  const isRunning = job != null && (job.status === "pending" || job.status === "running");

  // Toast khi job kết thúc (chỉ 1 lần / job, kể cả khi user ở trang khác)
  useEffect(() => {
    if (!job) return;
    if (job.status !== "success" && job.status !== "failed") return;
    if (reportedJobId === job.id) return;
    setReportedJobId(job.id);
    if (job.status === "failed") {
      push({ type: "error", message: `Quét traffic thất bại: ${job.error || "lỗi không xác định"}` });
    } else {
      const parts = [`quét ${job.scanned}`, `tìm thấy ${job.found}`];
      if (job.skipped) parts.push(`bỏ qua ${job.skipped}`);
      if (job.failed) parts.push(`lỗi ${job.failed}`);
      push({
        type: job.failed > 0 ? "info" : "success",
        message: `Quét traffic xong: ${parts.join(", ")} (tổng ${job.total}).`,
      });
    }
    qc.invalidateQueries({ queryKey: ["programs"] });
    qc.invalidateQueries({ queryKey: ["program"] });
    qc.invalidateQueries({ queryKey: ["programs-traffic-chart"] });
  }, [job, reportedJobId, push, qc]);

  return (
    <TrafficJobContext.Provider value={{ jobId, job, isRunning, setJobId, clear }}>
      {children}
    </TrafficJobContext.Provider>
  );
}

export function useTrafficJob() {
  const v = useContext(TrafficJobContext);
  if (!v) throw new Error("useTrafficJob phải dùng trong TrafficJobProvider");
  return v;
}
