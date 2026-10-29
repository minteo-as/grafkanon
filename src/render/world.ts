import * as THREE from 'three';

export const COLORS = {
  bg: 0x0b1320,
  floor: 0x13213a,
  grid: 0x263a58,
  gridMain: 0x3a5682,
  axis: 0x9db8e0,
  rim: 0x1a2a40,
  enemy: 0xff6b3d,
  enemyGlow: 0x5a1800,
  beam: 0x5ce1ff,
  beamCore: 0xeafcff,
  aim: 0xffd166,
  turret: 0x3d5a80,
  turretHead: 0x5a7fae,
};

/** Matematikkens (x, y) ligger på gulvet: x mod højre, y væk fra kameraet. */
export const toWorld = (x: number, y: number, height = 0): THREE.Vector3 => new THREE.Vector3(x, height, -y);

export const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 200);
  private basePosition = new THREE.Vector3();
  private lookTarget = new THREE.Vector3(0, 0, 0.9);
  private trauma = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.prepend(this.renderer.domElement);

    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLORS.bg, 38, 70);
    this.scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x1a2638, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-6, 14, 8);
    this.scene.add(sun);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  /** Ryster kameraet en smule, fx når en glitch bliver ramt. */
  shake(amount: number): void {
    if (prefersReducedMotion()) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  render(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const s = this.trauma * this.trauma * 0.35;
    this.camera.position
      .copy(this.basePosition)
      .add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.lookAt(this.lookTarget);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Smalle skærme har brug for, at kameraet trækkes længere tilbage
    const dist = 25.5 * Math.max(1, 1.3 / this.camera.aspect);
    this.basePosition.set(0, dist * 0.76, dist * 0.65);
    this.camera.updateProjectionMatrix();
  }
}
