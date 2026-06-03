"use client";

import { useCallback, useMemo } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
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

import { Button } from "@dumpd/ui/components/button";

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
          className="!overflow-hidden !rounded-[18px] !bg-card"
          nodeColor={"var(--foreground)"}
          maskColor="color-mix(in oklab, var(--background) 72%, transparent)"
          style={minimapStyle}
        />
        <Controls
          showInteractive
          className="!overflow-hidden !rounded-md !border-border !bg-card [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground"
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2}
          color="var(--border)"
        />
      </ReactFlow>
      {nodes.length === 0 && !isPending ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-4">
            <p className="text-center text-base font-medium text-muted-foreground">
              {isSignedIn ? "There are no dumpd yet." : "Sign in with google to play around"}
            </p>
            {isSignedIn ? (
              <Button
                type="button"
                size="sm"
                className="cursor-pointer"
                onClick={() => console.log("Add Dump")}
              >
                <PlusIcon data-icon="inline-start" />
                Add Dump
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
