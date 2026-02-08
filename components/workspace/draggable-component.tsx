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
    <div className="flex items-center gap-1">
      <button
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        type="button"
      >
        {label}
      </button>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="h-8 min-w-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          aria-label={addLabel ?? `Add ${label}`}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
