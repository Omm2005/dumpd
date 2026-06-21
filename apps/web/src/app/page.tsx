import { HomeFlow } from "@/components/home-flow";
import { HomeSessionDock } from "@/components/home-session-dock";
import { EnchantedAmbience } from "@/components/enchanted-ambience";

export default function Home() {
  return (
    <main className="enchanted-app relative min-h-svh overflow-clip bg-background">
      <EnchantedAmbience />
      <div className="relative z-10">
        <HomeFlow />
        <HomeSessionDock />
      </div>
    </main>
  );
}
