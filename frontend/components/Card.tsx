import clsx from "clsx";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl bg-white border border-gray-100 p-6 shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
