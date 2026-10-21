import { redirect } from "next/navigation";

import ProjectsView from "@/components/projects/ProjectsView";
import { ScreenTitle } from "@/components/bot/ui";
import { getViewer } from "@/lib/crew/auth";
import { hasPerm } from "@/lib/crew/types";

// Projects on their own page, for a group that has projects.view without the
// Crew tab. Owners and the Crew tab reach the same view under Crew > Projects.
// The route (/api/crew/projects) decides what is in it.
export default async function AppProjects() {
  const viewer = await getViewer();
  if (viewer.kind === "crew" && !hasPerm(viewer.person, "projects.view")) redirect("/app");
  if (viewer.kind !== "crew" && viewer.kind !== "staff") redirect("/app");
  return (
    <div className="px-4 pb-8 pt-6">
      <ScreenTitle title="Jobs" />
      <ProjectsView />
    </div>
  );
}
