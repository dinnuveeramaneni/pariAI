"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

type DraggableComponentProps = {
  id: string;
  label: string;
  componentType: "DIMENSION" | "METRIC" | "SEGMENT" | "DATE_RANGE";
  componentKey: string;
  onAdd?: () => void;
  addLabel?: string;
};

export function DraggableComponent({
  id,
  label,
  componentType,
  componentKey,
  onAdd,
  addLabel,
}: DraggableComponentProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { componentType, componentKey },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div className="flex items-center">
      <button
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className="w-full rounded-xl border border-slate-300/90 bg-white px-3 py-2 text-left text-[13px] font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:border-slate-400 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        type="button"
      >
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}
