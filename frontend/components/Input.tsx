"use client";
import clsx from "clsx";
import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from "react";

const inputClass = "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...p }, ref,
) {
  return <input ref={ref} className={clsx(inputClass, className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...p }, ref,
) {
  return <textarea ref={ref} className={clsx(inputClass, "min-h-[100px]", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...p }, ref,
) {
  return <select ref={ref} className={clsx(inputClass, "pr-8", className)} {...p}>{children}</select>;
});

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={clsx("block text-sm font-medium text-ink mb-1.5", className)}>{children}</label>;
}
