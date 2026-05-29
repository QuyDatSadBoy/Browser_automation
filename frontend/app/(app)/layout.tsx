"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/Sidebar";
import { ShaderBackground } from "@/components/effects/ShaderBackground";
import { PageTransition } from "@/components/effects/PageTransition";
import { NotificationBell } from "@/components/NotificationBell";
import { TrafficJobIndicator } from "@/components/TrafficJobIndicator";
import { TrafficJobProvider } from "@/lib/traffic-job-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    );
  }

  return (
    <TrafficJobProvider>
      <div className="min-h-screen bg-canvas relative">
        <ShaderBackground />
        <Sidebar />
        <div className="fixed top-2 right-14 lg:top-4 lg:right-6 z-[110] flex items-center gap-2">
          <TrafficJobIndicator />
          <NotificationBell />
        </div>
        <main className="lg:ml-60 pt-14 lg:pt-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 min-h-screen relative">
          <div className="max-w-7xl mx-auto">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </TrafficJobProvider>
  );
}
