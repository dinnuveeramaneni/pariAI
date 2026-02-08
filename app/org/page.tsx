"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Org = {
  id: string;
  name: string;
  role: string;
};

type Member = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  status: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export default function OrgPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const orgId = useMemo(
    () => searchParams.get("orgId") ?? orgs[0]?.id ?? null,
    [searchParams, orgs],
  );

  const load = async () => {
    const orgResp = await fetch("/api/orgs");
    if (!orgResp.ok) {
      setError("Unable to load organizations");
      return;
    }
    const orgPayload = (await orgResp.json()) as { organizations: Org[] };
    setOrgs(orgPayload.organizations);
    const selected =
      searchParams.get("orgId") ?? orgPayload.organizations[0]?.id;
    if (!selected) {
      return;
    }

    if (!searchParams.get("orgId")) {
      router.replace(`/org?orgId=${selected}`);
    }

    const [memberResp, inviteResp] = await Promise.all([
      fetch(`/api/orgs/${selected}/members`),
      fetch(`/api/orgs/${selected}/invites`),
    ]);

    if (memberResp.ok) {
      const memberPayload = (await memberResp.json()) as { members: Member[] };
      setMembers(memberPayload.members);
    }

    if (inviteResp.ok) {
      const invitePayload = (await inviteResp.json()) as { invites: Invite[] };
      setInvites(invitePayload.invites);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const invite = async () => {
    if (!orgId || !inviteEmail.trim()) {
      return;
    }

    const response = await fetch(`/api/orgs/${orgId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

    if (!response.ok) {
      setError("Failed to send invite. You might not have admin permissions.");
      return;
    }

    const payload = (await response.json()) as { token: string };
    setInviteEmail("");
    setToken(payload.token);
    await load();
  };

  const updateRole = async (memberId: string, role: Member["role"]) => {
    if (!orgId) {
      return;
    }
    await fetch(`/api/orgs/${orgId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await load();
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Organization</h1>
        <p className="text-sm text-slate-500">
          Manage members and invitations.
        </p>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {token ? (
        <p className="text-xs text-amber-700">Invite token (MVP): {token}</p>
      ) : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Active org
        </h2>
        <div className="flex flex-wrap gap-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => router.push(`/org?orgId=${org.id}`)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                org.id === orgId
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {org.name} ({org.role})
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Invite member
        </h2>
        <div className="flex flex-col gap-2 md:flex-row">
          <Input
            type="email"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
          />
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
          >
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <Button onClick={invite}>Send invite</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Members
        </h2>
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {member.user.email}
                </p>
                <p className="text-xs text-slate-500">
                  {member.user.name ?? "No name"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                  value={member.role}
                  onChange={(event) =>
                    updateRole(member.id, event.target.value as Member["role"])
                  }
                >
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Invites
        </h2>
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">No pending invites.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inviteItem) => (
              <li
                key={inviteItem.id}
                className="rounded-md border border-slate-200 p-3 text-sm"
              >
                {inviteItem.email} - {inviteItem.role} -{" "}
                {inviteItem.acceptedAt
                  ? "Accepted"
                  : `Expires ${new Date(inviteItem.expiresAt).toLocaleDateString()}`}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
