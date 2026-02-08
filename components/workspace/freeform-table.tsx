"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";

type RowData = Record<string, string | number | null>;

type FreeformTableProps = {
  rowDimension: string | null;
  metrics: string[];
  rows: RowData[];
  totals?: Record<string, number>;
  onSortChange: (key: string) => void;
  onRemoveMetric?: (key: string) => void;
  onBreakdown?: (dimensionValue: string) => void;
  labelForKey?: (key: string) => string;
};

const ROW_COLUMN_KEY = "__row__";
const ROW_DEFAULT_WIDTH = 420;
const METRIC_DEFAULT_WIDTH = 220;
const ROW_MIN_WIDTH = 220;
const METRIC_MIN_WIDTH = 140;

function formatMetric(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }

  const num = Number(value);
  if (Number.isFinite(num)) {
    return num.toLocaleString();
  }

  return String(value ?? "0");
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function FreeformTable({
  rowDimension,
  metrics,
  rows,
  totals,
  onSortChange,
  onRemoveMetric,
  onBreakdown,
  labelForKey,
}: FreeformTableProps) {
  const rowLabel = rowDimension
    ? (labelForKey ? labelForKey(rowDimension) : rowDimension)
    : "Rows";
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    [ROW_COLUMN_KEY]: ROW_DEFAULT_WIDTH,
  });
  const [activeResizeKey, setActiveResizeKey] = useState<string | null>(null);
  const resizeStateRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const metricStats = useMemo(() => {
    const stats = new Map<string, { max: number; total: number; values: number[] }>();
    for (const metric of metrics) {
      const values = rows.map((row) => toNumber(row[metric]));
      const max = values.length > 0 ? Math.max(...values) : 0;
      const fallbackTotal = values.reduce((sum, value) => sum + value, 0);
      const total = totals?.[metric] ?? fallbackTotal;
      stats.set(metric, { max, total, values });
    }
    return stats;
  }, [metrics, rows, totals]);

  const clearResizeState = useCallback(() => {
    resizeStateRef.current = null;
    setActiveResizeKey(null);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const minWidth =
        resizeState.key === ROW_COLUMN_KEY
          ? ROW_MIN_WIDTH
          : METRIC_MIN_WIDTH;
      const nextWidth = Math.max(minWidth, resizeState.startWidth + delta);

      setColumnWidths((previous) => {
        if (previous[resizeState.key] === nextWidth) {
          return previous;
        }
        return {
          ...previous,
          [resizeState.key]: nextWidth,
        };
      });
    };

    const onPointerUp = () => {
      if (!resizeStateRef.current) {
        return;
      }
      clearResizeState();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      clearResizeState();
    };
  }, [clearResizeState]);

  const startResize = (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const startWidth =
      columnWidths[key] ??
      (key === ROW_COLUMN_KEY ? ROW_DEFAULT_WIDTH : METRIC_DEFAULT_WIDTH);

    resizeStateRef.current = {
      key,
      startX: event.clientX,
      startWidth,
    };
    setActiveResizeKey(key);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const tableWidth = useMemo(() => {
    let total = columnWidths[ROW_COLUMN_KEY] ?? ROW_DEFAULT_WIDTH;
    for (const metric of metrics) {
      total += columnWidths[metric] ?? METRIC_DEFAULT_WIDTH;
    }
    return total;
  }, [columnWidths, metrics]);

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
      <div className="max-h-[460px] overflow-auto">
        <table
          className="table-fixed border-collapse"
          style={{ width: `${tableWidth}px`, minWidth: "100%" }}
        >
          <colgroup>
            <col
              style={{
                width: `${columnWidths[ROW_COLUMN_KEY] ?? ROW_DEFAULT_WIDTH}px`,
              }}
            />
            {metrics.map((metric) => (
              <col
                key={metric}
                style={{
                  width: `${columnWidths[metric] ?? METRIC_DEFAULT_WIDTH}px`,
                }}
              />
            ))}
          </colgroup>
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="relative border-b border-slate-300 px-3 py-2 pr-6 text-left font-semibold">
                {rowLabel}
                <button
                  type="button"
                  onPointerDown={(event) => startResize(ROW_COLUMN_KEY, event)}
                  className={cn(
                    "absolute inset-y-0 right-0 flex w-4 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500",
                  )}
                  aria-label={`Resize ${rowLabel} column`}
                  title={`Resize ${rowLabel} column`}
                >
                  <span
                    className={cn(
                      "h-5 w-px bg-slate-300",
                      activeResizeKey === ROW_COLUMN_KEY && "bg-slate-600",
                    )}
                  />
                </button>
              </th>
              {metrics.map((metric) => {
                return (
                  <th
                    key={metric}
                    className="relative border-b border-slate-300 px-3 py-2 pr-6 text-right font-semibold"
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onSortChange(metric)}
                        className="inline-flex items-center gap-1 text-right text-xs font-semibold uppercase tracking-wide text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                        aria-label={`Sort by ${labelForKey ? labelForKey(metric) : metric}`}
                      >
                        {labelForKey ? labelForKey(metric) : metric}
                      </button>
                      {onRemoveMetric ? (
                        <button
                          type="button"
                          onClick={() => onRemoveMetric(metric)}
                          className="rounded px-1 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          aria-label={`Remove ${labelForKey ? labelForKey(metric) : metric}`}
                          title={`Remove ${labelForKey ? labelForKey(metric) : metric}`}
                        >
                          x
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onPointerDown={(event) => startResize(metric, event)}
                      className={cn(
                        "absolute inset-y-0 right-0 flex w-4 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500",
                      )}
                      aria-label={`Resize ${labelForKey ? labelForKey(metric) : metric} column`}
                      title={`Resize ${labelForKey ? labelForKey(metric) : metric} column`}
                    >
                      <span
                        className={cn(
                          "h-5 w-px bg-slate-300",
                          activeResizeKey === metric && "bg-slate-600",
                        )}
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1 + metrics.length, 1)}
                  className="px-3 py-10 text-center text-sm text-slate-500"
                >
                  No rows returned for this query.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const dimensionValue = rowDimension
                  ? String(row[rowDimension] ?? "(none)")
                  : `${index + 1}`;
                return (
                  <tr key={`${dimensionValue}-${index}`} className="border-b border-slate-200">
                    <td
                      className={cn(
                        "px-3 py-2 text-sm text-slate-700",
                        index === 0 && "border-l-2 border-amber-400",
                      )}
                    >
                      <span className="mr-2 text-xs text-slate-500">{index + 1}.</span>
                      {onBreakdown && rowDimension ? (
                        <button
                          type="button"
                          className="rounded-sm text-left text-sm text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          onClick={() => onBreakdown(dimensionValue)}
                        >
                          {dimensionValue}
                        </button>
                      ) : (
                        <span>{dimensionValue}</span>
                      )}
                    </td>

                    {metrics.map((metric) => {
                      const numericValue = toNumber(row[metric]);
                      const stat = metricStats.get(metric);
                      const max = stat?.max ?? 0;
                      const total = stat?.total ?? 0;
                      const barWidth = max > 0 ? (numericValue / max) * 100 : 0;
                      const percent = total > 0 ? (numericValue / total) * 100 : 0;
                      return (
                        <td key={`${metric}-${index}`} className="px-0 py-0">
                          <div className="relative px-3 py-2">
                            <span
                              className="absolute inset-y-0 left-0 bg-cyan-200/70"
                              style={{
                                width: `${Math.min(Math.max(barWidth, 0), 100)}%`,
                              }}
                            />
                            <div className="relative z-10 flex items-center justify-end gap-2 text-sm text-slate-700">
                              <span className="tabular-nums">{formatMetric(numericValue)}</span>
                              <span className="text-xs tabular-nums text-slate-500">
                                {percent.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
