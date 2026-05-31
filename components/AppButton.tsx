import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger" | "warning" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  href?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const variantClass: Record<Variant, string> = {
  primary: "bg-cyan-500 text-slate-950 hover:bg-cyan-400",
  danger: "bg-red-500 text-white hover:bg-red-400",
  warning: "bg-yellow-400 text-slate-950 hover:bg-yellow-300",
  secondary: "bg-slate-800 text-white hover:bg-slate-700",
  ghost: "bg-transparent text-slate-300 hover:bg-slate-800",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-3 text-base",
  lg: "px-5 py-4 text-lg",
};

export default function AppButton({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  href,
  ...buttonProps
}: Props) {
  const baseClass =
    "inline-flex items-center justify-center rounded-xl font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

  const classes = `${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button {...buttonProps} className={classes}>
      {children}
    </button>
  );
}