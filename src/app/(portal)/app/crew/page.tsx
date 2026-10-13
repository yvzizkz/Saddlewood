import { redirect } from "next/navigation";

import CrewAdminScreen, { LeadCrewScreen } from "@/components/crew/admin/CrewAdminScreen";
import { getViewer } from "@/lib/crew/auth";
import { hasPerm } from "@/lib/crew/types";

// The Crew screens. Owners see everything; a crew seat whose group has the
// Crew tab switched on sees what the group allows, inside their own app.
// Anyone else goes home.
export default async function BotAppCrew() {
  const viewer = await getViewer();
  if (viewer.kind === "staff") return <CrewAdminScreen />;
  if (viewer.kind === "crew" && hasPerm(viewer.person, "crew.view")) return <LeadCrewScreen />;
  redirect("/app");
}
