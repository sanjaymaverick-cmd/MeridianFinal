import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[8px] border border-border bg-elevated px-3 text-sm text-fg placeholder:text-subtle outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-[12px] border border-border bg-elevated px-3 py-2.5 text-sm text-fg placeholder:text-subtle outline-none",
        className,
      )}
      {...props}
    />
  );
}
