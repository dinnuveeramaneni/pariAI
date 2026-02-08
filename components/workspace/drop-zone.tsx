"use client";

import type { PropsWithChildren } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";

type DropZoneProps = PropsWithChildren<{
  id: string;
  label: string;
}>;

export function DropZone({ id, label, children }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "rounded-md border border-dashed border-slate-300 bg-slate-50 p-2",
        isOver && "border-slate-700 bg-slate-100",
      )}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
