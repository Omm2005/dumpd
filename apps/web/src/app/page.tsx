import { HomeFlow } from "@/components/home-flow";
import { HomeSessionDock } from "@/components/home-session-dock";

export default function Home() {
  return (
    <main className="relative min-h-svh overflow-clip bg-background">
      <HomeFlow />
      <HomeSessionDock />
    </main>
  );
}
