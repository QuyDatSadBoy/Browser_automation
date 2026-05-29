"use client";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "cta";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref,
) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/40";
  const v = {
    primary: "bg-primary text-white hover:bg-primary-600",
    secondary: "border border-gray-200 bg-white text-ink hover:bg-canvas",
    danger: "bg-red-500 text-white hover:bg-red-600",
    cta: "bg-cta text-white hover:bg-cta-600",
  }[variant];
  const s = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" }[size];
  return (
    <button ref={ref} className={clsx(base, v, s, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
});
