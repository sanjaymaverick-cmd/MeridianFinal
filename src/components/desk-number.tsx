export function DeskNumber({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return <span className={className}>{value}</span>;
}
