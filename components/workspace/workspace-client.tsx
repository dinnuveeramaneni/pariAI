"use client";

import { DndContext, type DragEndEvent, useDroppable } from "@dnd-kit/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DimensionKey, MetricKey } from "@/lib/semantic-layer";
import {
  buildDefaultProjectPayload,
  type ProjectPayloadV1,
} from "@/lib/project-schema";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DraggableComponent } from "@/components/workspace/draggable-component";
import { FreeformTable } from "@/components/workspace/freeform-table";
import {
  mapToDimensionKey,
  mapToMetricKey,
  useWorkspaceStore,
  type PanelState,
} from "@/store/workspaceStore";

type WorkspaceClientProps = {
  projectId: string;
  initialOrgId: string | null;
};

type Org = {
  id: string;
  name: string;
  role: string;
};

type ComponentItem = {
  id: string;
  type: "DIMENSION" | "METRIC" | "SEGMENT" | "DATE_RANGE";
  key: string;
  label: string;
  definition?: unknown;
};

type ProjectResponse = {
  project: {
    id: string;
    name: string;
    payload: ProjectPayloadV1 | null;
  };
};

type QueryTableResponse = {
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  totals: Record<string, number>;
};

type RailTab = "DIMENSION" | "METRIC" | "SEGMENT" | "DATE_RANGE";
type DateRangePreset = "last_7_days" | "last_30_days";
type DateRangeSelection = PanelState["query"]["dateRange"];

type SegmentRule = {
  field: string;
  op: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "in";
  value: string | number | boolean | Array<string | number | boolean>;
};

type SegmentGroup = {
  op: "AND" | "OR";
  rules: SegmentRule[];
};

type BreakdownState = {
  panelId: string;
  primaryDimension: DimensionKey;
  primaryValue: string;
  secondaryDimension: DimensionKey;
  rows: Array<Record<string, string | number | null>>;
  loading: boolean;
  error: string | null;
};

