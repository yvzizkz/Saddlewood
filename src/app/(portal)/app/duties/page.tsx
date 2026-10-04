import { redirect } from "next/navigation";

import DutiesScreen from "@/components/bot/DutiesScreen";
import { getViewer } from "@/lib/crew/auth";

export default async function BotAppDuties() {
  if ((await getViewer()).kind !== "staff") redirect("/app");
  return <DutiesScreen />;
}
