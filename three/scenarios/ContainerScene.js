import { Group, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import setupLighting from "../components/Lighting"; // per requirement

export default function ContainerSceneModule() {
  let scene = null;
  let camera = null;
  let renderer = null;

  const group = new Group(); // holds all containers for easy cleanup
  let containerGltf = null;

  // parameters / constants
  const SLOT_W = 2.5; // width per column
  const SLOT_L = 6.0; // length per row
  const STACK_H = 2.5; // height per stack unit

  async function init(context = {}) {
    scene = context.scene;
    camera = context.camera;
    renderer = context.renderer;

    scene.add(group);

    if (typeof setupLighting === "function") setupLighting(scene);

    // load floor model (concrete floor) from public 3d-model
    let floorInstance = null;
    try {
      const floorGltf = await new Promise((resolve, reject) => {
        const l = new GLTFLoader();
        l.load("/3d-model/concrete_floor.glb", resolve, undefined, reject);
      });
      if (floorGltf && floorGltf.scene) {
        floorInstance = floorGltf.scene.clone(true);
        floorInstance.traverse((n) => {
          if (n.isMesh) n.receiveShadow = true;
        });
        floorInstance.position.set(0, 0, 0);
        group.add(floorInstance);
      }
    } catch (e) {
      // fallback: plane
      try {
        const { Mesh, PlaneGeometry, MeshStandardMaterial } = await import(
          "three"
        );
        const mat = new MeshStandardMaterial({ color: 0x888888 });
        const plane = new Mesh(new PlaneGeometry(200, 200), mat);
        plane.rotateX(-Math.PI / 2);
        plane.receiveShadow = true;
        plane.position.set(0, 0, 0);
        floorInstance = plane;
        group.add(plane);
      } catch (err) {}
    }

    // load inventory.json
    let inventory = [];
    try {
      const res = await fetch("/data/container_scenario/inventory.json");
      const json = await res.json();
      if (json && Array.isArray(json.containers)) {
        inventory = json.containers;
      }
    } catch (e) {
      // fallback sample
      inventory = [
        { id: "C1", grid: { row: 0, col: 0, stack: 1 }, color: "#FF0000" },
        { id: "C2", grid: { row: 0, col: 1, stack: 2 }, color: "#00FF00" },
      ];
    }

    // load container model
    const loader = new GLTFLoader();
    try {
      containerGltf = await new Promise((resolve, reject) => {
        // try public 3d-model path first
        loader.load("/3d-model/container.glb", resolve, undefined, (err) => {
          loader.load("/models/container.glb", resolve, undefined, reject);
        });
      });
    } catch (e) {
      containerGltf = null;
    }

    // instantiate each inventory item
    for (const item of inventory) {
      const row = (item.grid && item.grid.row) || 0;
      const col = (item.grid && item.grid.col) || 0;
      const stack = (item.grid && item.grid.stack) || 1;
      const color = item.color || null;

      // compute world position for base of the stack
      const baseX = col * SLOT_W;
      const baseZ = row * SLOT_L;

      // for each stacked height, create an instance and position with y offset
      for (let s = 0; s < stack; s++) {
        const y = s * STACK_H + STACK_H / 2; // center of container
        let instance = null;

        if (containerGltf && containerGltf.scene) {
          instance = containerGltf.scene.clone(true);
          // attempt to set color if provided and mesh materials are color-able
          if (color) {
            instance.traverse((n) => {
              if (n.isMesh && n.material) {
                // clone material to avoid mutating shared material
                try {
                  if (Array.isArray(n.material)) {
                    n.material = n.material.map((m) => {
                      const clone = m.clone();
                      if (clone.color) clone.color.set(color);
                      return clone;
                    });
                  } else {
                    const clone = n.material.clone();
                    if (clone.color) clone.color.set(color);
                    n.material = clone;
                  }
                } catch (e) {
                  // if color can't be applied, ignore
                }
              }
            });
          }
        } else {
          // fallback: simple box if model missing
          const { Mesh, BoxGeometry, MeshStandardMaterial } = await import(
            "three"
          );
          const mat = new MeshStandardMaterial({ color: color || 0x1565c0 });
          instance = new Mesh(new BoxGeometry(2.4, 2.4, 5.8), mat);
        }

        instance.position.set(baseX, y, baseZ);
        instance.userData = {
          id: item.id,
          col,
          row,
          stackIndex: s,
        };
        group.add(instance);
      }
    }
  }

  function update(/* delta */) {
    // no animation by default; if desired add subtle bob or hover
  }

  async function cleanup() {
    if (group && scene) {
      scene.remove(group);
    }

    // traverse and dispose geometries & materials we created or cloned
    group.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) {
          try {
            obj.geometry.dispose();
          } catch (e) {}
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              try {
                if (m.map) m.map.dispose();
                m.dispose();
              } catch (e) {}
            });
          } else {
            try {
              if (obj.material.map) obj.material.map.dispose();
              obj.material.dispose();
            } catch (e) {}
          }
        }
      }
    });

    while (group.children.length) group.remove(group.children[0]);

    containerGltf = null;
  }

  return {
    init,
    update,
    cleanup,
  };
}
