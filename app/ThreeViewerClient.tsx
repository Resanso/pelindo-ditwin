"use client";

import { useEffect, useRef, useState } from "react";
import SceneManager from "../three/SceneManager";
import TruckScene from "../three/scenarios/TruckScene";
import ContainerScene from "../three/scenarios/ContainerScene";

export default function ThreeViewerClient() {
  const ref = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<any | null>(null);
  const [active, setActive] = useState<"truck" | "container">("truck");

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    const manager = new SceneManager(container);
    manager.init();
    managerRef.current = manager;
    // switch to TruckScene initially
    manager
      .switchScenario(TruckScene)
      .then(() => setActive("truck"))
      .catch((e) => console.error(e));

    return () => {
      try {
        manager.dispose();
      } catch (e) {
        // ignore
      }
      managerRef.current = null;
    };
  }, []);

  const switchToTruck = () => {
    if (!managerRef.current) return;
    managerRef.current
      .switchScenario(TruckScene)
      .then(() => setActive("truck"))
      .catch((e: any) => console.error(e));
  };

  const switchToContainer = () => {
    if (!managerRef.current) return;
    managerRef.current
      .switchScenario(ContainerScene)
      .then(() => setActive("container"))
      .catch((e: any) => console.error(e));
  };

  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
        <button
          onClick={switchToTruck}
          style={{
            padding: "6px 12px",
            background: active === "truck" ? "#111" : "#eee",
            color: active === "truck" ? "#fff" : "#000",
            border: "none",
            borderRadius: 6,
          }}
        >
          Truck Scene
        </button>
        <button
          onClick={switchToContainer}
          style={{
            padding: "6px 12px",
            background: active === "container" ? "#111" : "#eee",
            color: active === "container" ? "#fff" : "#000",
            border: "none",
            borderRadius: 6,
          }}
        >
          Container Scene
        </button>
      </div>
      <div ref={ref} style={{ width: "100%", height: "520px" }} />
    </div>
  );
}