type DimensionRailItem = ComponentItem & { semanticKey: DimensionKey };
type MetricRailItem = ComponentItem & { semanticKey: MetricKey };
type DateRangeRailItem = ComponentItem & { preset: DateRangePreset };
type ContextMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDateRangeLabel(dateRange: DateRangeSelection): string {
  const { from, to } = resolveDateRange(dateRange);
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(fromDate)} - ${formatter.format(toDate)}`;
}

function resolvePresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end);
  const days = preset === "last_7_days" ? 7 : 30;
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    from: formatUtcDate(start),
    to: formatUtcDate(end),
  };
}

function resolveDateRange(dateRange: DateRangeSelection): { from: string; to: string } {
  if (dateRange.type === "custom") {
    return {
      from: dateRange.from,
      to: dateRange.to,
    };
  }
  return resolvePresetRange(dateRange.value);
}

function parseDateRangePreset(component: ComponentItem): DateRangePreset | null {
  if (component.key === "date:last_7_days") {
    return "last_7_days";
  }
  if (component.key === "date:last_30_days") {
    return "last_30_days";
  }

  const definition = component.definition as { preset?: string } | undefined;
  if (definition?.preset === "last_7_days") {
    return "last_7_days";
  }
  if (definition?.preset === "last_30_days") {
    return "last_30_days";
  }

  return null;
}

function normalizeSegmentField(field: string): string {
  const simpleField = field.startsWith("properties.")
    ? field.replace("properties.", "")
    : field;

  if (simpleField === "country") {
    return "channel";
  }
  if (simpleField === "page") {
    return "product";
  }
  if (simpleField === "brandCode") {
    return "brand";
  }

  return simpleField;
}

function toSegmentRule(raw: unknown): SegmentRule | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    field?: unknown;
    op?: unknown;
    operator?: unknown;
    value?: unknown;
  };
  const rawField = typeof candidate.field === "string" ? candidate.field : null;
  const rawOp =
    typeof candidate.op === "string"
      ? candidate.op
      : typeof candidate.operator === "string"
        ? candidate.operator
        : null;

  if (!rawField || !rawOp) {
    return null;
  }

  const validOps = new Set([
    "eq",
    "neq",
    "contains",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
  ]);
  if (!validOps.has(rawOp)) {
    return null;
  }

  const value = candidate.value;
  const allowedValue =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean",
      ));

  if (!allowedValue) {
    return null;
  }

  return {
    field: normalizeSegmentField(rawField),
    op: rawOp as SegmentRule["op"],
    value,
  };
}

function parseSegmentDefinition(definition: unknown): SegmentGroup | null {
  if (!definition || typeof definition !== "object") {
    return null;
  }

  const candidate = definition as {
    op?: unknown;
    rules?: unknown;
  };

  const op = candidate.op === "OR" ? "OR" : "AND";
  if (!Array.isArray(candidate.rules) || candidate.rules.length === 0) {
    return null;
  }

  const rules = candidate.rules
    .map((rule) => toSegmentRule(rule))
    .filter((rule): rule is SegmentRule => rule !== null);

  if (rules.length === 0) {
    return null;
  }

  return {
    op,
    rules,
  };
}

function buildPrimaryBreakdownRule(
  primaryDimension: DimensionKey,
  primaryValue: string,
): SegmentRule {
  return {
    field: primaryDimension,
    op: "eq",
    value: primaryValue,
  };
}

function mergeSegments(
  baseSegment: SegmentGroup | null,
  primaryFilter: SegmentRule,
): SegmentGroup {
  if (!baseSegment) {
    return {
      op: "AND",
      rules: [primaryFilter],
    };
  }

  return {
    op: "AND",
    rules: [...baseSegment.rules, primaryFilter],
  };
}

function buildRailData(components: ComponentItem[]) {
  const dimensions: DimensionRailItem[] = [];
  const metrics: MetricRailItem[] = [];
  const segments: ComponentItem[] = [];
  const dateRanges: DateRangeRailItem[] = [];

  const seenDimensions = new Set<string>();
  const seenMetrics = new Set<string>();

  for (const component of components) {
    if (component.type === "DIMENSION") {
      if (component.key === "eventName") {
        continue;
      }
      const semanticKey = mapToDimensionKey(component.key);
      if (!semanticKey || seenDimensions.has(semanticKey)) {
        continue;
      }
      seenDimensions.add(semanticKey);
      dimensions.push({ ...component, semanticKey });
      continue;
    }

    if (component.type === "METRIC") {
      const semanticKey = mapToMetricKey(component.key);
      if (!semanticKey || seenMetrics.has(semanticKey)) {
        continue;
      }
      seenMetrics.add(semanticKey);
      metrics.push({ ...component, semanticKey });
      continue;
    }

    if (component.type === "SEGMENT") {
      segments.push(component);
      continue;
    }

    if (component.type === "DATE_RANGE") {
      const preset = parseDateRangePreset(component);
      if (!preset) {
        continue;
      }
      dateRanges.push({ ...component, preset });
    }
  }

  return {
    dimensions,
    metrics,
    segments,
    dateRanges,
  };
}

function getPrimaryPanelId(
  panels: PanelState[],
  selectedPanelId: string | null,
): string | null {
  if (selectedPanelId && panels.some((panel) => panel.id === selectedPanelId)) {
    return selectedPanelId;
  }

  return panels[0]?.id ?? null;
}

function SegmentStripDrop({
  panelId,
  segmentLabel,
  onClearSegment,
}: {
  panelId: string;
  segmentLabel?: string;
  onClearSegment?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `quick-segment:${panelId}`,
  });
  const inputSize = Math.min(Math.max((segmentLabel ?? "").length, 1), 36);

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 5h16l-6 7v6l-4-2v-4L4 5z" />
        </svg>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "rounded-md border border-dashed border-slate-300 bg-white px-2 py-1",
          segmentLabel ? "inline-flex w-fit max-w-[420px]" : "w-[160px]",
          isOver && "border-slate-700 bg-slate-100 text-slate-800",
        )}
      >
        <div className="flex items-center gap-1">
          <input
            type="text"
            readOnly
            tabIndex={-1}
            size={inputSize}
            value={segmentLabel ?? ""}
            placeholder=""
            className="pointer-events-none w-auto max-w-[34ch] border-0 bg-transparent px-1 py-1 text-sm text-slate-700 focus:outline-none"
            aria-label="Segment drop target"
          />
          {segmentLabel && onClearSegment ? (
            <button
              type="button"
              onClick={onClearSegment}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-sm text-slate-500 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              aria-label="Clear segment"
              title="Clear segment"
            >
              x
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type DateRangePickerProps = {
  value: DateRangeSelection;
  onApplyPreset: (preset: DateRangePreset) => void;
  onApplyCustom: (from: string, to: string) => void;
};

function DateRangePicker({
  value,
  onApplyPreset,
  onApplyCustom,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<"last_7_days" | "last_30_days" | "custom">(
    value.type === "preset" ? value.value : "custom",
  );
  const [draftFrom, setDraftFrom] = useState(resolveDateRange(value).from);
  const [draftTo, setDraftTo] = useState(resolveDateRange(value).to);

  const openPicker = () => {
    const resolved = resolveDateRange(value);
    setDraftPreset(value.type === "preset" ? value.value : "custom");
    setDraftFrom(resolved.from);
    setDraftTo(resolved.to);
    setOpen(true);
  };

  const onPresetChange = (next: "last_7_days" | "last_30_days" | "custom") => {
    setDraftPreset(next);
    if (next === "custom") {
      return;
    }
    const resolved = resolvePresetRange(next);
    setDraftFrom(resolved.from);
    setDraftTo(resolved.to);
  };

  const apply = () => {
    if (draftPreset === "custom") {
      if (!draftFrom || !draftTo || draftFrom > draftTo) {
        return;
      }
      onApplyCustom(draftFrom, draftTo);
      setOpen(false);
      return;
    }

    onApplyPreset(draftPreset);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openPicker();
          }
        }}
        className="min-w-[200px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        aria-label="Open date range picker"
      >
        <p className="font-semibold leading-tight">
          {value.type === "preset" && value.value === "last_30_days"
            ? "This month"
            : value.type === "preset" && value.value === "last_7_days"
              ? "Last 7 days"
              : "Custom"}
        </p>
        <p className="leading-tight">{formatDateRangeLabel(value)}</p>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[330px] rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Preset
            </label>
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              value={draftPreset}
              onChange={(event) =>
                onPresetChange(
                  event.target.value as "last_7_days" | "last_30_days" | "custom",
                )
              }
            >
              <option value="last_30_days">This month</option>
              <option value="last_7_days">Last 7 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              From
              <input
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              />
            </label>
            <label className="text-xs text-slate-600">
              To
              <input
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              />
            </label>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" className="h-8 px-2 text-xs" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type FreeformMetricDropZoneProps = {
  panelId: string;
  metrics: MetricKey[];
};

function FreeformMetricDropZone({
  panelId,
  metrics,
}: FreeformMetricDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `metrics:${panelId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-11 border-l border-slate-200 px-2 py-1.5",
        isOver && "bg-slate-100",
      )}
    >
      {metrics.length === 0 ? (
        <div className="rounded-sm border border-dashed border-slate-300 px-2 py-1.5 text-xs italic text-slate-600">
          Drop a metric here (or any other component)
        </div>
      ) : (
        <div className="min-h-7" />
      )}
    </div>
  );
}

