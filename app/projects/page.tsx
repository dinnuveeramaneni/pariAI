"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Org = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedOrgId = useMemo(() => {
    return searchParams.get("orgId") ?? orgs[0]?.id ?? null;
  }, [searchParams, orgs]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const orgResponse = await fetch("/api/orgs");
      if (!orgResponse.ok) {
        setError("You are not signed in.");
        setLoading(false);
        return;
      }

      const orgPayload = (await orgResponse.json()) as { organizations: Org[] };
      setOrgs(orgPayload.organizations);

      const activeOrgId =
        searchParams.get("orgId") ?? orgPayload.organizations[0]?.id;
      if (activeOrgId) {
        const projectResponse = await fetch(
          `/api/orgs/${activeOrgId}/projects`,
        );
        if (projectResponse.ok) {
          const projectPayload = (await projectResponse.json()) as {
            projects: Project[];
          };
          setProjects(projectPayload.projects);
          if (!searchParams.get("orgId")) {
            router.replace(`/projects?orgId=${activeOrgId}`);
          }
        }
      }
      setLoading(false);
    };

    void load();
  }, [router, searchParams]);

  const createOrg = async () => {
    if (!newOrgName.trim()) {
      return;
    }

    const response = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newOrgName }),
    });
    if (!response.ok) {
      setError("Failed to create org");
      return;
    }

    const payload = (await response.json()) as { organization: Org };
    const nextOrgs = [...orgs, payload.organization];
    setOrgs(nextOrgs);
    setNewOrgName("");
    router.push(`/projects?orgId=${payload.organization.id}`);
  };

  const createProject = async () => {
    if (!selectedOrgId || !newProjectName.trim()) {
      return;
    }

    const response = await fetch(`/api/orgs/${selectedOrgId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName }),
    });
    if (!response.ok) {
      setError("Failed to create project");
      return;
    }

    const projectsResponse = await fetch(`/api/orgs/${selectedOrgId}/projects`);
    const projectPayload = (await projectsResponse.json()) as {
      projects: Project[];
    };
    setProjects(projectPayload.projects);
    setNewProjectName("");
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading projects...</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
        <p className="text-sm text-slate-500">
          Create projects and open workspace panels.
        </p>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Organizations
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => router.push(`/projects?orgId=${org.id}`)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                selectedOrgId === org.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {org.name} ({org.role})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newOrgName}
            onChange={(event) => setNewOrgName(event.target.value)}
            placeholder="New organization name"
          />
          <Button onClick={createOrg}>Create org</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Create project
        </h2>
        <div className="flex gap-2">
          <Input
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder="Project name"
          />
          <Button onClick={createProject} disabled={!selectedOrgId}>
            Create
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Project list
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">No projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between rounded-md border border-slate-200 p-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-500">
                    Updated {new Date(project.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                  href={`/workspace/${project.id}?orgId=${selectedOrgId ?? ""}`}
                >
                  Open workspace
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
