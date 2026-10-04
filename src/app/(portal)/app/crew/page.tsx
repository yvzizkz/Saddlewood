import { redirect } from "next/navigation";

import CrewAdminScreen from "@/components/crew/admin/CrewAdminScreen";
import { getViewer } from "@/lib/crew/auth";

// The owners' view of the crew. A crew member who lands here goes home.
export default async function BotAppCrew() {
  if ((await getViewer()).kind !== "staff") redirect("/app");
  return <CrewAdminScreen />;
}
