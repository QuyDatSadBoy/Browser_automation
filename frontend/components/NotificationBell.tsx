"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, AlertCircle, Info, Trash2, X } from "lucide-react";
import { useNotifications, type NotificationItem } from "@/lib/toast";

function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

function Icon({ type }: { type: NotificationItem["type"] }) {
  if (type === "success") return <CheckCircle2 size={16} className="text-cta shrink-0 mt-0.5" />;
  if (type === "error") return <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />;
  return <Info size={16} className="text-primary shrink-0 mt-0.5" />;
}

export function NotificationBell() {
  const { history, unreadCount, markAllRead, removeNotification, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && unreadCount > 0) {
        // Mark read after a short delay so user sees the badge first
        setTimeout(() => markAllRead(), 300);
      }
      return next;
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Thông báo"
        title="Thông báo"
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 shadow-soft hover:border-primary-200 transition"
      >
        <Bell size={18} className="text-ink" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[480px] flex flex-col rounded-xl border border-gray-200 bg-white shadow-soft-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="font-semibold text-ink text-sm">Thông báo</div>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-gray-500 hover:text-red-500 inline-flex items-center gap-1"
                  title="Xoá tất cả"
                >
                  <Trash2 size={13} /> Xoá hết
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                title="Đóng"
                className="text-gray-400 hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                Chưa có thông báo nào
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {history.map((n) => {
                  const body = (
                    <>
                      <Icon type={n.type} />
                      <div className="flex-1 min-w-0">
                        {n.title && (
                          <p className="text-xs font-semibold text-ink truncate" title={n.title}>{n.title}</p>
                        )}
                        <p className="text-sm text-ink leading-snug break-words">{n.message}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {timeAgo(n.createdAt)}
                          {n.href && <span className="ml-2 text-primary">Mở chi tiết →</span>}
                        </p>
                      </div>
                    </>
                  );
                  const rowCls = `group flex items-start gap-2 px-4 py-3 hover:bg-gray-50 ${n.read ? "" : "bg-primary-50/30"} ${n.href ? "cursor-pointer" : ""}`;
                  return (
                    <li key={n.id} className="relative">
                      {n.href ? (
                        <Link href={n.href} onClick={() => setOpen(false)} className={rowCls}>
                          {body}
                        </Link>
                      ) : (
                        <div className={rowCls}>{body}</div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeNotification(n.id); }}
                        aria-label="Xoá"
                        title="Xoá"
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
