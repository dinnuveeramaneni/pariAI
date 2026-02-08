export const LATEST_PROJECT_SCHEMA_VERSION = 1;

export type FreeformQuery = {
  rows: string[];
  columns: string[];
  segments: SegmentGroup[];
  dateRange: DateRangeInput;
  limit: number;
};

export type DateRangeInput =
  | {
      type: "preset";
      value: "last_7_days" | "last_30_days";
    }
  | {
      type: "custom";
      from: string;
      to: string;
    };

export type SegmentRule = {
  field: string;
  operator: "eq" | "neq" | "contains";
  value: string;
};

export type SegmentGroup = {
  op: "AND" | "OR";
  rules: SegmentRule[];
};

export type WorkspaceBlock =
  | {
      id: string;
      type: "freeform_table";
      query: FreeformQuery;
    }
  | {
      id: string;
      type: "line_chart" | "bar_chart";
      sourceBlockId: string;
      config: Record<string, unknown>;
    };

export type WorkspacePanel = {
  id: string;
  title: string;
  blocks: WorkspaceBlock[];
};

export type ProjectPayloadV1 = {
  schemaVersion: 1;
  name: string;
  panels: WorkspacePanel[];
};

export type AnyProjectPayload = ProjectPayloadV1;

export function buildDefaultProjectPayload(
  projectName: string,
): ProjectPayloadV1 {
  return {
    schemaVersion: 1,
    name: projectName,
    panels: [
      {
        id: "panel_1",
        title: "Panel 1",
        blocks: [
          {
            id: "table_1",
            type: "freeform_table",
            query: {
              rows: ["eventName"],
              columns: ["events"],
              segments: [],
              dateRange: { type: "preset", value: "last_30_days" },
              limit: 50,
            },
          },
          {
            id: "line_1",
            type: "line_chart",
            sourceBlockId: "table_1",
            config: { x: "eventName", y: ["events"] },
          },
          {
            id: "bar_1",
            type: "bar_chart",
            sourceBlockId: "table_1",
            config: { x: "eventName", y: ["events"] },
          },
        ],
      },
    ],
  };
}

export function migrateProjectPayload(
  payload: unknown,
  schemaVersion: number,
): AnyProjectPayload {
  if (schemaVersion === 1) {
    return payload as ProjectPayloadV1;
  }

  throw new Error(`Unsupported project schema version: ${schemaVersion}`);
}
