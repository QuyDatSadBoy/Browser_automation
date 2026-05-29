"use client";
import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Reveal helper — staggers `[data-reveal]` children inside a container.
 * Usage:
 *   const ref = useReveal();
 *   <section ref={ref}>...children with data-reveal...</section>
 */
export function useReveal(deps: any[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const targets = ref.current?.querySelectorAll<HTMLElement>("[data-reveal]");
      if (!targets || targets.length === 0) return;
      gsap.from(targets, {
        y: 22,
        autoAlpha: 0,
        duration: 0.65,
        ease: "power3.out",
        stagger: { each: 0.06, from: "start" },
        clearProps: "transform,filter",
      });
    },
    { scope: ref, dependencies: deps, revertOnUpdate: true },
  );
  return ref;
}

/**
 * Animate a number counting up to `value` when it first appears
 * (and whenever the value changes).
 */
export function useCountUp(value: number | string | undefined, deps: any[] = []) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const target = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(target)) {
        el.textContent = value == null ? "—" : String(value);
        return;
      }
      const obj = { n: 0 };
      gsap.to(obj, {
        n: target,
        duration: 1.1,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = Math.round(obj.n).toLocaleString("vi-VN");
        },
      });
    },
    { dependencies: [value, ...deps] },
  );
  return ref;
}

/**
 * Reveal child `[data-scroll-reveal]` elements as they enter viewport.
 * Attach the returned ref to a wrapping container.
 */
export function useScrollReveal(deps: any[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const targets = root.querySelectorAll<HTMLElement>("[data-scroll-reveal]");
    if (!targets.length) return;
    const triggers: ScrollTrigger[] = [];
    targets.forEach((el) => {
      gsap.set(el, { autoAlpha: 0, y: 28 });
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () => {
          gsap.to(el, {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: "power3.out",
            clearProps: "transform,filter",
          });
        },
      });
      triggers.push(st);
    });
    return () => triggers.forEach((t) => t.kill());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
