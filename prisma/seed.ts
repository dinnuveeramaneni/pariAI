import { OrganizationRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { ensureOrgComponents } from "../lib/component-catalog";
import { ensureSampleEventsForAllOrgs } from "../lib/sample-data";
import {
  buildDefaultProjectPayload,
  LATEST_PROJECT_SCHEMA_VERSION,
} from "../lib/project-schema";
import { sha256, slugify } from "../lib/util";

async function main() {
  const email = "owner@example.com";
  const passwordHash = await hashPassword("Password123!");

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
      name: "Default Owner",
    },
  });

  const orgName = "Default Org";
  const org = await prisma.organization.upsert({
    where: { slug: slugify(orgName) },
    update: {},
    create: {
      name: orgName,
      slug: slugify(orgName),
      createdById: user.id,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      orgId_userId: {
        orgId: org.id,
        userId: user.id,
      },
    },
    update: { role: OrganizationRole.OWNER },
    create: {
      orgId: org.id,
      userId: user.id,
      role: OrganizationRole.OWNER,
    },
  });

  await ensureOrgComponents(org.id);

  const projectName = "Sample Workspace Project";
  const project = await prisma.project.create({
    data: {
      orgId: org.id,
      name: projectName,
      createdById: user.id,
    },
  });

  const payload = buildDefaultProjectPayload(projectName);
  await prisma.projectVersion.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      versionNo: 1,
      schemaVersion: LATEST_PROJECT_SCHEMA_VERSION,
      payload: payload as object,
      checksum: sha256(JSON.stringify(payload)),
      createdById: user.id,
    },
  });

  const runtimePrisma = prisma as unknown as {
    panel?: {
      create: (args: {
        data: {
          orgId: string;
          projectId: string;
          createdById: string;
          title: string;
          position: number;
          tableConfig: { rows: string[]; columns: string[] };
        };
      }) => Promise<{ id: string }>;
    };
    visualization?: {
      createMany: (args: {
        data: Array<{
          orgId: string;
          projectId: string;
          panelId: string;
          createdById: string;
          type: string;
          title: string;
          position: number;
          config: { x: string; y: string };
        }>;
      }) => Promise<unknown>;
    };
  };

  if (runtimePrisma.panel && runtimePrisma.visualization) {
    const panel = await runtimePrisma.panel.create({
      data: {
        orgId: org.id,
        projectId: project.id,
        createdById: user.id,
        title: "Panel 1",
        position: 0,
        tableConfig: {
          rows: ["eventName"],
          columns: ["events"],
        },
      },
    });

    await runtimePrisma.visualization.createMany({
      data: [
        {
          orgId: org.id,
          projectId: project.id,
          panelId: panel.id,
          createdById: user.id,
          type: "line",
          title: "Event trend",
          position: 0,
          config: { x: "eventName", y: "events" },
        },
        {
          orgId: org.id,
          projectId: project.id,
          panelId: panel.id,
          createdById: user.id,
          type: "bar",
          title: "Top dimensions",
          position: 1,
          config: { x: "eventName", y: "events" },
        },
      ],
    });
  }

  await ensureSampleEventsForAllOrgs();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
