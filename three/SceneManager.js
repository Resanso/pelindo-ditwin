import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Clock,
  Raycaster,
  Vector2,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default class SceneManager {
  constructor(container, { antialias = true, alpha = true } = {}) {
    this.container = container;
    this.antialias = antialias;
    this.alpha = alpha;

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new Clock();
    this._rafId = null;

    this.currentScenario = null;
    this.controls = null;
    this._raycaster = null;
    this._pointer = null;
    this._boundOnPointerMove = this._onPointerMove?.bind(this);
    this._boundOnPointerDown = this._onPointerDown?.bind(this);
  }

  init() {
    // Scene
    this.scene = new Scene();

    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 10, 20);

    // Renderer
    this.renderer = new WebGLRenderer({
      antialias: this.antialias,
      alpha: this.alpha,
    });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.container.appendChild(this.renderer.domElement);

    // Controls (OrbitControls) - created client-side
    try {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = 1;
      this.controls.maxDistance = 500;
      this.controls.maxPolarAngle = Math.PI / 2.1;
    } catch (e) {
      this.controls = null;
    }

    // Raycaster + pointer for picking
    this._raycaster = new Raycaster();
    this._pointer = new Vector2();
    this.renderer.domElement.style.touchAction = "none";
    this._boundOnPointerMove = this._onPointerMove.bind(this);
    this._boundOnPointerDown = this._onPointerDown.bind(this);
    this.renderer.domElement.addEventListener(
      "pointermove",
      this._boundOnPointerMove
    );
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this._boundOnPointerDown
    );

    // Resize handling
    window.addEventListener("resize", this._onResize);

    // start loop
    this._startLoop();

    return { scene: this.scene, camera: this.camera, renderer: this.renderer };
  }

  _onResize = () => {
    if (!this.container || !this.camera || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  _startLoop() {
    const tick = () => {
      const delta = this.clock.getDelta();
      if (
        this.currentScenario &&
        typeof this.currentScenario.update === "function"
      ) {
        // pass delta time (sec) in case scenarios want smooth movement
        try {
          this.currentScenario.update(delta);
        } catch (e) {
          // keep loop alive even if a scenario throws
          // eslint-disable-next-line no-console
          console.error("Scenario update error", e);
        }
      }
      // update controls if present
      if (this.controls && typeof this.controls.update === "function") {
        this.controls.update();
      }

      if (this.renderer && this.scene && this.camera)
        this.renderer.render(this.scene, this.camera);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Switch to a scenario.
   * scenarioFactoryOrModule: object with init/update/cleanup OR a factory function returning such object
   */
  async switchScenario(scenarioFactoryOrModule) {
    // cleanup current
    if (
      this.currentScenario &&
      typeof this.currentScenario.cleanup === "function"
    ) {
      try {
        await this.currentScenario.cleanup();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Error during scenario cleanup", e);
      }
    }

    // set new scenario
    let scenario;
    if (typeof scenarioFactoryOrModule === "function") {
      scenario = await scenarioFactoryOrModule();
    } else {
      scenario = scenarioFactoryOrModule;
    }

    this.currentScenario = scenario;

    if (
      this.currentScenario &&
      typeof this.currentScenario.init === "function"
    ) {
      // scenario.init receives context { scene, camera, renderer }
      await this.currentScenario.init({
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
      });
    }
  }

  _onPointerMove(event) {
    if (!this.renderer || !this.camera) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (
      this.currentScenario &&
      typeof this.currentScenario.onPointerMove === "function"
    ) {
      this._raycaster.setFromCamera(this._pointer, this.camera);
      const intersects = this._raycaster.intersectObjects(
        this.scene.children,
        true
      );
      try {
        this.currentScenario.onPointerMove(intersects, event);
      } catch (e) {}
    }
  }

  _onPointerDown(event) {
    if (!this.renderer || !this.camera) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const intersects = this._raycaster.intersectObjects(
      this.scene.children,
      true
    );
    if (
      this.currentScenario &&
      typeof this.currentScenario.onPointerDown === "function"
    ) {
      try {
        this.currentScenario.onPointerDown(intersects, event);
      } catch (e) {}
    }
  }

  dispose() {
    // cleanup scenario
    if (
      this.currentScenario &&
      typeof this.currentScenario.cleanup === "function"
    ) {
      try {
        this.currentScenario.cleanup();
      } catch (e) {}
    }
    this._stopLoop();
    window.removeEventListener("resize", this._onResize);

    // remove renderer DOM
    if (
      this.renderer &&
      this.renderer.domElement &&
      this.renderer.domElement.parentNode
    ) {
      // remove event listeners we attached
      try {
        this.renderer.domElement.removeEventListener(
          "pointermove",
          this._boundOnPointerMove
        );
        this.renderer.domElement.removeEventListener(
          "pointerdown",
          this._boundOnPointerDown
        );
      } catch (e) {}
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // dispose renderer if available
    if (this.renderer && typeof this.renderer.dispose === "function") {
      try {
        this.renderer.dispose();
      } catch (e) {}
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.currentScenario = null;
    this.controls = null;
    this._raycaster = null;
    this._pointer = null;
  }
}
