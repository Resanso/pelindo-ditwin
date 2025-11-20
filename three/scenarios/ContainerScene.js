import {
  Group,
  Object3D,
  Color,
  InstancedMesh,
  BoxGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  DynamicDrawUsage,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import setupLighting from "../components/Lighting";

export default function ContainerSceneModule() {
  let scene = null;
  let group = new Group();

  // Main container mesh (Real)
  let instancedMesh = null;

  // Recommendation ghost mesh (transparent)
  let ghostInstancedMesh = null;
  let isRecVisible = false;

  // --- KONFIGURASI YARD ---
  const CONFIG = {
    GRID: {
      rows: 20,
      cols: 15,
      maxStack: 5,
      gapX: 5,
      gapY: 0.8,
      gapZ: 4.0,
    },
    DIMENSIONS: {
      width: 2.5,
      height: 2.6,
      length: 6.1,
    },
    SCALE: 0.05,
    COLORS: ["#D32F2F", "#1976D2", "#388E3C", "#FBC02D", "#5D4037", "#455A64"],
  };

  // Global grid tracker
  let gridMatrix = [];

  async function init(context = {}) {
    scene = context.scene;
    scene.add(group);

    if (typeof setupLighting === "function") setupLighting(scene);

    // 1. Setup Floor
    try {
      const { Mesh, PlaneGeometry, MeshStandardMaterial } = await import(
        "three"
      );
      const floor = new Mesh(
        new PlaneGeometry(300, 300),
        new MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      group.add(floor);
    } catch (e) {
      // ignore
    }

    // 2. Load Model
    const loader = new GLTFLoader();
    let geometry = null;
    let material = null;

    try {
      let gltf = null;
      try {
        gltf = await loader.loadAsync("/3d-model/container.glb");
      } catch (err) {
        gltf = await loader.loadAsync("/models/container.glb");
      }
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          geometry = child.geometry;
          material = child.material;
          if (material && material.map) material.map.encoding = 3001;
        }
      });
    } catch (e) {
      console.warn("Fallback to BoxGeometry");
      geometry = new BoxGeometry(
        CONFIG.DIMENSIONS.width,
        CONFIG.DIMENSIONS.height,
        CONFIG.DIMENSIONS.length
      );
      material = new MeshStandardMaterial({ color: 0xffffff });
    }

    // 3. Generate Data & Grid Matrix
    const instanceData = [];
    const rows = CONFIG.GRID.rows;
    const cols = CONFIG.GRID.cols;

    // Reset matrix
    gridMatrix = Array(rows)
      .fill(0)
      .map(() => Array(cols).fill(0));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Random existing containers
        if (Math.random() > 0.2) {
          const stackHeight =
            Math.floor(Math.random() * CONFIG.GRID.maxStack) + 1;
          gridMatrix[r][c] = stackHeight;

          for (let s = 0; s < stackHeight; s++) {
            instanceData.push({
              row: r,
              col: c,
              stack: s,
              color:
                CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)],
            });
          }
        } else {
          gridMatrix[r][c] = 0;
        }
      }
    }

    // 4. Create Real Containers (InstancedMesh)
    if (instanceData.length > 0) {
      instancedMesh = new InstancedMesh(
        geometry,
        material,
        instanceData.length
      );
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
      instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);

      const dummy = new Object3D();
      const colorHelper = new Color();

      instanceData.forEach((data, i) => {
        const { x, y, z } = calculatePosition(data.row, data.col, data.stack);

        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(CONFIG.SCALE, CONFIG.SCALE, CONFIG.SCALE);
        dummy.updateMatrix();

        instancedMesh.setMatrixAt(i, dummy.matrix);
        colorHelper.set(data.color);
        if (instancedMesh.setColorAt) instancedMesh.setColorAt(i, colorHelper);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor)
        instancedMesh.instanceColor.needsUpdate = true;
      group.add(instancedMesh);
    }

    // 5. Generate All Recommendations (Ghost Mesh)
    generateAllRecommendations(geometry);
  }

  // --- Helper Position ---
  function calculatePosition(row, col, stackIndex) {
    const totalWidth =
      CONFIG.GRID.cols * (CONFIG.DIMENSIONS.width + CONFIG.GRID.gapX);
    const totalDepth =
      CONFIG.GRID.rows * (CONFIG.DIMENSIONS.length + CONFIG.GRID.gapZ);

    const x =
      col * (CONFIG.DIMENSIONS.width + CONFIG.GRID.gapX) - totalWidth / 2;
    const z =
      row * (CONFIG.DIMENSIONS.length + CONFIG.GRID.gapZ) - totalDepth / 2;
    const gapY = CONFIG.GRID.gapY || 0;
    const y =
      stackIndex * (CONFIG.DIMENSIONS.height + gapY) +
      CONFIG.DIMENSIONS.height / 2;

    return { x, y, z };
  }

  // --- LOGIC: Generate ALL Valid Spots ---
  function generateAllRecommendations(geometry) {
    const validSpots = [];

    for (let r = 0; r < CONFIG.GRID.rows; r++) {
      for (let c = 0; c < CONFIG.GRID.cols; c++) {
        const currentH = gridMatrix[r][c];

        if (currentH < CONFIG.GRID.maxStack) {
          validSpots.push({ row: r, col: c, stack: currentH });
        }
      }
    }

    if (validSpots.length === 0) return;

    // Setup Material Ghost (translucent neon green)
    const ghostMaterial = new MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: true,
      depthWrite: false,
    });

    ghostInstancedMesh = new InstancedMesh(
      geometry,
      ghostMaterial,
      validSpots.length
    );
    ghostInstancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const dummy = new Object3D();

    validSpots.forEach((spot, i) => {
      const { x, y, z } = calculatePosition(spot.row, spot.col, spot.stack);

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(CONFIG.SCALE, CONFIG.SCALE, CONFIG.SCALE);
      dummy.updateMatrix();

      ghostInstancedMesh.setMatrixAt(i, dummy.matrix);
    });

    ghostInstancedMesh.instanceMatrix.needsUpdate = true;

    ghostInstancedMesh.visible = false;
    group.add(ghostInstancedMesh);
  }

  // --- API: Toggle Visibility ---
  function toggleRecommendations(forceState) {
    if (ghostInstancedMesh) {
      isRecVisible =
        typeof forceState === "boolean" ? forceState : !isRecVisible;
      ghostInstancedMesh.visible = isRecVisible;
      console.log("Recommendation Visibility:", isRecVisible);
    }
    return isRecVisible;
  }

  // --- Animation Loop ---
  function update(delta) {
    if (ghostInstancedMesh && ghostInstancedMesh.visible) {
      const time = Date.now() * 0.003;
      ghostInstancedMesh.material.opacity = 0.25 + Math.sin(time) * 0.15;
    }
  }

  function cleanup() {
    if (group && scene) scene.remove(group);

    // Dispose Real Containers
    if (instancedMesh) {
      try {
        if (instancedMesh.geometry && instancedMesh.geometry.dispose)
          instancedMesh.geometry.dispose();
      } catch (e) {}
      try {
        if (Array.isArray(instancedMesh.material)) {
          instancedMesh.material.forEach((m) => m.dispose && m.dispose());
        } else if (instancedMesh.material && instancedMesh.material.dispose) {
          instancedMesh.material.dispose();
        }
      } catch (e) {}
      try {
        instancedMesh.dispose();
      } catch (e) {}
      instancedMesh = null;
    }

    // Dispose Ghost Containers
    if (ghostInstancedMesh) {
      try {
        if (ghostInstancedMesh.geometry && ghostInstancedMesh.geometry.dispose)
          ghostInstancedMesh.geometry.dispose();
      } catch (e) {}
      try {
        if (ghostInstancedMesh.material && ghostInstancedMesh.material.dispose)
          ghostInstancedMesh.material.dispose();
      } catch (e) {}
      try {
        ghostInstancedMesh.dispose();
      } catch (e) {}
      ghostInstancedMesh = null;
    }

    while (group.children.length) group.remove(group.children[0]);
  }

  return { init, update, cleanup, toggleRecommendations };
}
