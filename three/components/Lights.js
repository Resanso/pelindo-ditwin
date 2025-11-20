import { HemisphereLight, DirectionalLight } from "three";

export default function createLights() {
  const hemi = new HemisphereLight(0xffffff, 0x444444, 0.6);
  const dir = new DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 7.5);
  return { hemi, dir };
}
