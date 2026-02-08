import { beforeEach, describe, expect, it } from "vitest";
import { buildDefaultProjectPayload } from "@/lib/project-schema";
import {
  mapToDimensionKey,
  mapToMetricKey,
  useWorkspaceStore,
} from "@/store/workspaceStore";

function resetWorkspaceStore() {
  useWorkspaceStore.setState({
    projectId: null,
    name: "",
    panels: [],
    selectedPanelId: null,
  });
}

describe("workspace store", () => {
  beforeEach(() => {
    resetWorkspaceStore();
  });

  it("maps legacy payload keys into semantic rows/metrics", () => {
    const payload = buildDefaultProjectPayload("Test");

    useWorkspaceStore.getState().setFromPayload("project_a", payload);

    const state = useWorkspaceStore.getState();
    expect(state.projectId).toBe("project_a");
    expect(state.panels[0]?.query.rows).toEqual(["eventName"]);
    expect(state.panels[0]?.query.metrics).toEqual(["events"]);
    expect(state.selectedPanelId).toBe(state.panels[0]?.id);
  });

  it("adds and removes panels while keeping one minimum", () => {
    const payload = buildDefaultProjectPayload("Test");
    useWorkspaceStore.getState().setFromPayload("project_a", payload);

    useWorkspaceStore.getState().addPanel();
    expect(useWorkspaceStore.getState().panels).toHaveLength(2);

    const secondPanelId = useWorkspaceStore.getState().panels[1]?.id;
    if (!secondPanelId) {
      throw new Error("Expected second panel to exist");
    }

    useWorkspaceStore.getState().removePanel(secondPanelId);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);

    const firstPanelId = useWorkspaceStore.getState().panels[0]?.id;
    if (!firstPanelId) {
      throw new Error("Expected first panel to exist");
    }

    useWorkspaceStore.getState().removePanel(firstPanelId);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
  });

  it("reorders panels", () => {
    const payload = buildDefaultProjectPayload("Test");
    useWorkspaceStore.getState().setFromPayload("project_a", payload);
    useWorkspaceStore.getState().addPanel();

    const before = useWorkspaceStore.getState().panels.map((panel) => panel.id);
    useWorkspaceStore.getState().reorderPanels(1, 0);
    const after = useWorkspaceStore.getState().panels.map((panel) => panel.id);

    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it("adds and removes dimensions and metrics with de-duplication", () => {
    const payload = buildDefaultProjectPayload("Test");
    useWorkspaceStore.getState().setFromPayload("project_a", payload);
    const panelId = useWorkspaceStore.getState().panels[0]?.id;
    if (!panelId) {
      throw new Error("Expected panel to exist");
    }

    useWorkspaceStore.getState().addRowDimension(panelId, "channel");
    useWorkspaceStore.getState().addRowDimension(panelId, "channel");
    useWorkspaceStore.getState().addMetricColumn(panelId, "revenue");

    const panel = useWorkspaceStore.getState().panels[0];
    expect(panel?.query.rows).toEqual(["eventName", "channel"]);
    expect(panel?.query.metrics).toEqual(["events", "revenue"]);

    useWorkspaceStore.getState().removeRowDimension(panelId, "channel");
    useWorkspaceStore.getState().removeMetricColumn(panelId, "revenue");

    const updatedPanel = useWorkspaceStore.getState().panels[0];
    expect(updatedPanel?.query.rows).toEqual(["eventName"]);
    expect(updatedPanel?.query.metrics).toEqual(["events"]);
  });

  it("updates sort, segment, and date range", () => {
    const payload = buildDefaultProjectPayload("Test");
    useWorkspaceStore.getState().setFromPayload("project_a", payload);
    const panelId = useWorkspaceStore.getState().panels[0]?.id;
    if (!panelId) {
      throw new Error("Expected panel to exist");
    }

    useWorkspaceStore.getState().setSegmentKey(panelId, "segment:purchases");
    useWorkspaceStore.getState().setDateRangePreset(panelId, "last_7_days");
    useWorkspaceStore.getState().addMetricColumn(panelId, "users");
    useWorkspaceStore.getState().setSort(panelId, "users", "asc");

    const panel = useWorkspaceStore.getState().panels[0];
    expect(panel?.query.segmentKey).toBe("segment:purchases");
    expect(panel?.query.dateRange).toEqual({
      type: "preset",
      value: "last_7_days",
    });
    expect(panel?.query.sort).toEqual({ key: "users", direction: "asc" });
  });

  it("adds and removes visualizations", () => {
    const payload = buildDefaultProjectPayload("Test");
    useWorkspaceStore.getState().setFromPayload("project_a", payload);
    const panelId = useWorkspaceStore.getState().panels[0]?.id;
    if (!panelId) {
      throw new Error("Expected panel to exist");
    }

    useWorkspaceStore.getState().addVisualization(panelId, "line");
    useWorkspaceStore.getState().addVisualization(panelId, "bar");

    const panel = useWorkspaceStore.getState().panels[0];
    expect(panel?.visualizations).toHaveLength(4);

    const visualizationId = panel?.visualizations[0]?.id;
    if (!visualizationId) {
      throw new Error("Expected visualization to exist");
    }

    useWorkspaceStore.getState().removeVisualization(panelId, visualizationId);
    expect(useWorkspaceStore.getState().panels[0]?.visualizations).toHaveLength(3);
  });

  it("serializes state to payload blocks", () => {
    const payload = buildDefaultProjectPayload("Test");
    useWorkspaceStore.getState().setFromPayload("project_a", payload);
    const panelId = useWorkspaceStore.getState().panels[0]?.id;
    if (!panelId) {
      throw new Error("Expected panel to exist");
    }

    useWorkspaceStore.getState().setSegmentKey(panelId, "segment:purchases");
    const serialized = useWorkspaceStore.getState().toPayload();
    const panel = serialized.panels[0];

    expect(panel?.blocks[0]).toMatchObject({
      type: "freeform_table",
      query: {
        rows: ["eventName"],
        columns: ["events"],
      },
    });
    expect((panel?.blocks[0] as { query: { segments: unknown[] } }).query.segments).toHaveLength(1);
  });

  it("maps legacy and semantic keys", () => {
    expect(mapToDimensionKey("dimension:eventName")).toBe("eventName");
    expect(mapToDimensionKey("channel")).toBe("channel");
    expect(mapToDimensionKey("brand")).toBe("brand");
    expect(mapToDimensionKey("dimension:brandCode")).toBe("brand");
    expect(mapToMetricKey("metric:event_count")).toBe("events");
    expect(mapToMetricKey("metric:net_demand")).toBe("netDemand");
    expect(mapToMetricKey("users")).toBe("users");
    expect(mapToMetricKey("metric:unknown")).toBeNull();
  });
});
