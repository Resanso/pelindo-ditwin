3D Setup for `apps/pelindo`

This folder contains a minimal scaffold to run Three.js scenarios used by the Pelindo demo.

Files added:

- `three/SceneManager.js` - basic scene renderer and scenario mounting API
- `three/components/Camera.js` - perspective camera factory
- `three/components/Lights.js` - simple lights factory
- `three/utils/AssetLoader.js` - GLTF loader helper (uses three/examples)
- `three/scenarios/TruckScene.js` - placeholder truck scenario
- `three/scenarios/ContainerScene.js` - placeholder container stacking scenario
- `data/*` - sample JSON files used by scenarios

How to use (in a client component):

1. Ensure `three` is installed in `apps/pelindo` (or workspace):

   npm install three

2. In a client-side component (React/Next), create a container element and call:

```js
import { init, mountScenario, dispose } from "../three/SceneManager.js";
import TruckScene from "../three/scenarios/TruckScene.js";

// on mount
const { scene, camera, renderer } = init(containerElement);
mountScenario(TruckScene);

// on unmount
dispose();
```

Notes:

- This scaffold uses ES modules and imports `three/examples/jsm` for loaders; in Next.js you should ensure client-only usage (e.g., a component with `'use client'`).
- The scenes are placeholders to get started; replace them with real geometry / GLTF loads from `public/3d-model`.

Important: imported GLTF/GLB materials are preserved by the loader and scaffold — the code does not mutate model materials. The `AssetLoader.loadGLTF` marks meshes with `userData.source = 'gltf'` so scenarios can treat imported models differently (e.g., avoid applying color overrides). Selection uses a separate outline mesh and does not change the model's original material.
