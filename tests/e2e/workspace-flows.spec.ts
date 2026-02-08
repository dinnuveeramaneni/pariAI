import { expect, test, type Page } from "@playwright/test";

type WorkspaceSetup = {
  orgId: string;
  workspaceHref: string;
};

async function createOrgAndProject(page: Page, suffix: string): Promise<WorkspaceSetup> {
  const orgResponse = await page.request.post("/api/orgs", {
    data: {
      name: `Workspace Org ${suffix}`,
    },
  });
  expect(orgResponse.status()).toBe(201);
  const orgPayload = (await orgResponse.json()) as { organization: { id: string } };
  const orgId = orgPayload.organization.id;

  const projectResponse = await page.request.post(`/api/orgs/${orgId}/projects`, {
    data: {
      name: `Workspace Project ${suffix}`,
    },
  });
  expect(projectResponse.status()).toBe(201);
  const projectPayload = (await projectResponse.json()) as { project: { id: string } };

  return {
    orgId,
    workspaceHref: `/workspace/${projectPayload.project.id}?orgId=${orgId}`,
  };
}

async function createApiKey(page: Page, orgId: string): Promise<string> {
  const response = await page.request.post(`/api/orgs/${orgId}/api-keys`, {
    data: {
      name: "E2E Ingestion Key",
    },
  });
  expect(response.status()).toBe(201);

  const payload = (await response.json()) as { plaintext: string };
  return payload.plaintext;
}

async function ingestEvents(page: Page, apiKey: string, stamp: number) {
  const ingestResponse = await page.request.post("/api/ingest/events", {
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    data: {
      events: [
        {
          eventId: `evt-${stamp}-1`,
          eventName: "purchase",
          timestamp: new Date().toISOString(),
          userId: "user-1",
          sessionId: "session-1",
          properties: {
            channel: "paid",
            product: "sku-1",
            campaign: "spring-sale",
            revenue: 99,
          },
        },
        {
          eventId: `evt-${stamp}-2`,
          eventName: "purchase",
          timestamp: new Date().toISOString(),
          userId: "user-2",
          sessionId: "session-2",
          properties: {
            channel: "organic",
            product: "sku-2",
            campaign: "brand",
            revenue: 50,
          },
        },
      ],
    },
  });

  expect(ingestResponse.status()).toBe(202);
}

async function openWorkspaceReady(page: Page, workspaceHref: string) {
  await page.goto(workspaceHref);
  await expect(page).toHaveURL(/\/workspace\//);
  await expect
    .poll(async () => await page.getByText("Loading workspace...").count(), {
      timeout: 45_000,
    })
    .toBe(0);
  await expect(page.getByRole("heading", { name: "Panels" })).toBeVisible({
    timeout: 30_000,
  });
}

test("create project -> add dimension/metric -> see rows -> add chart", async ({
  page,
}) => {
  const stamp = Date.now();
  const setup = await createOrgAndProject(page, `flow-a-${stamp}`);
  const apiKey = await createApiKey(page, setup.orgId);
  await ingestEvents(page, apiKey, stamp);

  await openWorkspaceReady(page, setup.workspaceHref);

  await page.getByRole("button", { name: "Add Channel" }).first().click();
  await page.getByRole("button", { name: "Metrics" }).click();
  await page.getByRole("button", { name: "Add Revenue" }).first().click();

  await expect(page.getByText("Rows:", { exact: false })).toContainText(/Rows:\s*[1-9]/);

  const removeChartButtons = page.getByRole("button", {
    name: /^Remove (Line|Bar)/,
  });
  const before = await removeChartButtons.count();
  await page.getByRole("button", { name: "Add visualization" }).first().click();
  await expect.poll(async () => removeChartButtons.count()).toBe(before + 1);
});

test("create API key -> ingest events -> see metrics in workspace table", async ({
  page,
}) => {
  const stamp = Date.now();
  const setup = await createOrgAndProject(page, `flow-b-${stamp}`);
  const apiKey = await createApiKey(page, setup.orgId);
  await ingestEvents(page, apiKey, stamp + 1000);

  await openWorkspaceReady(page, setup.workspaceHref);

  await expect(page.getByText("Rows:", { exact: false })).toContainText(/Rows:\s*[1-9]/);
  await expect(page.getByText("Query time:", { exact: false })).toBeVisible();
});
