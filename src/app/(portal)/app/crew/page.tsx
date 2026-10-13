import { redirect } from "next/navigation";

import CrewAdminScreen, { LeadCrewScreen } from "@/components/crew/admin/CrewAdminScreen";
import { getViewer } from "@/lib/crew/auth";

// The Crew screens. Owners see everything; the lead (field supervisor, a crew
// seat with role 'lead') sees the field inside their own app. Anyone else
// goes home.
export default async function BotAppCrew() {
  const viewer = await getViewer();
  if (viewer.kind === "staff") return <CrewAdminScreen />;
  if (viewer.kind === "crew" && viewer.person.role === "lead") return <LeadCrewScreen />;
  redirect("/app");
}
