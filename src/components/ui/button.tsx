import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-[color,background-color,transform] duration-150 ease-out select-none touch-manipulation disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/50 active:scale-[0.96]",
  {
    variants: {
      variant: {
        primary: "bg-cream text-ink hover:bg-cream/90",
        secondary:
          "glass-chip text-fg hover:bg-cream/10",
        ghost: "text-fg-muted hover:text-fg hover:bg-fg/5",
        rail: "bg-rail text-cream hover:brightness-110",
      },
      size: {
        default: "h-11 rounded-xl px-5 text-sm",
        sm: "h-9 rounded-lg px-3 text-sm",
        lg: "h-12 rounded-2xl px-6 text-base",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
