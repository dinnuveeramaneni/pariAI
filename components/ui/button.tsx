"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const variantClass: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed",
};

export function Button({
  className,
  variant = "primary",
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
