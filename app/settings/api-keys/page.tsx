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

type ApiKeyMeta = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export default function ApiKeysPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [newKeyName, setNewKeyName] = useState("Ingestion Key");
  const [plaintextKey, setPlaintextKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgId = useMemo(
    () => searchParams.get("orgId") ?? orgs[0]?.id ?? null,
    [searchParams, orgs],
  );

  const load = async () => {
    setError(null);
    const orgResp = await fetch("/api/orgs");
    if (!orgResp.ok) {
      setError("Unable to load organizations");
      return;
    }

    const orgPayload = (await orgResp.json()) as { organizations: Org[] };
    setOrgs(orgPayload.organizations);
    const activeOrgId =
      searchParams.get("orgId") ?? orgPayload.organizations[0]?.id;
    if (!activeOrgId) {
      return;
    }

    if (!searchParams.get("orgId")) {
      router.replace(`/settings/api-keys?orgId=${activeOrgId}`);
    }

    const keyResp = await fetch(`/api/orgs/${activeOrgId}/api-keys`);
    if (!keyResp.ok) {
      setError("You need Admin or Owner role to view keys.");
      return;
    }

    const payload = (await keyResp.json()) as { apiKeys: ApiKeyMeta[] };
    setKeys(payload.apiKeys);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const createKey = async () => {
    if (!orgId) {
      return;
    }

    const response = await fetch(`/api/orgs/${orgId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    if (!response.ok) {
      setError("Failed to create API key");
      return;
    }

    const payload = (await response.json()) as { plaintext: string };
    setPlaintextKey(payload.plaintext);
    await load();
  };

  const revoke = async (keyId: string) => {
    if (!orgId) {
      return;
    }

    await fetch(`/api/orgs/${orgId}/api-keys/${keyId}/revoke`, {
      method: "POST",
    });
    await load();
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
        <p className="text-sm text-slate-500">
          Create and revoke org-scoped ingestion keys. Keys are shown once.
        </p>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {plaintextKey ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Copy now - hidden later
          </p>
          <p className="mt-2 break-all font-mono text-sm text-amber-900">
            {plaintextKey}
          </p>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Organization
        </h2>
        <div className="flex flex-wrap gap-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => router.push(`/settings/api-keys?orgId=${org.id}`)}
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
          Create key
        </h2>
        <div className="flex gap-2">
          <Input
            value={newKeyName}
            onChange={(event) => setNewKeyName(event.target.value)}
          />
          <Button onClick={createKey} disabled={!orgId}>
            Create key
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Key list
        </h2>
        {keys.length === 0 ? (
          <p className="text-sm text-slate-500">No keys created.</p>
        ) : (
          <ul className="space-y-2">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{key.name}</p>
                  <p className="text-xs text-slate-500">
                    Prefix: {key.prefix} | Last used:{" "}
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString()
                      : "Never"}
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => revoke(key.id)}
                  disabled={Boolean(key.revokedAt)}
                >
                  {key.revokedAt ? "Revoked" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