type FreeformRowsDropZoneProps = {
  panelId: string;
  hasRows: boolean;
  hasMetrics: boolean;
  children: ReactNode;
};

function FreeformRowsDropZone({
  panelId,
  hasRows,
  hasMetrics,
  children,
}: FreeformRowsDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `rows:${panelId}`,
  });

  const showPlaceholder = !hasRows || !hasMetrics;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[220px] rounded-sm border border-dashed border-slate-300 bg-slate-50",
        isOver && "border-slate-700 bg-slate-100",
      )}
    >
      {showPlaceholder ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-3 py-8 text-center">
          <p className="text-xs text-slate-500">
            {!hasMetrics
              ? "Drop a metric here (or any other component)"
              : "Drop a dimension here to build rows"}
          </p>
          <div className="flex items-center gap-3 text-slate-300">
            <div className="h-9 w-10 rounded border-2 border-slate-300" />
            <div className="h-9 w-28 rounded border-2 border-slate-300" />
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function buildContextAssistantReply(
  question: string,
  panel: PanelState | null,
  labelForKey: (key: string) => string,
): string {
  if (!panel) {
    return "No active panel selected.";
  }

  if (panel.query.metrics.length === 0) {
    return "Add at least one metric to this panel, then ask again.";
  }

  if (panel.query.rows.length === 0) {
    return "Add one row dimension to this panel, then ask again.";
  }

  const { from, to } = resolveDateRange(panel.query.dateRange);
  if (!panel.result) {
    return `I need query results first. Current setup: ${labelForKey(panel.query.rows[0])} by ${panel.query.metrics
      .map((metric) => labelForKey(metric))
      .join(", ")} from ${from} to ${to}.`;
  }

  const normalized = question.toLowerCase();
  const firstDimension = panel.query.rows[0];
  const firstMetric = panel.query.metrics[0];
  const topRow = panel.result.rows[0];
  const topDimensionValue = topRow ? String(topRow[firstDimension] ?? "(none)") : "(none)";
  const topMetricValue = topRow ? Number(topRow[firstMetric] ?? 0).toLocaleString() : "0";

  const totalsText = panel.query.metrics
    .map((metric) => {
      const value = Number(panel.result?.totals[metric] ?? 0).toLocaleString();
      return `${labelForKey(metric)}: ${value}`;
    })
    .join(" | ");

  if (
    normalized.includes("top") ||
    normalized.includes("highest") ||
    normalized.includes("best")
  ) {
    return `Top ${labelForKey(firstDimension)} by ${labelForKey(firstMetric)} is ${topDimensionValue} (${topMetricValue}).`;
  }

  if (normalized.includes("total") || normalized.includes("sum")) {
    return `Totals for ${from} to ${to}: ${totalsText}.`;
  }

  if (normalized.includes("row") || normalized.includes("count")) {
    return `This query returned ${panel.result.rows.length} rows.`;
  }

  return `Current panel: ${labelForKey(firstDimension)} by ${panel.query.metrics
    .map((metric) => labelForKey(metric))
    .join(", ")} from ${from} to ${to}. ${totalsText}.`;
}

type PromptCommand =
  | {
      type: "metric";
      action: "add" | "remove";
      metric: MetricKey;
    }
  | {
      type: "dimension";
      action: "add" | "remove" | "set";
      dimension: DimensionKey;
    };

function parsePromptCommand(input: string): PromptCommand | null {
  const text = input.toLowerCase();
  const addMatch = text.search(/\b(add|insert|include|use)\b/);
  const removeMatch = text.search(/\b(remove|delete|clear|drop)\b/);
  const setMatch = text.search(/\b(change|switch|set|update)\b/);
  const hasDimensionKeyword = /\b(dimension|dimensions|dimention|dimentions|dimnetion)\b/.test(
    text,
  );

  const actions: Array<{ action: "add" | "remove" | "set"; index: number }> = [];
  if (addMatch >= 0) {
    actions.push({ action: "add", index: addMatch });
  }
  if (removeMatch >= 0) {
    actions.push({ action: "remove", index: removeMatch });
  }
  if (setMatch >= 0) {
    actions.push({ action: "set", index: setMatch });
  }
  if (actions.length === 0) {
    return null;
  }
  actions.sort((a, b) => a.index - b.index);
  const action = actions[0]?.action;
  if (!action) {
    return null;
  }

  const parseDimension = (): DimensionKey | null => {
    if (text.includes("event name") || text.includes("eventname")) {
      return "eventName";
    }
    if (text.includes("campaign")) {
      return "campaign";
    }
    if (text.includes("brand")) {
      return "brand";
    }
    if (text.includes("channel")) {
      return "channel";
    }
    if (text.includes("product")) {
      return "product";
    }
    if (text.includes("hour")) {
      return "hour";
    }
    if (text.includes("day")) {
      return "day";
    }
    if (hasDimensionKeyword && text.includes("event")) {
      return "eventName";
    }
    return null;
  };

  const dimension = parseDimension();
  if (hasDimensionKeyword && dimension) {
    return {
      type: "dimension",
      action,
      dimension,
    };
  }

  if (action === "set" && dimension) {
    return {
      type: "dimension",
      action,
      dimension,
    };
  }

  let metric: MetricKey | null = null;
  if (text.includes("net demand") || text.includes("netdemand")) {
    metric = "netDemand";
  } else if (text.includes("revenue")) {
    metric = "revenue";
  } else if (text.includes("users") || text.includes("user")) {
    metric = "users";
  } else if (text.includes("events") || text.includes("event") || text.includes("evenet")) {
    metric = "events";
  }

  if (!metric) {
    return null;
  }

  if (action === "set") {
    return null;
  }

  return { type: "metric", action, metric };
}

export function WorkspaceClient({ projectId, initialOrgId }: WorkspaceClientProps) {
  const [orgId, setOrgId] = useState<string | null>(initialOrgId);
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [activeRailTab, setActiveRailTab] = useState<RailTab>("DIMENSION");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownState | null>(null);
  const [contextInput, setContextInput] = useState("");
  const [contextMessages, setContextMessages] = useState<ContextMessage[]>([]);

  const {
    panels,
    selectedPanelId,
    setFromPayload,
    setSelectedPanel,
    addPanel,
    removePanel,
    addRowDimension,
    removeRowDimension,
    addMetricColumn,
    removeMetricColumn,
    setDateRangePreset,
    setDateRangeCustom,
    setSegmentKey,
    setSort,
    setPanelResult,
    toPayload,
  } = useWorkspaceStore();

  const requestVersionRef = useRef<Record<string, number>>({});
  const inFlightPanelsRef = useRef<Set<string>>(new Set());
  const hasHydratedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const contextClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const railData = useMemo(() => buildRailData(components), [components]);

  const labelMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const dimension of railData.dimensions) {
      map.set(dimension.semanticKey, dimension.label);
    }
    for (const metric of railData.metrics) {
      map.set(metric.semanticKey, metric.label);
    }
    for (const segment of railData.segments) {
      map.set(segment.key, segment.label);
    }

    map.set("last_7_days", "Last 7 Days");
    map.set("last_30_days", "Last 30 Days");

    return map;
  }, [railData]);

  const segmentMap = useMemo(() => {
    const map = new Map<string, SegmentGroup>();
    for (const segment of railData.segments) {
      const parsed = parseSegmentDefinition(segment.definition);
      if (parsed) {
        map.set(segment.key, parsed);
      }
    }
    return map;
  }, [railData.segments]);

  const payloadSignature = JSON.stringify(toPayload());

  const runPanelQuery = useCallback(
    async (panelId: string) => {
      if (!orgId) {
        return;
      }
      if (inFlightPanelsRef.current.has(panelId)) {
        return;
      }

      const panel = useWorkspaceStore
        .getState()
        .panels.find((entry) => entry.id === panelId);
      if (!panel || panel.query.metrics.length === 0) {
        return;
      }

      inFlightPanelsRef.current.add(panelId);
      requestVersionRef.current[panelId] = (requestVersionRef.current[panelId] ?? 0) + 1;
      const requestVersion = requestVersionRef.current[panelId];

      const startedAt = Date.now();
      const dateRange = resolveDateRange(panel.query.dateRange);
      const segmentDsl = panel.query.segmentKey
        ? (segmentMap.get(panel.query.segmentKey) ?? undefined)
        : undefined;

      const response = await fetch("/api/query/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          dateRange,
          rows: panel.query.rows,
          metrics: panel.query.metrics,
          segmentDsl,
          sort: panel.query.sort,
          limit: panel.query.limit,
        }),
      });

      inFlightPanelsRef.current.delete(panelId);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Failed to query panel ${panel.title}`);
        return;
      }

      if (requestVersionRef.current[panelId] !== requestVersion) {
        return;
      }

      const data = (await response.json()) as QueryTableResponse;
      setPanelResult(panelId, {
        ...data,
        queryMs: Date.now() - startedAt,
      });
    },
    [orgId, segmentMap, setPanelResult],
  );

  const saveProject = useCallback(
    async () => {
      if (!orgId) {
        return;
      }

      const payload = toPayload();
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          payload,
        }),
      });

      if (!response.ok) {
        return;
      }

      lastSavedPayloadRef.current = JSON.stringify(payload);
    },
    [orgId, projectId, toPayload],
  );

  const runBreakdown = useCallback(
    async (state: BreakdownState) => {
      if (!orgId) {
        return;
      }

      const panel = useWorkspaceStore
        .getState()
        .panels.find((entry) => entry.id === state.panelId);
      if (!panel || panel.query.metrics.length === 0) {
        return;
      }

      const baseSegment = panel.query.segmentKey
        ? (segmentMap.get(panel.query.segmentKey) ?? null)
        : null;

      const segmentDsl = mergeSegments(
        baseSegment,
        buildPrimaryBreakdownRule(state.primaryDimension, state.primaryValue),
      );

      setBreakdown((current) =>
        current
          ? {
              ...current,
              loading: true,
              error: null,
            }
          : current,
      );

      const dateRange = resolveDateRange(panel.query.dateRange);

      const response = await fetch("/api/query/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          dateRange,
          rows: [state.secondaryDimension],
          metrics: panel.query.metrics,
          segmentDsl,
          sort: panel.query.sort,
          limit: 20,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setBreakdown((current) =>
          current
            ? {
                ...current,
                loading: false,
                error: payload?.error ?? "Breakdown query failed",
              }
            : current,
        );
        return;
      }

      const data = (await response.json()) as QueryTableResponse;
      setBreakdown((current) =>
        current
          ? {
              ...current,
              rows: data.rows,
              loading: false,
              error: null,
            }
          : current,
      );
    },
    [orgId, segmentMap],
  );

  useEffect(() => {
    const loadOrgs = async () => {
      setError(null);
      const response = await fetch("/api/orgs");
      if (!response.ok) {
        setError("Unable to load organizations");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as { organizations: Org[] };
      const fallbackOrgId = payload.organizations[0]?.id ?? null;
      setOrgId((current) => initialOrgId ?? current ?? fallbackOrgId);
      if (!initialOrgId && payload.organizations.length === 0) {
        setLoading(false);
      }
    };

    void loadOrgs();
  }, [initialOrgId]);

  useEffect(() => {
    if (!orgId) {
      return;
    }

    const loadProject = async () => {
      hasHydratedRef.current = false;
      setLoading(true);
      setError(null);

      const [projectResponse, componentResponse] = await Promise.all([
        fetch(`/api/orgs/${orgId}/projects/${projectId}`),
        fetch(`/api/orgs/${orgId}/components`),
      ]);

      if (!projectResponse.ok) {
        setError("Project not found for selected organization.");
        setLoading(false);
        return;
      }

      const projectPayload = (await projectResponse.json()) as ProjectResponse;
      const componentPayload = componentResponse.ok
        ? ((await componentResponse.json()) as { components: ComponentItem[] })
        : { components: [] };

      const payload =
        projectPayload.project.payload ??
        buildDefaultProjectPayload(projectPayload.project.name);

      setFromPayload(projectId, payload);
      setComponents(componentPayload.components);

      const hydratedPayload = JSON.stringify(useWorkspaceStore.getState().toPayload());
      lastSavedPayloadRef.current = hydratedPayload;
      hasHydratedRef.current = true;
      setLoading(false);

      for (const panel of useWorkspaceStore.getState().panels) {
        if (panel.query.metrics.length > 0) {
          void runPanelQuery(panel.id);
        }
      }
    };

    void loadProject();
    // runPanelQuery intentionally omitted to prevent reload loops when segment map updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, projectId, setFromPayload]);

  useEffect(() => {
    if (!orgId || !hasHydratedRef.current) {
      return;
    }

    if (payloadSignature === lastSavedPayloadRef.current) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void saveProject();
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [orgId, payloadSignature, saveProject]);

  const setPrimaryRowDimension = useCallback(
    (panelId: string, dimensionKey: string) => {
      const panel = useWorkspaceStore
        .getState()
        .panels.find((entry) => entry.id === panelId);
      if (!panel) {
        return;
      }

      for (const row of panel.query.rows) {
        if (row !== dimensionKey) {
          removeRowDimension(panelId, row);
        }
      }
      addRowDimension(panelId, dimensionKey);
    },
    [addRowDimension, removeRowDimension],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { over, active } = event;
      if (!over) {
        return;
      }

      const [zone, panelId] = String(over.id).split(":");
      if (!zone || !panelId) {
        return;
      }

      const componentType = active.data.current?.componentType as
        | ComponentItem["type"]
        | undefined;
      const componentKey = active.data.current?.componentKey as string | undefined;

      if (!componentType || !componentKey) {
        return;
      }

      if (zone === "rows" && componentType === "DIMENSION") {
        setPrimaryRowDimension(panelId, componentKey);
        await runPanelQuery(panelId);
        return;
      }

      if (zone === "metrics" && componentType === "METRIC") {
        addMetricColumn(panelId, componentKey);
        await runPanelQuery(panelId);
        return;
      }

      if (zone === "rows" && componentType === "METRIC") {
        addMetricColumn(panelId, componentKey);
        await runPanelQuery(panelId);
        return;
      }

      if (zone === "metrics" && componentType === "DIMENSION") {
        setPrimaryRowDimension(panelId, componentKey);
        await runPanelQuery(panelId);
        return;
      }

      if ((zone === "segment" || zone === "quick-segment") && componentType === "SEGMENT") {
        setSegmentKey(panelId, componentKey);
        await runPanelQuery(panelId);
        return;
      }

      if (zone === "date" && componentType === "DATE_RANGE") {
        const preset = parseDateRangePreset({
          id: "",
          type: "DATE_RANGE",
          key: componentKey,
          label: componentKey,
        });
        if (preset) {
          setDateRangePreset(panelId, preset);
          await runPanelQuery(panelId);
        }
      }
    },
    [
      addMetricColumn,
      runPanelQuery,
      setPrimaryRowDimension,
      setDateRangePreset,
      setSegmentKey,
    ],
  );

  const activePanelId = getPrimaryPanelId(panels, selectedPanelId);
  const activePanel = useMemo(
    () => panels.find((panel) => panel.id === activePanelId) ?? null,
    [activePanelId, panels],
  );

  useEffect(() => {
    return () => {
      if (contextClearTimerRef.current) {
        clearTimeout(contextClearTimerRef.current);
      }
    };
  }, []);

  const handleContextSubmit = useCallback(
    async () => {
      const question = contextInput.trim();
      if (!question) {
        return;
      }

      let answer = buildContextAssistantReply(
        question,
        activePanel,
        (key) => labelMap.get(key) ?? key,
      );

      const command = parsePromptCommand(question);
      if (command && activePanelId) {
        const currentPanel = useWorkspaceStore
          .getState()
          .panels.find((panel) => panel.id === activePanelId);

        if (currentPanel) {
          if (command.type === "metric") {
            const metricLabel = labelMap.get(command.metric) ?? command.metric;
            if (command.action === "add") {
              if (currentPanel.query.metrics.includes(command.metric)) {
                answer = `${metricLabel} is already in this panel.`;
              } else {
                addMetricColumn(activePanelId, command.metric);
                await runPanelQuery(activePanelId);
                answer = `Added ${metricLabel}.`;
              }
            } else if (currentPanel.query.metrics.includes(command.metric)) {
              removeMetricColumn(activePanelId, command.metric);
              await runPanelQuery(activePanelId);
              answer = `Removed ${metricLabel}.`;
            } else {
              answer = `${metricLabel} is not in this panel.`;
            }
          } else {
            const dimensionLabel = labelMap.get(command.dimension) ?? command.dimension;
            if (command.action === "remove") {
              if (currentPanel.query.rows.includes(command.dimension)) {
                removeRowDimension(activePanelId, command.dimension);
                await runPanelQuery(activePanelId);
                answer = `Removed ${dimensionLabel} dimension.`;
              } else {
                answer = `${dimensionLabel} is not in this panel.`;
              }
            } else if (
              currentPanel.query.rows.length === 1 &&
              currentPanel.query.rows[0] === command.dimension
            ) {
              answer = `${dimensionLabel} is already active.`;
            } else {
              setPrimaryRowDimension(activePanelId, command.dimension);
              await runPanelQuery(activePanelId);
              answer = `Set dimension to ${dimensionLabel}.`;
            }
          }
        }
      }

      setContextMessages((previous) => [
        ...previous,
        {
          id: `assistant-${Date.now()}-${previous.length}`,
          role: "assistant",
          content: answer,
        },
      ]);
      if (contextClearTimerRef.current) {
        clearTimeout(contextClearTimerRef.current);
      }
      contextClearTimerRef.current = setTimeout(() => {
        setContextMessages([]);
        contextClearTimerRef.current = null;
      }, 3000);
      setContextInput("");
    },
    [
      activePanel,
      activePanelId,
      addMetricColumn,
      contextInput,
      labelMap,
      removeRowDimension,
      removeMetricColumn,
      runPanelQuery,
      setPrimaryRowDimension,
    ],
  );

  const handleQuickAdd = useCallback(
    async (component: ComponentItem) => {
      if (!activePanelId) {
        return;
      }

      if (component.type === "DIMENSION") {
        setPrimaryRowDimension(activePanelId, component.key);
        await runPanelQuery(activePanelId);
        return;
      }

      if (component.type === "METRIC") {
        addMetricColumn(activePanelId, component.key);
        await runPanelQuery(activePanelId);
        return;
      }

      if (component.type === "SEGMENT") {
        setSegmentKey(activePanelId, component.key);
        await runPanelQuery(activePanelId);
        return;
      }

      if (component.type === "DATE_RANGE") {
        const preset = parseDateRangePreset(component);
        if (preset) {
          setDateRangePreset(activePanelId, preset);
          await runPanelQuery(activePanelId);
        }
      }
    },
    [
      activePanelId,
      addMetricColumn,
      runPanelQuery,
      setPrimaryRowDimension,
      setDateRangePreset,
      setSegmentKey,
    ],
  );

  const handleSort = useCallback(
    async (panel: PanelState, key: string) => {
      const metricKey = mapToMetricKey(key);
      if (!metricKey) {
        return;
      }

      const direction =
        panel.query.sort.key === metricKey && panel.query.sort.direction === "desc"
          ? "asc"
          : "desc";
      setSort(panel.id, metricKey, direction);
      await runPanelQuery(panel.id);
    },
    [runPanelQuery, setSort],
  );

  const handleAddPanel = () => {
    addPanel();
    const nextPanelId = useWorkspaceStore.getState().selectedPanelId;
    if (nextPanelId) {
      void runPanelQuery(nextPanelId);
    }
  };

  const handleBreakdownOpen = useCallback(
    async (panel: PanelState, dimensionValue: string) => {
      if (panel.query.rows.length === 0) {
        return;
      }

      const primaryDimension = panel.query.rows[0];
      const fallbackSecondary =
        railData.dimensions.find((dimension) => dimension.semanticKey !== primaryDimension)
          ?.semanticKey ?? "channel";

      const initialState: BreakdownState = {
        panelId: panel.id,
        primaryDimension,
        primaryValue: dimensionValue,
        secondaryDimension: fallbackSecondary,
        rows: [],
        loading: true,
        error: null,
      };

      setBreakdown(initialState);
      await runBreakdown(initialState);
    },
    [railData.dimensions, runBreakdown],
  );

  const handleBreakdownDimensionChange = async (
    secondaryDimension: DimensionKey,
  ) => {
    if (!breakdown) {
      return;
    }

    const next = {
      ...breakdown,
      secondaryDimension,
      loading: true,
      error: null,
    };

    setBreakdown(next);
    await runBreakdown(next);
  };

  const renderRailItems = () => {
    if (activeRailTab === "DIMENSION") {
      return railData.dimensions.map((component) => (
        <DraggableComponent
          key={component.id}
          id={`dimension-${component.id}`}
          label={component.label}
          componentType="DIMENSION"
          componentKey={component.semanticKey}
          onAdd={() => {
            void handleQuickAdd({
              ...component,
              key: component.semanticKey,
              type: "DIMENSION",
            });
          }}
          addLabel={`Add ${component.label}`}
        />
      ));
    }

    if (activeRailTab === "METRIC") {
      return railData.metrics.map((component) => (
        <DraggableComponent
          key={component.id}
          id={`metric-${component.id}`}
          label={component.label}
          componentType="METRIC"
          componentKey={component.semanticKey}
          onAdd={() => {
            void handleQuickAdd({
              ...component,
              key: component.semanticKey,
              type: "METRIC",
            });
          }}
          addLabel={`Add ${component.label}`}
        />
      ));
    }

    if (activeRailTab === "SEGMENT") {
      return railData.segments.map((component) => (
        <DraggableComponent
          key={component.id}
          id={`segment-${component.id}`}
          label={component.label}
          componentType="SEGMENT"
          componentKey={component.key}
          onAdd={() => {
            void handleQuickAdd(component);
          }}
          addLabel={`Apply ${component.label}`}
        />
      ));
    }

    return railData.dateRanges.map((component) => (
      <DraggableComponent
        key={component.id}
        id={`date-${component.id}`}
        label={component.label}
        componentType="DATE_RANGE"
        componentKey={component.key}
        onAdd={() => {
          void handleQuickAdd(component);
        }}
        addLabel={`Apply ${component.label}`}
      />
    ));
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading workspace...</p>;
  }

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 space-y-5 px-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <DndContext onDragEnd={(event) => void onDragEnd(event)}>
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Components
              </h2>

              <div className="grid grid-cols-2 gap-2">
                {([
                  ["DIMENSION", "Dimensions"],
                  ["METRIC", "Metrics"],
                  ["SEGMENT", "Segments"],
                  ["DATE_RANGE", "Date Ranges"],
                ] as Array<[RailTab, string]>).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveRailTab(tab)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
                      activeRailTab === tab
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                    aria-pressed={activeRailTab === tab}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[65vh] space-y-1 overflow-auto">{renderRailItems()}</div>
            </Card>

            <Card className="flex min-h-[260px] flex-col gap-2">
              <div className="space-y-2">
                <textarea
                  value={contextInput}
                  onChange={(event) => setContextInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleContextSubmit();
                    }
                  }}
                  className="min-h-20 w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                  placeholder="Ask me anything"
                  aria-label="Ask context question"
                />
              </div>

              {contextMessages.length > 0 ? (
                <div className="flex-1 space-y-2 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                  {contextMessages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[92%] rounded-md px-2 py-1.5 text-xs",
                        message.role === "assistant"
                          ? "bg-white text-slate-700"
                          : "ml-auto bg-slate-900 text-white",
                      )}
                    >
                      {message.content}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          </aside>

          <section className="space-y-4">
            {panels.map((panel) => (
              <div
                key={panel.id}
                onClick={() => setSelectedPanel(panel.id)}
                className={`min-h-[420px] resize-y overflow-auto rounded-lg border ${
                  panel.id === activePanelId ? "border-slate-900" : "border-transparent"
                }`}
              >
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        defaultValue="Gap"
                        className="h-7 min-w-20 rounded-md border border-slate-300 bg-white px-1.5 text-[11px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                        aria-label="Brand selector"
                      >
                        <option value="Gap">Gap</option>
                        <option value="Old Navy">Old Navy</option>
                        <option value="PariAI">PariAI</option>
                        <option value="Banana Republic">Banana Republic</option>
                      </select>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 rounded-full px-0 text-lg leading-none text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => removePanel(panel.id)}
                        disabled={panels.length === 1}
                        aria-label="Remove panel"
                      >
                        x
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <SegmentStripDrop
                      panelId={panel.id}
                      segmentLabel={
                        panel.query.segmentKey
                          ? (labelMap.get(panel.query.segmentKey) ?? panel.query.segmentKey)
                          : undefined
                      }
                      onClearSegment={() => {
                        setSegmentKey(panel.id, null);
                        void runPanelQuery(panel.id);
                      }}
                    />
                    <DateRangePicker
                      value={panel.query.dateRange}
                      onApplyPreset={(preset) => {
                        setDateRangePreset(panel.id, preset);
                        void runPanelQuery(panel.id);
                      }}
                      onApplyCustom={(from, to) => {
                        setDateRangeCustom(panel.id, from, to);
                        void runPanelQuery(panel.id);
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
                      <div className="grid min-h-11 grid-cols-[minmax(220px,1fr)_minmax(300px,1fr)] border-b border-slate-200">
                        <div className="flex items-center px-3 py-1.5">
                          {panel.query.rows.length === 0 ? (
                            <span className="text-xs italic text-slate-600">
                              Drop a dimension here
                            </span>
                          ) : null}
                        </div>

                        <FreeformMetricDropZone
                          panelId={panel.id}
                          metrics={panel.query.metrics}
                        />
                      </div>

                      <div className="p-1.5">
                        <FreeformRowsDropZone
                          panelId={panel.id}
                          hasRows={panel.query.rows.length > 0}
                          hasMetrics={panel.query.metrics.length > 0}
                        >
                          <div className="space-y-2 bg-white p-1.5">
                            {panel.result ? (
                              <div className="space-y-2">
                                <FreeformTable
                                  rowDimension={panel.query.rows[0] ?? null}
                                  metrics={panel.query.metrics}
                                  rows={panel.result.rows}
                                  totals={panel.result.totals}
                                  onSortChange={(key) => {
                                    void handleSort(panel, key);
                                  }}
                                  onRemoveMetric={(key) => {
                                    const metricKey = mapToMetricKey(key);
                                    if (!metricKey) {
                                      return;
                                    }
                                    removeMetricColumn(panel.id, metricKey);
                                    void runPanelQuery(panel.id);
                                  }}
                                  onBreakdown={(dimensionValue) => {
                                    void handleBreakdownOpen(panel, dimensionValue);
                                  }}
                                  labelForKey={(key) => labelMap.get(key) ?? key}
                                />
                              </div>
                            ) : null}
                          </div>
                        </FreeformRowsDropZone>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ))}

            <div className="flex justify-center pt-2 pb-2">
              <button
                type="button"
                onClick={handleAddPanel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg leading-none text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Add panel"
              >
                +
              </button>
            </div>
          </section>
        </div>
      </DndContext>

      {breakdown ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <Card className="max-h-[85vh] w-full max-w-3xl space-y-4 overflow-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Breakdown</h3>
                <p className="text-sm text-slate-500">
                  {labelMap.get(breakdown.primaryDimension) ?? breakdown.primaryDimension}:{" "}
                  {breakdown.primaryValue}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setBreakdown(null)}>
                Close
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-700" htmlFor="breakdown-dimension">
                Secondary dimension
              </label>
              <select
                id="breakdown-dimension"
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                value={breakdown.secondaryDimension}
                onChange={(event) => {
                  void handleBreakdownDimensionChange(event.target.value as DimensionKey);
                }}
              >
                {railData.dimensions
                  .filter((dimension) => dimension.semanticKey !== breakdown.primaryDimension)
                  .map((dimension) => (
                    <option key={dimension.id} value={dimension.semanticKey}>
                      {dimension.label}
                    </option>
                  ))}
              </select>
            </div>

            {breakdown.loading ? (
              <p className="text-sm text-slate-500">Loading breakdown...</p>
            ) : breakdown.error ? (
              <p className="text-sm text-rose-600">{breakdown.error}</p>
            ) : (
              <div className="overflow-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2">
                        {labelMap.get(breakdown.secondaryDimension) ??
                          breakdown.secondaryDimension}
                      </th>
                      {panels
                        .find((panel) => panel.id === breakdown.panelId)
                        ?.query.metrics.map((metric) => (
                          <th key={metric} className="border-b border-slate-200 px-3 py-2">
                            {labelMap.get(metric) ?? metric}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.rows.map((row, index) => (
                      <tr key={`${row[breakdown.secondaryDimension] ?? "none"}-${index}`}>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {String(row[breakdown.secondaryDimension] ?? "(none)")}
                        </td>
                        {panels
                          .find((panel) => panel.id === breakdown.panelId)
                          ?.query.metrics.map((metric) => (
                            <td
                              key={`${metric}-${index}`}
                              className="border-b border-slate-100 px-3 py-2"
                            >
                              {Number(row[metric] ?? 0).toLocaleString()}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
