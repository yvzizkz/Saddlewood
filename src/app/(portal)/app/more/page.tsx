import MoreScreen from "@/components/bot/MoreScreen";
import CrewMoreScreen from "@/components/crew/CrewMoreScreen";
import { getViewer } from "@/lib/crew/auth";

export default async function BotAppMore() {
  const viewer = await getViewer();
  return viewer.kind === "crew" ? <CrewMoreScreen /> : <MoreScreen />;
}
