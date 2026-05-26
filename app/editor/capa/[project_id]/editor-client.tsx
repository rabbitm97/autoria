"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { EditorTopbar } from "./components/editor-topbar";
import { EditorSidebar } from "./components/editor-sidebar";
import { useEditorStore } from "./lib/editor-store";
import type { ProjectData } from "./types";

// Dynamic import with ssr:false prevents Konva (which needs window/canvas) from running on the server
const EditorCanvas = dynamic(
  () => import("./components/editor-canvas").then((m) => ({ default: m.EditorCanvas })),
  { ssr: false },
);

export function EditorClient({ projectData }: { projectData: ProjectData }) {
  // Synchronously initialize store from project data before first render of any subscriber
  const initialized = useRef(false);
  if (!initialized.current) {
    useEditorStore.setState({ format: projectData.format, pages: projectData.pages });
    initialized.current = true;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <EditorTopbar projectData={projectData} />
      <div className="flex min-h-0 flex-1">
        <EditorSidebar />
        <div className="relative min-w-0 flex-1">
          <EditorCanvas format={projectData.format} pages={projectData.pages} />
        </div>
      </div>
    </div>
  );
}
