import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 2;
  controls.maxDistance = 200;
  controls.maxPolarAngle = Math.PI / 2.1;
  return controls;
}
