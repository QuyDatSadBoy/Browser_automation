"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Users, FileText, ListChecks, Globe, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { JobStatusBadge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useReveal, useCountUp, useScrollReveal } from "@/lib/motion";
import { TiltCard } from "@/components/effects/TiltCard";

export default function Dashboard() {
  const programs = useQuery({ queryKey: ["programs", { page_size: 1 }], queryFn: () => api.listPrograms({ page_size: 1 }) });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const instructions = useQuery({ queryKey: ["instructions"], queryFn: api.listInstructions });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: api.listJobs, refetchInterval: 3000 });

  const stats = [
    { label: "Tổng programs", value: programs.data?.total, icon: Briefcase, iconBg: "bg-primary-50", iconColor: "text-primary", href: "/programs" },
    { label: "Profiles", value: profiles.data?.length, icon: Users, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", href: "/profiles" },
    { label: "Hướng dẫn", value: instructions.data?.length, icon: FileText, iconBg: "bg-amber-50", iconColor: "text-amber-600", href: "/instructions" },
    { label: "Tổng jobs", value: jobs.data?.length, icon: ListChecks, iconBg: "bg-violet-50", iconColor: "text-violet-600", href: "/jobs" },
  ];

  const recentJobs = (jobs.data || []).slice(0, 5);
  const revealRef = useReveal([programs.data, profiles.data, instructions.data, jobs.data]);
  const scrollRef = useScrollReveal([jobs.data]);

  return (
    <div ref={revealRef} className="space-y-6">
      {/* Hero */}
      <div data-reveal className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card p-6 sm:p-8">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-12 w-64 h-64 rounded-full bg-cta/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-soft">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Chào mừng trở lại,
              <span className="text-primary"> MIC ACE</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">Tổng quan hệ thống quản lý affiliate program — realtime, mượt và rõ ràng.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickAction href="/sources" icon={Globe} title="Quét nguồn mới" desc="Chọn 1 trong 3 nguồn và bắt đầu crawl." color="text-primary" bg="bg-primary-50 group-hover:bg-primary" />
        <QuickAction href="/profiles/new" icon={Users} title="Tạo profile" desc="Quản lý danh tính ảo phục vụ auto-register." color="text-emerald-600" bg="bg-emerald-50 group-hover:bg-emerald-600" />
        <QuickAction href="/instructions" icon={FileText} title="Viết hướng dẫn" desc="Tạo hướng dẫn cho từng workflow / site." color="text-amber-600" bg="bg-amber-50 group-hover:bg-amber-500" />
      </div>

      {/* Recent jobs */}
      <div ref={scrollRef}>
      <div data-scroll-reveal>
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-ink">Jobs gần đây</h2>
              <p className="text-xs text-gray-400 mt-0.5">Cập nhật mỗi 3 giây</p>
            </div>
            <Link href="/jobs" className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
              Xem tất cả <ArrowRight size={13} />
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <EmptyState title="Chưa có job nào" description="Vào trang Nguồn quét để bắt đầu." />
          ) : (
            <div className="divide-y divide-gray-50">
              {recentJobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-gray-300 w-8">#{j.id}</span>
                    <div>
                      <div className="text-sm font-medium text-ink capitalize">{j.source}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{new Date(j.created_at + "Z").toLocaleString("vi-VN")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 tabular-nums">{j.total_saved}/{j.total_found} programs</span>
                    <JobStatusBadge status={j.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, href }: any) {
  const numRef = useCountUp(value, [value]);
  return (
    <Link href={href} data-reveal>
      <TiltCard intensity={6}>
        <Card className="!p-5 hover:shadow-soft-md transition-shadow duration-200 cursor-pointer group">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
              <Icon size={18} className={iconColor} />
            </div>
            <ArrowUpRight size={14} className="text-gray-300 group-hover:text-primary transition-colors" />
          </div>
          <div className="text-3xl font-bold text-ink tabular-nums">
            <span ref={numRef}>—</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 font-medium">{label}</div>
        </Card>
      </TiltCard>
    </Link>
  );
}

function QuickAction({ href, icon: Icon, title, desc, color, bg }: any) {
  return (
    <Link href={href} className="block" data-reveal>
      <TiltCard intensity={5}>
        <Card className="hover:shadow-soft-md transition-shadow duration-200 cursor-pointer group !p-5 h-full">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${bg}`}>
              <Icon size={19} className={`${color} group-hover:text-white transition-colors duration-200`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink text-sm">{title}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</div>
            </div>
            <ArrowRight size={16} className="text-gray-200 group-hover:text-gray-400 mt-1 transition-colors flex-shrink-0" />
          </div>
        </Card>
      </TiltCard>
    </Link>
  );
}
