import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkspaceClient } from "@/components/workspace/workspace-client";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ orgId?: string }>;
};

export default async function WorkspacePage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const { projectId } = await params;
  const { orgId } = await searchParams;

  return <WorkspaceClient projectId={projectId} initialOrgId={orgId ?? null} />;
}
