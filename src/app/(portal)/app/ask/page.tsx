import { redirect } from "next/navigation";

import AskScreen from "@/components/bot/AskScreen";
import { getViewer } from "@/lib/crew/auth";

export default async function BotAppAsk() {
  // Crew do not talk to the bot: it works from what they log.
  if ((await getViewer()).kind !== "staff") redirect("/app");
  return <AskScreen />;
}
