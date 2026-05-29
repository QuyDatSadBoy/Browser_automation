import { Inbox } from "lucide-react";

export function EmptyState({ title, description, action, icon: Icon = Inbox }: { title: string; description?: string; action?: React.ReactNode; icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-canvas flex items-center justify-center mb-4">
        <Icon size={28} className="text-primary" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
