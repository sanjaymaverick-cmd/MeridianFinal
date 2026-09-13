import { cn } from "@/lib/utils";
import { useDesk } from "@/lib/desk-store";

export function FlashPx({
  symbol,
  children,
  className,
}: {
  symbol: string;
  children: React.ReactNode;
  className?: string;
}) {
  const dir = useDesk((s) => s.flash[symbol]);
  return <span className={cn(dir === "up" ? "flash-up" : dir === "down" ? "flash-down" : "", className)}>{children}</span>;
}
