"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

/**
 * Quick fade + slide-up transition on every route change.
 * Wrap the <main> content of the app layout.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(path);

  useEffect(() => {
    setKey(path);
  }, [path]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      gsap.set(el, { autoAlpha: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out", clearProps: "transform" },
    );
  }, [key]);

  return (
    <div key={key} ref={ref} className="will-change-transform">
      {children}
    </div>
  );
}
