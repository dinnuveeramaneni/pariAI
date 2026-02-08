/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentType, MemberStatus, OrganizationRole } from "@prisma/client";
import { nanoid } from "nanoid";

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

type OrganizationMemberRecord = {
  id: string;
  orgId: string;
  userId: string;
  role: OrganizationRole;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
};

type InvitationRecord = {
  id: string;
  orgId: string;
  email: string;
  role: OrganizationRole;
  tokenHash: string;
  expiresAt: Date;
  invitedById: string;
  createdAt: Date;
  acceptedAt: Date | null;
};

type ApiKeyRecord = {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  secretHash: string;
  revokedAt: Date | null;
  createdById: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

type ComponentRecord = {
  id: string;
  orgId: string;
  type: ComponentType;
  key: string;
  label: string;
  definition: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectRecord = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

type ProjectVersionRecord = {
  id: string;
  projectId: string;
  orgId: string;
  versionNo: number;
  schemaVersion: number;
  payload: unknown;
  checksum: string;
  createdById: string;
  createdAt: Date;
};

type EventRecord = {
  id: string;
  orgId: string;
  eventId: string;
  eventName: string;
  timestamp: Date;
  userId: string | null;
  sessionId: string | null;
  properties: Record<string, unknown>;
  ingestedAt: Date;
};

type AuditLogRecord = {
  id: string;
  orgId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
};

type MemoryState = {
  users: UserRecord[];
  organizations: OrganizationRecord[];
  memberships: OrganizationMemberRecord[];
  invitations: InvitationRecord[];
  apiKeys: ApiKeyRecord[];
  components: ComponentRecord[];
  projects: ProjectRecord[];
  projectVersions: ProjectVersionRecord[];
  events: EventRecord[];
  auditLogs: AuditLogRecord[];
};

declare global {
  var __memoryPrismaState: MemoryState | undefined;
}

const state: MemoryState =
  global.__memoryPrismaState ??
  ({
    users: [],
    organizations: [],
    memberships: [],
    invitations: [],
    apiKeys: [],
    components: [],
    projects: [],
    projectVersions: [],
    events: [],
    auditLogs: [],
  } satisfies MemoryState);

global.__memoryPrismaState = state;

function pick<T extends Record<string, unknown>>(
  value: T,
  select?: Record<string, boolean>,
) {
  if (!select) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) {
      output[key] = value[key];
    }
  }
  return output;
}

function now() {
  return new Date();
}

function mapOrder<T extends Record<string, unknown>>(
  input: T[],
  orderBy?: Record<string, "asc" | "desc">,
) {
  if (!orderBy) {
    return input;
  }
  const [key, direction] = Object.entries(orderBy)[0] as [
    keyof T,
    "asc" | "desc",
  ];
  return [...input].sort((a, b) => {
    const left = a[key] as Date | number | string | null;
    const right = b[key] as Date | number | string | null;
    if (left === right) {
      return 0;
    }
    if (left === null) {
      return direction === "asc" ? -1 : 1;
    }
    if (right === null) {
      return direction === "asc" ? 1 : -1;
    }
    if (left < right) {
      return direction === "asc" ? -1 : 1;
    }
    return direction === "asc" ? 1 : -1;
  });
}

