"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  LayoutDashboard, Globe, Briefcase, ListChecks, Users, FileText, LogOut,
  Sparkles, Bot, Menu, X, Megaphone, Library,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/dashboard", label: "Trang chủ", icon: LayoutDashboard },
  { href: "/sources", label: "Nguồn quét", icon: Globe },
  { href: "/programs", label: "Chương trình", icon: Briefcase },
  { href: "/shortlists", label: "Tuyển chọn", icon: Sparkles },
  { href: "/ads-transparency", label: "Google Ads", icon: Megaphone },
  { href: "/signup", label: "Đăng ký tự động", icon: Bot },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/library", label: "Thư viện", icon: Library },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Slide active pill to match the active nav item
  useGSAP(
    () => {
      const nav = navRef.current;
      const pill = pillRef.current;
      if (!nav || !pill) return;
      const active = nav.querySelector<HTMLElement>("[data-active='true']");
      if (!active) {
        gsap.to(pill, { autoAlpha: 0, duration: 0.2 });
        return;
      }
      gsap.to(pill, {
        y: active.offsetTop,
        height: active.offsetHeight,
        autoAlpha: 1,
        duration: 0.45,
        ease: "power3.out",
      });
    },
    { dependencies: [path] },
  );

  // Entrance stagger for nav items on first mount
  useGSAP(
    () => {
      const items = navRef.current?.querySelectorAll<HTMLElement>("[data-nav-item]");
      if (!items?.length) return;
      gsap.from(items, {
        x: -14,
        autoAlpha: 0,
        duration: 0.45,
        ease: "power3.out",
        stagger: 0.04,
      });
    },
    [],
  );

  return (
    <>
      {/* Mobile topbar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white/90 backdrop-blur border-b border-gray-100 flex items-center justify-between px-4 shadow-soft">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="MIC ACE" width={32} height={32} className="rounded-lg" priority />
          <span className="font-bold text-ink text-[15px]">MIC ACE</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
        >
          <Menu size={20} />
        </button>
      </header>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col shadow-soft",
          "transition-transform duration-300 ease-out",
          "lg:translate-x-0 lg:w-60",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <Image src="/logo.jpg" alt="MIC ACE" width={40} height={40} className="rounded-xl shadow-soft flex-shrink-0" priority />
            <div className="min-w-0">
              <div className="font-bold text-[15px] text-ink leading-tight truncate">MIC ACE</div>
              <div className="text-[10px] text-gray-400 mt-0.5 font-medium tracking-widest uppercase">Affiliate Hub</div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <nav ref={navRef} className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto relative">
          {/* Sliding active pill */}
          <div
            ref={pillRef}
            aria-hidden
            className="absolute left-3 right-3 top-0 rounded-lg bg-primary-50 pointer-events-none"
            style={{ opacity: 0, height: 0 }}
          />
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || (href !== "/dashboard" && path.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                data-nav-item
                data-active={active ? "true" : "false"}
                className={clsx(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer z-10",
                  active
                    ? "text-primary-600"
                    : "text-gray-500 hover:bg-gray-50 hover:text-ink",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                )}
                <Icon size={17} className={active ? "text-primary" : "text-gray-400"} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white font-semibold text-sm shadow-soft">
                {user?.email[0]?.toUpperCase() || "?"}
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-cta rounded-full border-2 border-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink truncate leading-none">{user?.email || "—"}</div>
              <div className="text-xs text-gray-400 mt-0.5">User #{user?.id}</div>
            </div>
          </div>
          <button
            onClick={async () => { await logout(); router.push("/login"); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150 cursor-pointer"
          >
            <LogOut size={14} /> Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}
