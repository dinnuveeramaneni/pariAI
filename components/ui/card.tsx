import type { PropsWithChildren } from "react";
import { cn } from "@/lib/cn";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ className, children }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}