export function createMemoryPrismaClient() {
  const client: any = {
    $disconnect: async () => undefined,
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) =>
      fn(client),
    user: {
      findUnique: async ({ where, select, include }: any) => {
        const user = state.users.find((entry) =>
          where.email ? entry.email === where.email : entry.id === where.id,
        );
        if (!user) {
          return null;
        }

        if (include?.memberships) {
          let memberships = state.memberships.filter(
            (member) => member.userId === user.id,
          );
          if (include.memberships.orderBy) {
            memberships = mapOrder(memberships, include.memberships.orderBy);
          }
          if (typeof include.memberships.take === "number") {
            memberships = memberships.slice(0, include.memberships.take);
          }
          return { ...user, memberships };
        }
        return pick(
          user as unknown as Record<string, unknown>,
          select as Record<string, boolean>,
        );
      },
      create: async ({ data, select }: any) => {
        const record: UserRecord = {
          id: nanoid(),
          email: data.email,
          passwordHash: data.passwordHash ?? null,
          name: data.name ?? null,
          image: data.image ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.users.push(record);
        return pick(
          record as unknown as Record<string, unknown>,
          select as Record<string, boolean>,
        );
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = state.users.find((user) => user.email === where.email);
        if (existing) {
          Object.assign(existing, update, { updatedAt: now() });
          return existing;
        }
        const created: UserRecord = {
          id: nanoid(),
          email: create.email,
          passwordHash: create.passwordHash ?? null,
          name: create.name ?? null,
          image: create.image ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.users.push(created);
        return created;
      },
    },
    organization: {
      findUnique: async ({ where, select }: any) => {
        const org = state.organizations.find((entry) =>
          where.slug ? entry.slug === where.slug : entry.id === where.id,
        );
        if (!org) {
          return null;
        }
        return pick(
          org as unknown as Record<string, unknown>,
          select as Record<string, boolean>,
        );
      },
      create: async ({ data, select }: any) => {
        const record: OrganizationRecord = {
          id: nanoid(),
          name: data.name,
          slug: data.slug,
          createdById: data.createdById,
          createdAt: now(),
          updatedAt: now(),
        };
        state.organizations.push(record);

        if (data.memberships?.create) {
          const membership: OrganizationMemberRecord = {
            id: nanoid(),
            orgId: record.id,
            userId: data.memberships.create.userId,
            role: data.memberships.create.role ?? OrganizationRole.MEMBER,
            status: MemberStatus.ACTIVE,
            createdAt: now(),
            updatedAt: now(),
          };
          state.memberships.push(membership);
        }

        return pick(
          record as unknown as Record<string, unknown>,
          select as Record<string, boolean>,
        );
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = state.organizations.find(
          (org) => org.slug === where.slug,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: now() });
          return existing;
        }
        const created: OrganizationRecord = {
          id: nanoid(),
          name: create.name,
          slug: create.slug,
          createdById: create.createdById,
          createdAt: now(),
          updatedAt: now(),
        };
        state.organizations.push(created);
        return created;
      },
    },
    organizationMember: {
      findMany: async ({ where, include, orderBy }: any) => {
        let members = state.memberships.filter((entry) => {
          if (where?.orgId && entry.orgId !== where.orgId) {
            return false;
          }
          if (where?.userId && entry.userId !== where.userId) {
            return false;
          }
          return true;
        });
        members = mapOrder(members, orderBy);

        if (include?.org) {
          return members.map((member) => ({
            ...member,
            org: state.organizations.find((org) => org.id === member.orgId),
          }));
        }
        if (include?.user) {
          return members.map((member) => ({
            ...member,
            user: pick(
              state.users.find(
                (user) => user.id === member.userId,
              )! as unknown as Record<string, unknown>,
              include.user.select,
            ),
          }));
        }

        return members;
      },
      findUnique: async ({ where }: any) => {
        return (
          state.memberships.find(
            (entry) =>
              entry.orgId === where.orgId_userId.orgId &&
              entry.userId === where.orgId_userId.userId,
          ) ?? null
        );
      },
      findFirst: async ({ where, select, orderBy }: any) => {
        let members = state.memberships.filter((entry) => {
          if (where?.orgId && entry.orgId !== where.orgId) {
            return false;
          }
          if (where?.userId && entry.userId !== where.userId) {
            return false;
          }
          if (where?.id && entry.id !== where.id) {
            return false;
          }
          if (where?.role && entry.role !== where.role) {
            return false;
          }
          return true;
        });
        members = mapOrder(members, orderBy);
        const member = members[0];
        if (!member) {
          return null;
        }
        return pick(member as unknown as Record<string, unknown>, select);
      },
      count: async ({ where }: any) =>
        state.memberships.filter(
          (entry) =>
            entry.orgId === where.orgId &&
            (!where.role || entry.role === where.role),
        ).length,
      upsert: async ({ where, update, create }: any) => {
        const existing = state.memberships.find(
          (entry) =>
            entry.orgId === where.orgId_userId.orgId &&
            entry.userId === where.orgId_userId.userId,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: now() });
          return existing;
        }
        const created: OrganizationMemberRecord = {
          id: nanoid(),
          orgId: create.orgId,
          userId: create.userId,
          role: create.role ?? OrganizationRole.MEMBER,
          status: create.status ?? MemberStatus.ACTIVE,
          createdAt: now(),
          updatedAt: now(),
        };
        state.memberships.push(created);
        return created;
      },
      update: async ({ where, data, select }: any) => {
        const member = state.memberships.find(
          (entry) => entry.id === where.id,
        )!;
        Object.assign(member, data, { updatedAt: now() });
        return pick(member as unknown as Record<string, unknown>, select);
      },
      updateMany: async ({ where, data }: any) => {
        const members = state.memberships.filter(
          (entry) => entry.orgId === where.orgId,
        );
        for (const member of members) {
          Object.assign(member, data, { updatedAt: now() });
        }
        return { count: members.length };
      },
      delete: async ({ where }: any) => {
        const index = state.memberships.findIndex(
          (entry) => entry.id === where.id,
        );
        if (index >= 0) {
          state.memberships.splice(index, 1);
        }
        return { id: where.id };
      },
    },
    invitation: {
      findMany: async ({ where, select, orderBy }: any) => {
        let invites = state.invitations.filter(
          (entry) => entry.orgId === where.orgId,
        );
        invites = mapOrder(invites, orderBy);
        return invites.map((invite) =>
          pick(invite as unknown as Record<string, unknown>, select),
        );
      },
      create: async ({ data, select }: any) => {
        const invite: InvitationRecord = {
          id: nanoid(),
          orgId: data.orgId,
          email: data.email,
          role: data.role,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          invitedById: data.invitedById,
          createdAt: now(),
          acceptedAt: null,
        };
        state.invitations.push(invite);
        return pick(invite as unknown as Record<string, unknown>, select);
      },
      findFirst: async ({ where }: any) => {
        return (
          state.invitations.find(
            (entry) =>
              entry.tokenHash === where.tokenHash &&
              entry.email === where.email &&
              entry.acceptedAt === null &&
              entry.expiresAt > where.expiresAt.gt,
          ) ?? null
        );
      },
      update: async ({ where, data }: any) => {
        const invite = state.invitations.find(
          (entry) => entry.id === where.id,
        )!;
        Object.assign(invite, data);
        return invite;
      },
    },
    apiKey: {
      findMany: async ({ where, select, orderBy }: any) => {
        let keys = state.apiKeys.filter((entry) => entry.orgId === where.orgId);
        keys = mapOrder(keys, orderBy);
        return keys.map((entry) =>
          pick(entry as unknown as Record<string, unknown>, select),
        );
      },
      create: async ({ data, select }: any) => {
        const record: ApiKeyRecord = {
          id: nanoid(),
          orgId: data.orgId,
          name: data.name,
          prefix: data.prefix,
          secretHash: data.secretHash,
          revokedAt: null,
          createdById: data.createdById,
          createdAt: now(),
          lastUsedAt: null,
        };
        state.apiKeys.push(record);
        return pick(record as unknown as Record<string, unknown>, select);
      },
      findUnique: async ({ where, select }: any) => {
        const key = state.apiKeys.find((entry) =>
          where.prefix ? entry.prefix === where.prefix : entry.id === where.id,
        );
        if (!key) {
          return null;
        }
        return pick(key as unknown as Record<string, unknown>, select);
      },
      findFirst: async ({ where, select }: any) => {
        const key =
          state.apiKeys.find((entry) => {
            if (where.id && entry.id !== where.id) {
              return false;
            }
            if (where.orgId && entry.orgId !== where.orgId) {
              return false;
            }
            if (where.revokedAt === null && entry.revokedAt !== null) {
              return false;
            }
            return true;
          }) ?? null;

        if (!key) {
          return null;
        }
        return pick(key as unknown as Record<string, unknown>, select);
      },
      update: async ({ where, data }: any) => {
        const key = state.apiKeys.find((entry) => entry.id === where.id)!;
        Object.assign(key, data);
        return key;
      },
    },
    project: {
      findMany: async ({ where, orderBy, include }: any) => {
        let projects = state.projects.filter(
          (entry) =>
            entry.orgId === where.orgId &&
            entry.archivedAt === where.archivedAt,
        );
        projects = mapOrder(projects, orderBy);
        if (include?.versions) {
          return projects.map((project) => {
            let versions = state.projectVersions.filter(
              (version) => version.projectId === project.id,
            );
            if (include.versions.orderBy) {
              versions = mapOrder(versions, include.versions.orderBy);
            }
            if (typeof include.versions.take === "number") {
              versions = versions.slice(0, include.versions.take);
            }
            return {
              ...project,
              versions: versions.map((version) =>
                pick(
                  version as unknown as Record<string, unknown>,
                  include.versions.select,
                ),
              ),
            };
          });
        }
        return projects;
      },
      create: async ({ data }: any) => {
        const project: ProjectRecord = {
          id: nanoid(),
          orgId: data.orgId,
          name: data.name,
          description: data.description ?? null,
          createdById: data.createdById,
          createdAt: now(),
          updatedAt: now(),
          archivedAt: null,
        };
        state.projects.push(project);
        return project;
      },
      findFirst: async ({ where, include, select }: any) => {
        const project =
          state.projects.find((entry) => {
            if (where.id && entry.id !== where.id) {
              return false;
            }
            if (where.orgId && entry.orgId !== where.orgId) {
              return false;
            }
            if (where.archivedAt === null && entry.archivedAt !== null) {
              return false;
            }
            return true;
          }) ?? null;
        if (!project) {
          return null;
        }

        if (include?.versions) {
          let versions = state.projectVersions.filter(
            (version) => version.projectId === project.id,
          );
          versions = mapOrder(versions, include.versions.orderBy);
          versions = versions.slice(
            0,
            include.versions.take ?? versions.length,
          );
          return {
            ...project,
            versions,
          };
        }

        if (select) {
          return pick(project as unknown as Record<string, unknown>, select);
        }
        return project;
      },
      updateMany: async ({ where, data }: any) => {
        const projects = state.projects.filter(
          (entry) => entry.id === where.id && entry.orgId === where.orgId,
        );
        for (const project of projects) {
          Object.assign(project, data, { updatedAt: now() });
        }
        return { count: projects.length };
      },
      update: async ({ where, data }: any) => {
        const project = state.projects.find((entry) => entry.id === where.id)!;
        Object.assign(project, data, { updatedAt: now() });
        return project;
      },
    },
    projectVersion: {
      create: async ({ data, select }: any) => {
        const version: ProjectVersionRecord = {
          id: nanoid(),
          projectId: data.projectId,
          orgId: data.orgId,
          versionNo: data.versionNo,
          schemaVersion: data.schemaVersion,
          payload: data.payload,
          checksum: data.checksum,
          createdById: data.createdById,
          createdAt: now(),
        };
        state.projectVersions.push(version);
        return pick(version as unknown as Record<string, unknown>, select);
      },
      findMany: async ({ where, orderBy, select }: any) => {
        let versions = state.projectVersions.filter(
          (entry) =>
            entry.orgId === where.orgId && entry.projectId === where.projectId,
        );
        versions = mapOrder(versions, orderBy);
        return versions.map((entry) =>
          pick(entry as unknown as Record<string, unknown>, select),
        );
      },
      findFirst: async ({ where, orderBy, select }: any) => {
        let versions = state.projectVersions.filter(
          (entry) =>
            entry.orgId === where.orgId && entry.projectId === where.projectId,
        );
        versions = mapOrder(versions, orderBy);
        const first = versions[0];
        if (!first) {
          return null;
        }
        return pick(first as unknown as Record<string, unknown>, select);
      },
    },
    component: {
      upsert: async ({ where, update, create }: any) => {
        const existing = state.components.find(
          (entry) =>
            entry.orgId === where.orgId_key.orgId &&
            entry.key === where.orgId_key.key,
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: now() });
          return existing;
        }
        const record: ComponentRecord = {
          id: nanoid(),
          orgId: create.orgId,
          type: create.type,
          key: create.key,
          label: create.label,
          definition: create.definition,
          createdAt: now(),
          updatedAt: now(),
        };
        state.components.push(record);
        return record;
      },
      findMany: async ({ where, orderBy }: any) => {
        let components = state.components.filter((entry) => {
          if (entry.orgId !== where.orgId) {
            return false;
          }
          if (where.type && entry.type !== where.type) {
            return false;
          }
          return true;
        });
        if (Array.isArray(orderBy)) {
          for (const order of orderBy.reverse()) {
            components = mapOrder(components, order);
          }
        }
        return components;
      },
    },
    event: {
      count: async ({ where }: any) =>
        state.events.filter((entry) => {
          if (where?.orgId && entry.orgId !== where.orgId) {
            return false;
          }
          if (where?.timestamp?.gte && entry.timestamp < where.timestamp.gte) {
            return false;
          }
          if (where?.timestamp?.lte && entry.timestamp > where.timestamp.lte) {
            return false;
          }
          return true;
        }).length,
      deleteMany: async ({ where }: any) => {
        const before = state.events.length;
        state.events = state.events.filter((entry) => {
          if (where?.orgId && entry.orgId !== where.orgId) {
            return true;
          }
          if (where?.eventId?.in && !where.eventId.in.includes(entry.eventId)) {
            return true;
          }
          if (where?.timestamp?.gte && entry.timestamp < where.timestamp.gte) {
            return true;
          }
          if (where?.timestamp?.lte && entry.timestamp > where.timestamp.lte) {
            return true;
          }
          return false;
        });
        return { count: before - state.events.length };
      },
      createMany: async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const entry of data as Array<Record<string, unknown>>) {
          const duplicate = state.events.find(
            (event) =>
              event.orgId === entry.orgId && event.eventId === entry.eventId,
          );
          if (duplicate && skipDuplicates) {
            continue;
          }
          state.events.push({
            id: nanoid(),
            orgId: String(entry.orgId),
            eventId: String(entry.eventId),
            eventName: String(entry.eventName),
            timestamp: entry.timestamp as Date,
            userId: (entry.userId as string | null) ?? null,
            sessionId: (entry.sessionId as string | null) ?? null,
            properties: (entry.properties as Record<string, unknown>) ?? {},
            ingestedAt: now(),
          });
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where, select }: any) => {
        const events = state.events.filter((entry) => {
          if (entry.orgId !== where.orgId) {
            return false;
          }
          if (where.timestamp?.gte && entry.timestamp < where.timestamp.gte) {
            return false;
          }
          if (where.timestamp?.lte && entry.timestamp > where.timestamp.lte) {
            return false;
          }
          return true;
        });
        return events.map((event) =>
          pick(event as unknown as Record<string, unknown>, select),
        );
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const entry: AuditLogRecord = {
          id: nanoid(),
          orgId: data.orgId,
          actorUserId: data.actorUserId ?? null,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId ?? null,
          metadata: data.metadata ?? null,
          createdAt: now(),
        };
        state.auditLogs.push(entry);
        return entry;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        let logs = state.auditLogs.filter(
          (entry) => entry.orgId === where.orgId,
        );
        logs = mapOrder(logs, orderBy);
        if (typeof take === "number") {
          logs = logs.slice(0, take);
        }
        return logs;
      },
    },
  };

  return client;
}
