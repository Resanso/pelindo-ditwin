import { CatmullRomCurve3, Vector3, Group, Box3, Clock } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import setupLighting from "../components/Lighting"; // per requirement
// Note: ensure ../components/Lighting exports a function `setupLighting(scene)`

// Scene object with init/update/cleanup
export default function TruckSceneModule() {
  // internal state
  let scene = null;
  let camera = null;
  let renderer = null;

  let curve = null;
  let truckGltf = null;
  let truckInstance = null;
  let containerGltf = null;
  let containerInstances = [];
  let trucks = []; // multiple truck instances for bottleneck scenario
  let t = 0; // normalized progress [0,1]
  let speed = 0.02; // speed factor (t per second)
  let moving = true;
  // Global restart state (module-scope so startSequence/update can access)
  let isScenarioFinished = false;
  let finishTimer = 0;

  const group = new Group(); // container for scenario objects, simplifies cleanup
  // Road scaling: change this single value to scale road size uniformly
  const ROAD_SCALE = 40; // 1.0 = base size, 1.5 = 50% larger
  const BASE_ROAD_SCALE_X = 3; // base X scale applied to loaded road model
  const BASE_ROAD_SCALE_Z = 1.5; // base Z scale applied to loaded road model
  const BASE_ROAD_LENGTH = 60; // base length for fallback plane
  const BASE_ROAD_WIDTH = 8; // base width for fallback plane

  // Truck scale: change this to scale the truck model uniformly
  const TRUCK_SCALE = 1.5; // 1.0 = original size, 0.5 = half, 2.0 = double
  // Container model scale
  const CONTAINER_SCALE = 1.0;

  // Configurable transforms: change these consts to adjust positions/rotations
  const CONFIG = {
    FLOOR: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    },
    ROAD: {
      // road position above floor to avoid z-fighting
      position: { x: 0, y: 0.3, z: 0 },
      rotation: { x: 0, y: 41.5, z: 0 },
      // keep base scale constants but expose multiplier here for convenience
      baseScaleX: BASE_ROAD_SCALE_X,
      baseScaleZ: BASE_ROAD_SCALE_Z,
      multiplier: ROAD_SCALE,
      // how many road copies to create and their spacing (world units)
      copies: 3,
      // spacing applied per copy when positions array not provided
      spacing: { x: 66, y: 0, z: 0 },
      // optional explicit positions: array of {x,y,z} (overrides spacing when provided)
      positions: null,
    },
    TRUCK: {
      // normalized position along the path [0..1]
      startT: 0,
      // small positional offset applied after sampling the curve
      positionOffset: { x: -70, y: 1.5, z: -13 },
      // initial rotation offset (Euler radians)
      rotationOffset: { x: 0, y: -90, z: 0 },
      // speed in units/second (movement uses delta seconds)
      speed: 40.0,
      // bottleneck / queue scenario settings
      count: 5,
      gap: 18,
      queuePoint: 30,
      startPoint: -70,
      zPos: -13,
      yPos: 1.5,
      waitTime: 3000,
      startDelay: 2500,
      // synchronized restart settings
      endPoint: 110,
      globalRestartDelay: 3000,
    },
  };

  // wire speed from config so it's easy to change
  speed = CONFIG.TRUCK.speed;

  // helper: convert degrees to radians when values look like degrees
  function _maybeRad(v) {
    if (v === undefined || v === null) return 0;
    // if supplied number is larger than 2π, assume degrees and convert
    if (Math.abs(v) > 2 * Math.PI) return (v * Math.PI) / 180;
    return v;
  }

  function _applyRotationFromConfig(obj, rot) {
    if (!obj || !rot) return;
    // apply rotations additively so previous rotations (like rotateX applied earlier)
    // are preserved. Accepts degrees or radians via _maybeRad()
    const rx = _maybeRad(rot.x || 0);
    const ry = _maybeRad(rot.y || 0);
    const rz = _maybeRad(rot.z || 0);
    if (rx) obj.rotateX(rx);
    if (ry) obj.rotateY(ry);
    if (rz) obj.rotateZ(rz);
  }

  async function init(context = {}) {
    scene = context.scene;
    camera = context.camera;
    renderer = context.renderer;

    // attach group to scene
    scene.add(group);

    // lighting
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
          if (n.isMesh) {
            n.receiveShadow = true;
          }
        });
        // ensure floor is placed using CONFIG
        floorInstance.position.set(
          CONFIG.FLOOR.position.x,
          CONFIG.FLOOR.position.y,
          CONFIG.FLOOR.position.z
        );
        // apply rotation if configured (accepts degrees or radians)
        _applyRotationFromConfig(floorInstance, CONFIG.FLOOR.rotation);
        group.add(floorInstance);
      }
    } catch (e) {
      // fallback: simple plane
      try {
        const { Mesh, PlaneGeometry, MeshStandardMaterial } = await import(
          "three"
        );
        const mat = new MeshStandardMaterial({ color: 0x888888 });
        const plane = new Mesh(new PlaneGeometry(200, 200), mat);
        plane.rotateX(-Math.PI / 2);
        plane.receiveShadow = true;
        plane.position.set(
          CONFIG.FLOOR.position.x,
          CONFIG.FLOOR.position.y,
          CONFIG.FLOOR.position.z
        );
        // apply rotation config (y/z rotation will be applied after the X rotation)
        _applyRotationFromConfig(plane, CONFIG.FLOOR.rotation);
        floorInstance = plane;
        group.add(plane);
      } catch (err) {
        // ignore
      }
    }

    // load road model above the floor (road.glb)
    try {
      const roadGltf = await new Promise((resolve, reject) => {
        const l2 = new GLTFLoader();
        l2.load("/3d-model/road.glb", resolve, undefined, (err) => {
          l2.load("/models/road.glb", resolve, undefined, reject);
        });
      });
      if (roadGltf && roadGltf.scene) {
        // Prepare a base instance to measure and then clone for copies
        const roadBase = roadGltf.scene.clone(true);
        roadBase.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
          }
        });

        // Compute a uniform scale to preserve proportions
        let uniformScale = null;
        try {
          const bbox = new Box3().setFromObject(roadBase);
          const size = bbox.getSize(new Vector3());
          const desiredX = CONFIG.ROAD.baseScaleX * CONFIG.ROAD.multiplier;
          const desiredZ = CONFIG.ROAD.baseScaleZ * CONFIG.ROAD.multiplier;
          if (size.x > 0 && size.z > 0) {
            const scaleX = desiredX / size.x;
            const scaleZ = desiredZ / size.z;
            uniformScale = Math.min(scaleX, scaleZ);
          }
        } catch (err) {
          // ignore and fallback below
        }

        // number of copies and spacing
        const copies = Math.max(1, Math.floor(CONFIG.ROAD.copies || 1));
        const spacing = CONFIG.ROAD.spacing || { x: 0, y: 0, z: 0 };
        const explicit = Array.isArray(CONFIG.ROAD.positions)
          ? CONFIG.ROAD.positions
          : null;

        // center offset so copies are centered around CONFIG.ROAD.position
        const center = (copies - 1) / 2;

        for (let i = 0; i < copies; i++) {
          const inst = roadGltf.scene.clone(true);
          // apply scale
          if (uniformScale) {
            inst.scale.set(uniformScale, uniformScale, uniformScale);
          } else {
            inst.scale.set(
              CONFIG.ROAD.baseScaleX * CONFIG.ROAD.multiplier,
              1,
              CONFIG.ROAD.baseScaleZ * CONFIG.ROAD.multiplier
            );
          }

          // compute position: either explicit list or spacing from base position
          let posX = CONFIG.ROAD.position.x;
          let posY = CONFIG.ROAD.position.y;
          let posZ = CONFIG.ROAD.position.z;
          if (explicit && explicit[i]) {
            posX = explicit[i].x ?? posX;
            posY = explicit[i].y ?? posY;
            posZ = explicit[i].z ?? posZ;
          } else {
            posX = CONFIG.ROAD.position.x + (i - center) * (spacing.x || 0);
            posY = CONFIG.ROAD.position.y + (i - center) * (spacing.y || 0);
            posZ = CONFIG.ROAD.position.z + (i - center) * (spacing.z || 0);
          }

          inst.position.set(posX, posY, posZ);
          _applyRotationFromConfig(inst, CONFIG.ROAD.rotation);
          group.add(inst);
        }
      }
    } catch (e) {
      // fallback: create a simple road-like plane strip
      try {
        const { Mesh, PlaneGeometry, MeshStandardMaterial } = await import(
          "three"
        );
        const mat = new MeshStandardMaterial({ color: 0x333333 });
        // fallback road: scale base plane by ROAD_SCALE
        const road = new Mesh(
          new PlaneGeometry(
            BASE_ROAD_LENGTH * ROAD_SCALE,
            BASE_ROAD_WIDTH * ROAD_SCALE
          ),
          mat
        );
        road.rotateX(-Math.PI / 2);
        road.position.set(
          CONFIG.ROAD.position.x,
          CONFIG.ROAD.position.y,
          CONFIG.ROAD.position.z
        );
        // apply configured rotation (keeps the X rotation applied above)
        _applyRotationFromConfig(road, CONFIG.ROAD.rotation);
        road.receiveShadow = true;
        road.castShadow = true;
        group.add(road);
      } catch (err) {
        // ignore
      }
    }

    // 1) load routes.json (assumes endpoints served at /data/....)
    let pointsData = [];
    try {
      const res = await fetch("/data/truck_scenario/routes.json");
      const json = await res.json();
      // Expect structure: { routes: [ { id: 'route-1', points: [{x,y,z},...] } ] }
      if (json && Array.isArray(json.routes) && json.routes.length > 0) {
        // use the first route
        const pts = json.routes[0].points || [];
        pointsData = pts.map(
          (p) => new Vector3(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z)
        );
      }
    } catch (e) {
      // fallback sample path
      pointsData = [
        new Vector3(-10, 0, 0),
        new Vector3(-5, 0, 0),
        new Vector3(0, 0, 0),
        new Vector3(5, 0, 0),
        new Vector3(10, 0, 0),
      ];
    }

    // Build curve
    curve = new CatmullRomCurve3(pointsData, false, "catmullrom", 0.5);

    // 2) load truck model (and spawn multiple trucks for bottleneck scenario)
    const loader = new GLTFLoader();
    try {
      const gltf = await new Promise((resolve, reject) => {
        // try public 3d-model path first
        loader.load("/3d-model/truck.glb", resolve, undefined, (err) => {
          // fallback to previous path if the first 404s
          loader.load("/models/truck.glb", resolve, undefined, reject);
        });
      });
      truckGltf = gltf;

      // Spawn multiple truck instances using a simple state-machine per truck
      const baseModel = gltf.scene;
      const truckCount = CONFIG.TRUCK.count || 1;
      for (let i = 0; i < truckCount; i++) {
        const inst = baseModel.clone(true);
        // apply uniform truck scale
        try {
          inst.scale.set(TRUCK_SCALE, TRUCK_SCALE, TRUCK_SCALE);
        } catch (err) {}
        inst.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
          }
        });

        // initial linear placement at startPoint
        inst.position.set(
          CONFIG.TRUCK.startPoint || CONFIG.TRUCK.positionOffset.x || -70,
          CONFIG.TRUCK.yPos || CONFIG.TRUCK.positionOffset.y || 1.5,
          CONFIG.TRUCK.zPos || CONFIG.TRUCK.positionOffset.z || -13
        );
        // apply rotation offset (accepts degrees)
        _applyRotationFromConfig(inst, CONFIG.TRUCK.rotationOffset || {});
        group.add(inst);

        // create truck state object
        const truckObj = {
          mesh: inst,
          index: i,
          state: "IDLE", // IDLE | MOVING_TO_QUEUE | WAITING | MOVING_TO_EXIT
          stopTarget:
            CONFIG.ROAD &&
            CONFIG.ROAD.position &&
            CONFIG.ROAD.position.x !== undefined
              ? CONFIG.ROAD.position.x + CONFIG.TRUCK.queuePoint ||
                CONFIG.TRUCK.queuePoint
              : CONFIG.TRUCK.queuePoint || 110,
          waitTimer: 0,
          startDelay: (CONFIG.TRUCK.startDelay || 2500) * i,
        };

        // compute unique stop target (queue head minus index*gap)
        truckObj.stopTarget =
          (CONFIG.TRUCK.queuePoint || 110) - i * (CONFIG.TRUCK.gap || 12);

        // don't start yet; startSequence() will schedule staggered starts
        truckObj._startTimer = null;
        trucks.push(truckObj);
      }
    } catch (e) {
      // If GLTF loading fails, create placeholders for each truck
      const { Mesh, BoxGeometry, MeshBasicMaterial } = await import("three");
      const truckCount = CONFIG.TRUCK.count || 1;
      for (let i = 0; i < truckCount; i++) {
        const placeholder = new Mesh(
          new BoxGeometry(3, 1.5, 1.5),
          new MeshBasicMaterial({ color: 0xff6f00 })
        );
        // apply TRUCK_SCALE to placeholder so size matches configured truck scale
        try {
          placeholder.scale.set(TRUCK_SCALE, TRUCK_SCALE, TRUCK_SCALE);
        } catch (err) {}
        placeholder.position.set(
          CONFIG.TRUCK.startPoint || CONFIG.TRUCK.positionOffset.x || -70,
          CONFIG.TRUCK.yPos || CONFIG.TRUCK.positionOffset.y || 1.5,
          CONFIG.TRUCK.zPos || CONFIG.TRUCK.positionOffset.z || -13
        );
        group.add(placeholder);

        const truckObj = {
          mesh: placeholder,
          index: i,
          state: "IDLE",
          stopTarget:
            (CONFIG.TRUCK.queuePoint || 110) - i * (CONFIG.TRUCK.gap || 12),
          waitTimer: 0,
          startDelay: (CONFIG.TRUCK.startDelay || 2500) * i,
        };

        // don't start yet; startSequence() will schedule staggered starts
        truckObj._startTimer = null;
        trucks.push(truckObj);
      }
    }

    // optionally adjust camera or other UI elements here

    // --- Load lot-container model (optional) ---
    try {
      const containerLoader = new GLTFLoader();
      const cGltf = await new Promise((resolve, reject) => {
        containerLoader.load(
          "/3d-model/lot-container.glb",
          resolve,
          undefined,
          (err) => {
            containerLoader.load(
              "/models/lot-container.glb",
              resolve,
              undefined,
              reject
            );
          }
        );
      });
      containerGltf = cGltf;
      if (containerGltf && containerGltf.scene) {
        const cInst = containerGltf.scene.clone(true);
        cInst.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
          }
        });
        // apply default container scale and place near the road/queue
        try {
          cInst.scale.set(CONTAINER_SCALE, CONTAINER_SCALE, CONTAINER_SCALE);
        } catch (err) {}
        // position: place slightly to the side of the truck lane
        const px = (CONFIG.TRUCK.queuePoint || 110) + 10;
        const py = CONFIG.FLOOR.position.y || 0;
        const pz = (CONFIG.TRUCK.zPos || CONFIG.TRUCK.positionOffset.z) - 30;
        cInst.position.set(px, py, pz);
        group.add(cInst);
        containerInstances.push(cInst);
      }
    } catch (err) {
      // ignore if missing; container is optional
    }

    // --- Global restart state ---
    let isScenarioFinished = false;
    let finishTimer = 0;

    // Start the initial staggered sequence
    startSequence();
  }

  // startSequence: reset trucks and schedule staggered starts
  function startSequence() {
    // reset each truck to initial state and clear previous timers
    trucks.forEach((tr, idx) => {
      if (tr._startTimer) {
        try {
          clearTimeout(tr._startTimer);
        } catch (e) {}
        tr._startTimer = null;
      }
      if (tr.mesh) {
        tr.mesh.position.x =
          CONFIG.TRUCK.startPoint ?? CONFIG.TRUCK.positionOffset.x ?? -70;
        tr.mesh.position.y =
          CONFIG.TRUCK.yPos ?? CONFIG.TRUCK.positionOffset.y ?? 1.5;
        tr.mesh.position.z =
          CONFIG.TRUCK.zPos ?? CONFIG.TRUCK.positionOffset.z ?? -13;
        tr.mesh.visible = true;
      }
      tr.state = "IDLE";
      tr.waitTimer = 0;
      tr.stopTarget =
        (CONFIG.TRUCK.queuePoint || 110) - tr.index * (CONFIG.TRUCK.gap || 12);
      // schedule staggered start (milliseconds)
      tr._startTimer = setTimeout(() => {
        tr.state = "MOVING_TO_QUEUE";
        tr._startTimer = null;
      }, (CONFIG.TRUCK.startDelay || 2500) * idx);
    });

    const startDelay = CONFIG.TRUCK.startDelay || 2500;
    trucks.forEach((tr, idx) => {
      // clear any previous timer handle
      if (tr._startTimer) clearTimeout(tr._startTimer);
      tr._startTimer = setTimeout(() => {
        tr.state = "MOVING_TO_QUEUE";
        if (tr.mesh) tr.mesh.visible = true;
      }, (CONFIG.TRUCK.startDelay || 200) * idx);
    });
  }
  // local clock fallback in case caller doesn't pass a delta
  const _localClock = new Clock();

  function update(delta) {
    // If caller didn't provide delta (or provided 0), use local Clock
    if (!delta || delta <= 0) delta = _localClock.getDelta();
    // If we spawned multiple trucks, update them using simple state machine
    if (trucks && trucks.length > 0) {
      const now = Date.now();
      const dt = delta;
      for (const tr of trucks) {
        const mesh = tr.mesh;
        if (!mesh) continue;

        if (tr.state === "IDLE") continue;

        if (tr.state === "MOVING_TO_QUEUE") {
          // move forward along +X until reach stopTarget
          const speedPerSec = CONFIG.TRUCK.speed || 0.5;
          mesh.position.x += speedPerSec * dt;
          if (mesh.position.x >= tr.stopTarget) {
            mesh.position.x = tr.stopTarget;
            tr.state = "WAITING";
            tr.waitTimer = now;
          }
        } else if (tr.state === "WAITING") {
          const myReleaseTime =
            (CONFIG.TRUCK.waitTime || 3000) + tr.index * 1000;
          if (now - tr.waitTimer > myReleaseTime) {
            tr.state = "MOVING_TO_EXIT";
          }
        } else if (tr.state === "MOVING_TO_EXIT") {
          const speedPerSec = CONFIG.TRUCK.speed || 0.5;
          mesh.position.x += speedPerSec * dt;
          // if reached endPoint, mark as FINISHED and hide
          if (
            mesh.position.x >
            (CONFIG.TRUCK.endPoint || (CONFIG.TRUCK.queuePoint || 110) + 50)
          ) {
            tr.state = "FINISHED";
            if (mesh) mesh.visible = false;
          }
        }

        // keep y/z consistent with config
        mesh.position.y =
          CONFIG.TRUCK.yPos || CONFIG.TRUCK.positionOffset.y || mesh.position.y;
        mesh.position.z =
          CONFIG.TRUCK.zPos || CONFIG.TRUCK.positionOffset.z || mesh.position.z;
      }
      // detect if all trucks finished; then schedule a global restart after cooldown
      const allFinished =
        trucks.length > 0 && trucks.every((tt) => tt.state === "FINISHED");
      if (allFinished) {
        if (!isScenarioFinished) {
          isScenarioFinished = true;
          finishTimer = Date.now();
        } else {
          const cooldown = CONFIG.TRUCK.globalRestartDelay || 3000;
          if (Date.now() - finishTimer > cooldown) {
            // restart the whole wave
            startSequence();
          }
        }
      } else {
        // if not all finished, ensure flags are cleared
        isScenarioFinished = false;
        finishTimer = 0;
      }

      return;
    }
  }

  async function cleanup() {
    // remove group from scene and dispose resources
    if (group && scene) {
      scene.remove(group);
    }

    // dispose floor if present (we traverse group later)

    // dispose cloned geometries/materials if we created placeholders
    // For GLTF, avoid modifying original materials; if you cloned geometries when creating meshes,
    // dispose them here. We attempt to traverse and dispose any geometries/materials we own.
    group.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) {
          try {
            obj.geometry.dispose();
          } catch (e) {}
        }
        if (obj.material) {
          // if material is an array, dispose each
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

    // clear references
    while (group.children.length) group.remove(group.children[0]);
    // clear any pending timers for trucks
    if (trucks && trucks.length) {
      for (const tr of trucks) {
        if (tr && tr._startTimer) {
          try {
            clearTimeout(tr._startTimer);
          } catch (e) {}
          tr._startTimer = null;
        }
      }
    }
    // remove any container instances we added
    if (containerInstances && containerInstances.length) {
      for (const ci of containerInstances) {
        try {
          if (ci.parent) ci.parent.remove(ci);
        } catch (e) {}
      }
    }
    containerInstances = [];
    containerGltf = null;
    truckGltf = null;
    truckInstance = null;
    trucks = [];
    curve = null;
  }

  return {
    init,
    update,
    cleanup,
  };
}
