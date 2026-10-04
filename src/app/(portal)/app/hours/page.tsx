import { redirect } from "next/navigation";

import HoursScreen from "@/components/crew/HoursScreen";
import { getViewer } from "@/lib/crew/auth";

export default async function CrewHours() {
  const viewer = await getViewer();
  if (viewer.kind === "staff") redirect("/app/crew");
  if (viewer.kind !== "crew") redirect("/app");
  return <HoursScreen />;
}
