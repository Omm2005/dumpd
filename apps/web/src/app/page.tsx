import { HomeFlow } from "@/components/home-flow";
import { HomeSessionDock } from "@/components/home-session-dock";

function GrainOverlay() {
  return (
    <>
      <svg
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <defs>
          <filter id="canvas-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.72"
              numOctaves="4"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.032]"
        style={{ filter: "url(#canvas-grain)", background: "#888" }}
      />
    </>
  );
}

export default function Home() {
  return (
    <main className="relative min-h-svh overflow-clip bg-background">
      <GrainOverlay />
      <HomeFlow />
      <HomeSessionDock />
    </main>
  );
}
