import { create } from "zustand";
import type {
  DateRangeInput,
  ProjectPayloadV1,
  SegmentGroup,
  WorkspaceBlock,
  WorkspacePanel,
} from "@/lib/project-schema";
import {
  SEMANTIC_DIMENSIONS,
  SEMANTIC_METRICS,
  type DimensionKey,
  type MetricKey,
} from "@/lib/semantic-layer";

export type FreeformResult = {
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
  queryMs?: number;
};

export type SortDirection = "asc" | "desc";

export type PanelVisualization = {
  id: string;
  type: "line" | "bar";
  title: string;
};

export type PanelState = {
  id: string;
  title: string;
  query: {
    rows: DimensionKey[];
    metrics: MetricKey[];
    segmentKey: string | null;
    dateRange: DateRangeInput;
    limit: number;
    sort: {
      key: MetricKey;
      direction: SortDirection;
    };
  };
  visualizations: PanelVisualization[];
  result: FreeformResult | null;
};

type WorkspaceStore = {
  projectId: string | null;
  name: string;
  panels: PanelState[];
  selectedPanelId: string | null;
  setFromPayload: (projectId: string, payload: ProjectPayloadV1) => void;
  setSelectedPanel: (panelId: string) => void;
  setPanelTitle: (panelId: string, title: string) => void;
  addPanel: () => void;
  removePanel: (panelId: string) => void;
  reorderPanels: (fromIndex: number, toIndex: number) => void;
  addRowDimension: (panelId: string, key: string) => void;
  removeRowDimension: (panelId: string, key: string) => void;
  addMetricColumn: (panelId: string, key: string) => void;
  removeMetricColumn: (panelId: string, key: string) => void;
  setDateRangePreset: (
    panelId: string,
    preset: "last_7_days" | "last_30_days",
  ) => void;
  setDateRangeCustom: (panelId: string, from: string, to: string) => void;
  setSegmentKey: (panelId: string, segmentKey: string | null) => void;
  setSort: (
    panelId: string,
    key: MetricKey,
    direction: SortDirection,
  ) => void;
  addVisualization: (panelId: string, type: "line" | "bar") => void;
  removeVisualization: (panelId: string, visualizationId: string) => void;
  setPanelResult: (panelId: string, result: FreeformResult) => void;
  toPayload: () => ProjectPayloadV1;
};

const DIMENSION_SET = new Set<string>(SEMANTIC_DIMENSIONS);
const METRIC_SET = new Set<string>(SEMANTIC_METRICS);

const LEGACY_DIMENSION_MAP: Record<string, DimensionKey> = {
  eventName: "eventName",
  channel: "channel",
  brand: "brand",
  brandCode: "brand",
  product: "product",
  campaign: "campaign",
  day: "day",
  hour: "hour",
  country: "channel",
  page: "product",
};

const LEGACY_METRIC_MAP: Record<string, MetricKey> = {
  event_count: "events",
  unique_users: "users",
  revenue_sum: "revenue",
  net_demand_sum: "netDemand",
  net_demand: "netDemand",
  netDemand: "netDemand",
  events: "events",
  users: "users",
  revenue: "revenue",
};

function normalizeDimensionKey(key: string): DimensionKey | null {
  if (DIMENSION_SET.has(key)) {
    return key as DimensionKey;
  }

  if (!key.startsWith("dimension:")) {
    return null;
  }

  const normalized = LEGACY_DIMENSION_MAP[key.replace("dimension:", "")];
  return normalized ?? null;
}

