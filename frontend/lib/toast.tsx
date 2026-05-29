"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string; title?: string; href?: string };
export type NotificationItem = { id: number; type: ToastType; message: string; title?: string; href?: string; createdAt: number; read: boolean };

type Ctx = {
  push: (t: Omit<Toast, "id">) => void;
  history: NotificationItem[];
  unreadCount: number;
  markAllRead: () => void;
  removeNotification: (id: number) => void;
  clearAll: () => void;
};

const ToastCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "mic_ace_notifications_v1";
const MAX_HISTORY = 100;

function loadHistory(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(items: NotificationItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {}
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const [history, setHistory] = useState<NotificationItem[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    setHistory(loadHistory());
    hydrated.current = true;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHistory(loadHistory());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (hydrated.current) saveHistory(history);
  }, [history]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setHistory((h) => [{ id, type: t.type, message: t.message, title: t.title, href: t.href, createdAt: Date.now(), read: false }, ...h].slice(0, MAX_HISTORY));
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);

  const markAllRead = useCallback(() => {
    setHistory((h) => h.map((x) => (x.read ? x : { ...x, read: true })));
  }, []);

  const removeNotification = useCallback((id: number) => {
    setHistory((h) => h.filter((x) => x.id !== id));
  }, []);

  const clearAll = useCallback(() => setHistory([]), []);

  const unreadCount = useMemo(() => history.reduce((n, x) => n + (x.read ? 0 : 1), 0), [history]);

  const value = useMemo<Ctx>(
    () => ({ push, history, unreadCount, markAllRead, removeNotification, clearAll }),
    [push, history, unreadCount, markAllRead, removeNotification, clearAll],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[200] space-y-2 w-[340px] pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-soft-md animate-fade-in ${
            t.type === "success" ? "border-emerald-200" : t.type === "error" ? "border-red-200" : "border-primary-200"
          }`}>
            {t.type === "success" && <CheckCircle2 size={20} className="text-cta shrink-0 mt-0.5" />}
            {t.type === "error" && <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />}
            {t.type === "info" && <Info size={20} className="text-primary shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-xs font-semibold text-ink truncate">{t.title}</p>}
              <p className="text-sm text-ink leading-snug">{t.message}</p>
              {t.href && (
                <a href={t.href} className="mt-1 inline-block text-xs text-primary hover:underline">Mở chi tiết →</a>
              )}
            </div>
            <button type="button" aria-label="Đóng" title="Đóng" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-gray-400 hover:text-ink">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast phải dùng trong ToastProvider");
  return { push: v.push };
}

export function useNotifications() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useNotifications phải dùng trong ToastProvider");
  return v;
}
