import { redirect } from "next/navigation";

import WeekScreen from "@/components/crew/WeekScreen";
import { getViewer } from "@/lib/crew/auth";

export default async function CrewWeek() {
  const viewer = await getViewer();
  if (viewer.kind === "staff") redirect("/app/crew");
  if (viewer.kind !== "crew") redirect("/app");
  return <WeekScreen />;
}
