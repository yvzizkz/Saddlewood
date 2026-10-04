import HomeScreen from "@/components/bot/HomeScreen";
import TodayScreen from "@/components/crew/TodayScreen";
import { getViewer } from "@/lib/crew/auth";

export default async function BotAppHome() {
  const viewer = await getViewer();
  return viewer.kind === "crew" ? <TodayScreen /> : <HomeScreen />;
}
