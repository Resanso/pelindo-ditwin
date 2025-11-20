import { HemisphereLight, DirectionalLight, AmbientLight } from "three";

export default function setupLighting(scene) {
  if (!scene) return null;

  const hemi = new HemisphereLight(0xffffff, 0x444444, 0.6);
  hemi.position.set(0, 50, 0);

  const dir = new DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 7.5);
  dir.castShadow = true;

  const amb = new AmbientLight(0xffffff, 0.25);

  scene.add(hemi, dir, amb);

  return { hemi, dir, amb };
}
