import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

export function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        // mark meshes loaded from GLTF so callers can treat them specially
        if (gltf && gltf.scene) {
          gltf.scene.traverse((node) => {
            if (node.isMesh) {
              node.userData.source = "gltf";
              // do not modify node.material here to preserve original colors
            }
          });
        }
        resolve(gltf);
      },
      undefined,
      reject
    );
  });
}
