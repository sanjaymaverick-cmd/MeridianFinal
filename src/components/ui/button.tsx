import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[opacity,transform,background-color,color] duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:opacity-90 active:scale-[0.98]",
        outline:
          "border border-border bg-transparent text-fg hover:bg-elevated active:scale-[0.98]",
        ghost: "text-muted hover:text-fg hover:bg-elevated",
        danger: "bg-down text-fg hover:opacity-90 active:scale-[0.98]",
      },
      size: {
        default: "h-11 rounded-[8px] px-4",
        sm: "h-9 rounded-[8px] px-3 text-xs",
        lg: "h-12 rounded-[12px] px-5",
        icon: "size-11 rounded-[8px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
