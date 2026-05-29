import clsx from "clsx";
import { Loader2 } from "lucide-react";

const palette: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-indigo-50 text-indigo-700 border-indigo-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
  primary: "bg-primary-50 text-primary-700 border-primary-100",
};

export function Badge({ children, variant = "neutral", className }: { children: React.ReactNode; variant?: keyof typeof palette; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", palette[variant], className)}>{children}</span>;
}

const statusMap: Record<string, { label: string; variant: keyof typeof palette; spin?: boolean }> = {
  pending: { label: "Đang chờ", variant: "neutral" },
  running: { label: "Đang chạy", variant: "info", spin: true },
  success: { label: "Thành công", variant: "success" },
  failed: { label: "Thất bại", variant: "error" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const cfg = statusMap[status] || { label: status, variant: "neutral" as const };
  return (
    <Badge variant={cfg.variant}>
      {cfg.spin && <Loader2 size={12} className="animate-spin" />}
      {cfg.label}
    </Badge>
  );
}