function normalizeMetricKey(key: string): MetricKey | null {
  if (METRIC_SET.has(key)) {
    return key as MetricKey;
  }

  if (!key.startsWith("metric:")) {
    return null;
  }

  const normalized = LEGACY_METRIC_MAP[key.replace("metric:", "")];
  return normalized ?? null;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function segmentKeyToLegacyGroups(segmentKey: string | null): SegmentGroup[] {
  if (segmentKey === "segment:purchases") {
    return [
      {
        op: "AND",
        rules: [{ field: "eventName", operator: "eq", value: "purchase" }],
      },
    ];
  }

  if (segmentKey === "segment:page_views") {
    return [
      {
        op: "AND",
        rules: [{ field: "eventName", operator: "eq", value: "page_view" }],
      },
    ];
  }

  return [];
}

function getDefaultPanel(index: number): PanelState {
  return {
    id: `panel_${index}_${Date.now()}`,
    title: `Panel ${index}`,
    query: {
      rows: ["eventName"],
      metrics: ["events"],
      segmentKey: null,
      dateRange: { type: "preset", value: "last_30_days" },
      limit: 100,
      sort: { key: "events", direction: "desc" },
    },
    visualizations: [],
    result: null,
  };
}

function buildVisualizationsFromBlocks(
  blocks: WorkspaceBlock[],
): PanelVisualization[] {
  const visuals = blocks
    .filter((block) => block.type === "line_chart" || block.type === "bar_chart")
    .map((block, index) => {
      const type = block.type === "line_chart" ? "line" : "bar";
      return {
        id: block.id,
        type,
        title: type === "line" ? `Line ${index + 1}` : `Bar ${index + 1}`,
      } satisfies PanelVisualization;
    });

  return visuals;
}

function mapPanelsFromPayload(panels: WorkspacePanel[]): PanelState[] {
  return panels.map((panel) => {
    const table = panel.blocks.find((block) => block.type === "freeform_table");
    const query =
      table && table.type === "freeform_table"
        ? table.query
        : {
            rows: ["eventName"],
            columns: ["events"],
            segments: [],
            dateRange: { type: "preset", value: "last_30_days" } as DateRangeInput,
            limit: 100,
          };

    const rows = unique(
      query.rows
        .map((row) => normalizeDimensionKey(row))
        .filter((row): row is DimensionKey => row !== null),
    );
    const metrics = unique(
      query.columns
        .map((column) => normalizeMetricKey(column))
        .filter((metric): metric is MetricKey => metric !== null),
    );

    const dateRange =
      query.dateRange.type === "custom"
        ? {
            type: "custom" as const,
            from: query.dateRange.from,
            to: query.dateRange.to,
          }
        : {
            type: "preset" as const,
            value:
              query.dateRange.value === "last_7_days" ||
              query.dateRange.value === "last_30_days"
                ? query.dateRange.value
                : "last_30_days",
          };

    return {
      id: panel.id,
      title: panel.title,
      query: {
        rows: rows.length > 0 ? rows : ["eventName"],
        metrics: metrics.length > 0 ? metrics : ["events"],
        segmentKey: null,
        dateRange,
        limit: query.limit ?? 100,
        sort: {
          key: metrics[0] ?? "events",
          direction: "desc",
        },
      },
      visualizations: buildVisualizationsFromBlocks(panel.blocks),
      result: null,
    };
  });
}

function panelToPayload(panel: PanelState): WorkspacePanel {
  const tableId = `${panel.id}_table`;
  return {
    id: panel.id,
    title: panel.title.trim() || "Untitled Panel",
    blocks: [
      {
        id: tableId,
        type: "freeform_table",
        query: {
          rows: panel.query.rows,
          columns: panel.query.metrics,
          segments: segmentKeyToLegacyGroups(panel.query.segmentKey),
          dateRange: panel.query.dateRange,
          limit: panel.query.limit,
        },
      },
      ...panel.visualizations.map((visualization) => ({
        id: visualization.id,
        type:
          visualization.type === "line"
            ? ("line_chart" as const)
            : ("bar_chart" as const),
        sourceBlockId: tableId,
        config: {
          x: panel.query.rows[0] ?? "eventName",
          y: panel.query.metrics,
        },
      })),
    ],
  };
}

function updatePanel(
  panels: PanelState[],
  panelId: string,
  updater: (panel: PanelState) => PanelState,
): PanelState[] {
  return panels.map((panel) => (panel.id === panelId ? updater(panel) : panel));
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  projectId: null,
  name: "",
  panels: [],
  selectedPanelId: null,
  setFromPayload: (projectId, payload) => {
    const mappedPanels = mapPanelsFromPayload(payload.panels);
    const panels = mappedPanels.length > 0 ? mappedPanels : [getDefaultPanel(1)];
    set({
      projectId,
      name: payload.name,
      panels,
      selectedPanelId: panels[0]?.id ?? null,
    });
  },
  setSelectedPanel: (panelId) => set({ selectedPanelId: panelId }),
  setPanelTitle: (panelId, title) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        title,
      })),
    })),
  addPanel: () =>
    set((state) => {
      const nextPanel = getDefaultPanel(state.panels.length + 1);
      return {
        panels: [...state.panels, nextPanel],
        selectedPanelId: nextPanel.id,
      };
    }),
  removePanel: (panelId) =>
    set((state) => {
      if (state.panels.length <= 1) {
        return state;
      }

      const nextPanels = state.panels.filter((panel) => panel.id !== panelId);
      const selectedPanelId =
        state.selectedPanelId === panelId
          ? (nextPanels[0]?.id ?? null)
          : state.selectedPanelId;

      return {
        panels: nextPanels,
        selectedPanelId,
      };
    }),
  reorderPanels: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.panels.length ||
        toIndex < 0 ||
        toIndex >= state.panels.length
      ) {
        return state;
      }

      const copy = [...state.panels];
      const [moved] = copy.splice(fromIndex, 1);
      if (!moved) {
        return state;
      }
      copy.splice(toIndex, 0, moved);
      return { panels: copy };
    }),
  addRowDimension: (panelId, key) =>
    set((state) => {
      const normalized = normalizeDimensionKey(key);
      if (!normalized) {
        return state;
      }

      return {
        panels: updatePanel(state.panels, panelId, (panel) => ({
          ...panel,
          query: {
            ...panel.query,
            rows: panel.query.rows.includes(normalized)
              ? panel.query.rows
              : [...panel.query.rows, normalized],
          },
          result: null,
        })),
      };
    }),
  removeRowDimension: (panelId, key) =>
    set((state) => {
      const normalized = normalizeDimensionKey(key) ?? (key as DimensionKey);
      return {
        panels: updatePanel(state.panels, panelId, (panel) => ({
          ...panel,
          query: {
            ...panel.query,
            rows: panel.query.rows.filter((row) => row !== normalized),
          },
          result: null,
        })),
      };
    }),
  addMetricColumn: (panelId, key) =>
    set((state) => {
      const normalized = normalizeMetricKey(key);
      if (!normalized) {
        return state;
      }

      return {
        panels: updatePanel(state.panels, panelId, (panel) => ({
          ...panel,
          query: {
            ...panel.query,
            metrics: panel.query.metrics.includes(normalized)
              ? panel.query.metrics
              : [...panel.query.metrics, normalized],
            sort: {
              key: panel.query.sort.key ?? normalized,
              direction: panel.query.sort.direction,
            },
          },
          result: null,
        })),
      };
    }),
  removeMetricColumn: (panelId, key) =>
    set((state) => {
      const normalized = normalizeMetricKey(key) ?? (key as MetricKey);
      return {
        panels: updatePanel(state.panels, panelId, (panel) => {
          const nextMetrics = panel.query.metrics.filter(
            (metric) => metric !== normalized,
          );
          return {
            ...panel,
            query: {
              ...panel.query,
              metrics: nextMetrics,
              sort: nextMetrics.includes(panel.query.sort.key)
                ? panel.query.sort
                : {
                    key: nextMetrics[0] ?? "events",
                    direction: "desc",
                  },
            },
            result: null,
          };
        }),
      };
    }),
  setDateRangePreset: (panelId, preset) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        query: {
          ...panel.query,
          dateRange: { type: "preset", value: preset },
        },
        result: null,
      })),
    })),
  setDateRangeCustom: (panelId, from, to) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        query: {
          ...panel.query,
          dateRange: { type: "custom", from, to },
        },
        result: null,
      })),
    })),
  setSegmentKey: (panelId, segmentKey) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        query: {
          ...panel.query,
          segmentKey,
        },
        result: null,
      })),
    })),
  setSort: (panelId, key, direction) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        query: {
          ...panel.query,
          sort: { key, direction },
        },
      })),
    })),
  addVisualization: (panelId, type) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        visualizations: [
          ...panel.visualizations,
          {
            id: `viz_${type}_${Date.now()}_${panel.visualizations.length + 1}`,
            type,
            title:
              type === "line"
                ? `Line ${panel.visualizations.filter((v) => v.type === "line").length + 1}`
                : `Bar ${panel.visualizations.filter((v) => v.type === "bar").length + 1}`,
          },
        ],
      })),
    })),
  removeVisualization: (panelId, visualizationId) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        visualizations: panel.visualizations.filter(
          (visualization) => visualization.id !== visualizationId,
        ),
      })),
    })),
  setPanelResult: (panelId, result) =>
    set((state) => ({
      panels: updatePanel(state.panels, panelId, (panel) => ({
        ...panel,
        result,
      })),
    })),
  toPayload: () => {
    const state = get();
    return {
      schemaVersion: 1,
      name: state.name,
      panels: state.panels.map(panelToPayload),
    };
  },
}));

export function mapToDimensionKey(key: string): DimensionKey | null {
  return normalizeDimensionKey(key);
}

export function mapToMetricKey(key: string): MetricKey | null {
  return normalizeMetricKey(key);
}
