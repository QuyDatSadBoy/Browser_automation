"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

export function Modal({ open, onClose, title, children, size = "lg" }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${SIZES[size]} max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 shrink-0">
            <h3 className="font-semibold text-ink">{title}</h3>
            <button onClick={onClose} aria-label="Đóng" title="Đóng" className="text-gray-400 hover:text-ink p-1 rounded"><X size={18} /></button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
