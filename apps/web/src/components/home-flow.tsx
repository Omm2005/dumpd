"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import { AddDumpMenu } from "@/components/add-dump-menu";
import { authClient } from "@/lib/auth-client";

import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export function HomeFlow() {
  const { data: session, isPending } = authClient.useSession();
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const isSignedIn = Boolean(session);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            animated: true,
          },
          currentEdges,
        ),
      );
    },
    [setEdges],
  );

  const minimapStyle = useMemo(
    () => ({
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "18px",
      overflow: "hidden",
    }),
    [],
  );

  return (
    <div className="relative h-svh w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        minZoom={0.6}
        maxZoom={1.4}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: {
            stroke: "var(--muted-foreground)",
            strokeWidth: 1.5,
          },
        }}
        className="bg-background"
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          pannable
          zoomable
          className="hidden !overflow-hidden !rounded-[18px] !bg-card md:block"
          nodeColor={"var(--foreground)"}
          maskColor="color-mix(in oklab, var(--background) 72%, transparent)"
          style={minimapStyle}
        />
        <Controls
          showInteractive
          className="!left-3 !top-[calc(env(safe-area-inset-top)+0.75rem)] !overflow-hidden !rounded-2xl !border-border/80 !bg-card/95 !shadow-sm md:!left-auto md:!top-auto [&>button]:!h-9 [&>button]:!w-9 [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground md:[&>button]:!h-8 md:[&>button]:!w-8"
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={2}
          color="var(--border)"
        />
      </ReactFlow>
      {nodes.length === 0 && !isPending ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 pb-32 pt-24 md:px-8 md:pb-24 md:pt-20">
          <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] border border-border/70 bg-card/80 px-6 py-6 text-center shadow-sm backdrop-blur-xl">
            <p className="text-balance text-sm font-medium text-muted-foreground md:text-base">
              {isSignedIn ? "There are no dumpd yet." : "Sign in with google to play around"}
            </p>
            {isSignedIn ? (
              <AddDumpMenu onSelect={() => console.log("Add Dump")} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
