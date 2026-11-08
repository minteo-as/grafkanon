import * as THREE from 'three'
import { ARENA_HALF } from '../game/waves'

export const COLORS = {
  bg: 0x0b1320,
  floor: 0x13213a,
  grid: 0x263a58,
  gridMain: 0x3a5682,
  axis: 0x9db8e0,
  rim: 0x1a2a40,
  enemy: 0xff6b3d,
  enemyGlow: 0x5a1800,
  marcher: 0xb07cff,
  marcherGlow: 0x2a1060,
  beam: 0x5ce1ff,
  beamCore: 0xeafcff,
  aim: 0xffd166,
  turret: 0x3d5a80,
  turretHead: 0x5a7fae,
  drone: 0xffb347,
  droneGlow: 0x5a3000,
  wall: 0x56637a,
  wallTop: 0x8796ae,
  ground: 0x1a2a40,
  mountain: 0x16243a,
  splitter: 0x38d6c4,
  splitterGlow: 0x0a3a36,
  shieldNeg: 0xff7aa8,
  shieldPos: 0x7cf29b,
  boss: 0xff3d7f,
  bossGlow: 0x5a0a28,
  bossBody: 0x8a2d5a,
  barrier: 0xffd166,
  rocket: 0x7cf29b,
  flask: 0x9fd8ff,
  liquid: 0x3ddc84,
}

/** Matematikkens (x, y) ligger på gulvet: x mod højre, y væk fra kameraet. */
export const toWorld = (x: number, y: number, height = 0): THREE.Vector3 => new THREE.Vector3(x, height, -y)

/**
 * Hvor koordinatsystemet står i 3D. Laseren skyder på gulvet (floor), granaten i et lodret
 * sidebillede (side), hvor y peger opad. "lift" flytter væk fra planet: op fra gulvet eller ud mod kameraet.
 */
export type View = 'floor' | 'side'

export interface Plane {
  view: View
  toWorld(x: number, y: number, lift?: number): THREE.Vector3
}

export const FLOOR: Plane = { view: 'floor', toWorld }
export const SIDE: Plane = { view: 'side', toWorld: (x, y, lift = 0) => new THREE.Vector3(x, y, lift) }
/** Vækstlaboratoriet: samme sidebillede, men x er tiden fra 0 til 20, så y-aksen står i venstre kant. */
export const GROWTH: Plane = {
  view: 'side',
  toWorld: (x, y, lift = 0) => new THREE.Vector3(x - ARENA_HALF, y, lift),
}

export const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

export class World {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 200)
  private basePosition = new THREE.Vector3()
  private lookTarget = new THREE.Vector3(0, 0, 0.9)
  private view: View = 'floor'
  private trauma = 0

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    container.prepend(this.renderer.domElement)

    this.scene.background = new THREE.Color(COLORS.bg)
    this.scene.fog = new THREE.Fog(COLORS.bg, 38, 70)
    this.scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x1a2638, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(-6, 14, 8)
    this.scene.add(sun)

    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
  }

  setView(view: View): void {
    this.view = view
    this.resize()
  }

  /** Ryster kameraet en smule, fx når en glitch bliver ramt. */
  shake(amount: number): void {
    if (prefersReducedMotion()) return
    this.trauma = Math.min(1, this.trauma + amount)
  }

  render(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 2.5)
    const s = this.trauma * this.trauma * 0.35
    this.camera.position
      .copy(this.basePosition)
      .add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s))
    this.camera.lookAt(this.lookTarget)
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Smalle skærme har brug for, at kameraet trækkes længere tilbage
    if (this.view === 'floor') {
      const dist = 25.5 * Math.max(1, 1.3 / this.camera.aspect)
      this.basePosition.set(0, dist * 0.76, dist * 0.65)
      this.lookTarget.set(0, 0, 0.9)
    } else {
      const dist = 23 * Math.max(1, 1.5 / this.camera.aspect)
      this.basePosition.set(0, 7.5, dist)
      this.lookTarget.set(0, 5.6, 0)
    }
    this.camera.updateProjectionMatrix()
  }
}
