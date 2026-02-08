import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveOrgForUser } from "@/lib/org";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const org = await resolveOrgForUser(session.user.id);
  if (!org) {
    redirect("/org");
  }

  redirect(`/projects?orgId=${org.orgId}`);
}
