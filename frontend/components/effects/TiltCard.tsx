"use client";
import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import clsx from "clsx";

/**
 * 3D tilt-on-hover wrapper. Uses gsap.quickTo for buttery-smooth pointer tracking.
 * Wraps children in a perspective container; child receives rotateX/rotateY.
 *
 *   <TiltCard className="...">
 *     <YourCardContent />
 *   </TiltCard>
 */
export function TiltCard({
  children,
  className,
  intensity = 8, // max degrees of tilt
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
  glare?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const rxRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const ryRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const gxRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const gyRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const goRef = useRef<ReturnType<typeof gsap.quickTo> | null>(null);

  const ensure = () => {
    if (!innerRef.current) return;
    if (!rxRef.current) {
      rxRef.current = gsap.quickTo(innerRef.current, "rotationX", { duration: 0.45, ease: "power3.out" });
      ryRef.current = gsap.quickTo(innerRef.current, "rotationY", { duration: 0.45, ease: "power3.out" });
    }
    if (glare && glareRef.current && !gxRef.current) {
      gxRef.current = gsap.quickTo(glareRef.current, "x", { duration: 0.4, ease: "power3.out" });
      gyRef.current = gsap.quickTo(glareRef.current, "y", { duration: 0.4, ease: "power3.out" });
      goRef.current = gsap.quickTo(glareRef.current, "opacity", { duration: 0.3, ease: "power2.out" });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    ensure();
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * intensity;
    const ry = (px - 0.5) * intensity;
    rxRef.current?.(rx);
    ryRef.current?.(ry);
    if (glare && glareRef.current) {
      gxRef.current?.(px * r.width - 80);
      gyRef.current?.(py * r.height - 80);
      goRef.current?.(0.35);
    }
  };

  const reset = () => {
    rxRef.current?.(0);
    ryRef.current?.(0);
    goRef.current?.(0);
  };

  return (
    <div
      ref={wrapRef}
      className={clsx("relative", className)}
      style={{ perspective: 900 }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      <div
        ref={innerRef}
        className="relative h-full w-full will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
        {glare && (
          <div
            ref={glareRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 w-40 h-40 rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, rgba(255,255,255,0.55), rgba(255,255,255,0))",
              opacity: 0,
              mixBlendMode: "overlay",
            }}
          />
        )}
      </div>
    </div>
  );
}
