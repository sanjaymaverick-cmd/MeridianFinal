import { Button } from "@/components/ui/button";

export function Confirm({
  title,
  body,
  action,
  danger,
  onCancel,
  onOk,
}: {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  onCancel: () => void;
  onOk: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[24px] border border-border bg-surface p-5 shadow-soft"
      >
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "default"} onClick={onOk}>
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}
