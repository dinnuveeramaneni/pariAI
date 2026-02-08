"use client";

import dynamic from "next/dynamic";
import type { VisualizationSpec } from "vega-embed";
import { Button } from "@/components/ui/button";
import type { PanelVisualization } from "@/store/workspaceStore";

const VegaEmbed = dynamic(
  () => import("react-vega").then((mod) => mod.VegaEmbed),
  {
    ssr: false,
  },
);

type RowData = Record<string, string | number | null>;

type TableChartsProps = {
  rows: RowData[];
  rowDimension: string | null;
  metricKey: string;
  visualizations: PanelVisualization[];
  onRemoveVisualization?: (visualizationId: string) => void;
  labelForKey?: (key: string) => string;
};

function buildSpec(params: {
  type: "line" | "bar";
  data: Array<{ dimension: string; value: number }>;
  metricKey: string;
  dimensionKey: string;
  labelForKey?: (key: string) => string;
}): VisualizationSpec {
  const valueLabel = params.labelForKey
    ? params.labelForKey(params.metricKey)
    : params.metricKey;
  const dimensionLabel = params.labelForKey
    ? params.labelForKey(params.dimensionKey)
    : params.dimensionKey;

  return {
    width: 360,
    height: 220,
    data: { values: params.data },
    mark:
      params.type === "line"
        ? { type: "line", point: true }
        : { type: "bar", cornerRadiusTopLeft: 4, cornerRadiusTopRight: 4 },
    encoding: {
      x: {
        field: "dimension",
        type: "nominal",
        title: dimensionLabel,
        sort: params.type === "bar" ? "-y" : undefined,
      },
      y: {
        field: "value",
        type: "quantitative",
        title: valueLabel,
      },
      color:
        params.type === "bar"
          ? {
              value: "#0f172a",
            }
          : undefined,
    },
  };
}

export function TableCharts({
  rows,
  rowDimension,
  metricKey,
  visualizations,
  onRemoveVisualization,
  labelForKey,
}: TableChartsProps) {
  if (!rowDimension || visualizations.length === 0) {
    return null;
  }

  const data = rows.map((row) => ({
    dimension: String(row[rowDimension] ?? "(none)"),
    value: Number(row[metricKey] ?? 0),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {visualizations.map((visualization) => {
        const spec = buildSpec({
          type: visualization.type,
          data,
          metricKey,
          dimensionKey: rowDimension,
          labelForKey,
        });

        return (
          <div
            key={visualization.id}
            className="rounded-md border border-slate-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {visualization.title}
              </p>
              {onRemoveVisualization ? (
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => onRemoveVisualization(visualization.id)}
                  aria-label={`Remove ${visualization.title}`}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <VegaEmbed
              spec={spec}
              options={{ mode: "vega-lite", actions: false }}
            />
          </div>
        );
      })}
    </div>
  );
}
