import { PerspectiveCamera } from "three";

export default function Camera() {
  const camera = new PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 10, 20);
  return camera;
}
