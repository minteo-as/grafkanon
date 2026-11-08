import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
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
  cityFloor: 0x0d0a22,
  cityGrid: 0x3b3a8f,
  building: 0x0b0918,
  neonPink: 0xff4fd8,
  neonCyan: 0x3ff0ff,
  neonViolet: 0x9b6bff,
  citySun: 0xff3d8b,
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

/**
 * En farve, der er stærkere end hvid, så den gløder. Gløden tager kun det, der er lysere end hvidt,
 * så tekst og øjne forbliver skarpe, mens stråler, neon og eksplosioner lyser.
 */
export const hdr = (color: number, strength = 2.5): THREE.Color => new THREE.Color(color).multiplyScalar(strength)

export const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Stemningen i en verden: himmel fra top til horisont, tåge og hvor meget det lysende gløder. */
export interface Theme {
  skyTop: string
  /** Valgfri farve midt på himlen, fx solnedgangens lilla mellem natten og det orange. */
  skyMid?: string
  skyHorizon: string
  fog: number
  fogNear: number
  fogFar: number
  bloom: number
}

export const THEMES = {
  // Neonby om natten: lilla himmel og kraftig glød
  city: { skyTop: '#05030f', skyHorizon: '#2b0f4f', fog: 0x1a0a33, fogNear: 34, fogFar: 80, bloom: 0.9 },
  // Synthwave-solnedgang: nat foroven, lilla og orange ved horisonten
  mountains: {
    skyTop: '#0b0320',
    skyMid: '#4a1257',
    skyHorizon: '#ff7a59',
    fog: 0x2b0c3d,
    fogNear: 45,
    fogFar: 110,
    bloom: 0.85,
  },
  // Finalen: mørkt og rødt, inde i Kernen
  core: {
    skyTop: '#040003',
    skyMid: '#2a0012',
    skyHorizon: '#7a0a26',
    fog: 0x1a0008,
    fogNear: 45,
    fogFar: 110,
    bloom: 0.95,
  },
  // Giftgrønt laboratorium
  lab: {
    skyTop: '#010805',
    skyMid: '#04241a',
    skyHorizon: '#0b5234',
    fog: 0x05261a,
    fogNear: 40,
    fogFar: 100,
    bloom: 0.85,
  },
} satisfies Record<string, Theme>

function skyTexture(theme: Theme): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, theme.skyTop)
  if (theme.skyMid) g.addColorStop(0.45, theme.skyMid)
  g.addColorStop(0.8, theme.skyHorizon)
  g.addColorStop(1, theme.skyHorizon)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 2, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Gløden slås fra, hvis computeren ikke kan følge med (fx en ældre Chromebook)
const SLOW_FRAME = 1 / 32
const SAMPLE_FRAMES = 120

export class World {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.1, 200)
  private basePosition = new THREE.Vector3()
  private lookTarget = new THREE.Vector3(0, 0, 0.9)
  private view: View = 'floor'
  private trauma = 0
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private frameTimes: number[] = []

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    // Telefoner har mange pixels, men lille skærm: 1,5 ser skarpt ud og sparer meget regnekraft
    const coarse = matchMedia('(pointer: coarse)').matches
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2))
    container.prepend(this.renderer.domElement)

    this.scene.background = new THREE.Color(COLORS.bg)
    this.scene.fog = new THREE.Fog(COLORS.bg, 38, 70)
    try {
      this.composer = new EffectComposer(this.renderer)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.92)
      this.composer.addPass(this.bloom)
      this.composer.addPass(new OutputPass())
    } catch {
      this.composer = null
    }
    this.scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x1a2638, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(-6, 14, 8)
    this.scene.add(sun)

    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
  }

  setTheme(theme: Theme): void {
    const old = this.scene.background
    if (old instanceof THREE.Texture) old.dispose()
    this.scene.background = skyTexture(theme)
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar)
    if (this.bloom) this.bloom.strength = theme.bloom
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
    if (this.composer) {
      this.composer.render(dt)
      this.watchSpeed(dt)
    } else this.renderer.render(this.scene, this.camera)
  }

  /** Måler de første par sekunder. Er billedet for langsomt, droppes gløden. */
  private watchSpeed(dt: number): void {
    if (this.frameTimes.length >= SAMPLE_FRAMES || dt <= 0 || document.hidden) return
    this.frameTimes.push(dt)
    if (this.frameTimes.length < SAMPLE_FRAMES) return
    const sorted = [...this.frameTimes].sort((a, b) => a - b)
    if (sorted[Math.floor(sorted.length / 2)] > SLOW_FRAME) {
      this.composer?.dispose()
      this.composer = null
      this.bloom = null
    }
  }

  /**
   * Finder kameraets placering til gulvet (Linjebyen) på enhver skærm. Hele banen med kant og kanon
   * skal være med, tippet nederst må ikke dække den, og den øverste del af billedet holdes fri, så
   * byen kan ses. Der prøves forskellige vinkler og sigtepunkter. For hver findes den korteste
   * afstand, hvor banen passer, og blandt dem, hvor banen ligger helt nede, vælges den største.
   */
  private fitFloor(w: number, h: number): void {
    const edge = ARENA_HALF + 1.3
    const corners = [-edge, edge].flatMap((x) => [-edge, edge].map((z) => new THREE.Vector3(x, 0.3, z)))
    const probe = new THREE.PerspectiveCamera(this.camera.fov, w / h, 0.1, 200)
    // Grænser i skærmkoordinater (−1 til 1): lidt luft i siderne, plads til tippet forneden og til byen foroven
    const side = 1 - (2 * 12) / w
    const bottom = -1 + (2 * (h < 600 ? 58 : 46)) / h
    const top = 1 - (2 * Math.max(90, h * 0.24)) / h
    const target = new THREE.Vector3()
    const dir = new THREE.Vector3()
    const fits = (d: number) => {
      probe.position.copy(target).addScaledVector(dir, d)
      probe.lookAt(target)
      probe.updateMatrixWorld()
      let low = Infinity
      for (const c of corners) {
        const p = c.clone().project(probe)
        if (Math.abs(p.x) > side || p.y > top || p.y < bottom) return null
        low = Math.min(low, p.y)
      }
      return low
    }
    const options: { d: number; z: number; up: number; low: number }[] = []
    // Ikke stejlere end ca. 60°, ellers ser man kun husenes tage
    for (let up = 0.55; up <= 0.86; up += 0.05) {
      dir.set(0, up, Math.sqrt(1 - up * up))
      for (let z = -12; z <= 6; z += 1) {
        target.set(0, 0, z)
        let lo = 10
        let hi = 160
        if (fits(hi) === null) continue
        for (let i = 0; i < 26; i++) {
          const mid = (lo + hi) / 2
          if (fits(mid) === null) lo = mid
          else hi = mid
        }
        options.push({ d: hi, z, up, low: fits(hi)! })
      }
    }
    // Helst en placering, hvor banen når ned til tippet, så pladsen forneden bruges og byen får resten
    const grounded = options.filter((o) => o.low <= bottom + 0.06)
    const pool = grounded.length ? grounded : options
    const best = pool.reduce((a, b) => (b.d < a.d ? b : a), { d: Infinity, z: 0, up: 0.7, low: 0 })
    if (!Number.isFinite(best.d)) best.d = 40
    this.lookTarget.set(0, 0, best.z)
    this.basePosition
      .copy(this.lookTarget)
      .addScaledVector(new THREE.Vector3(0, best.up, Math.sqrt(1 - best.up * best.up)), best.d)
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
      this.composer.setSize(w, h)
      // Gløden regnes i halv opløsning; det ser næsten ens ud og er meget hurtigere
      this.bloom?.resolution.set(w / 2, h / 2)
    }
    this.camera.aspect = w / h
    // Hvor langt væk kameraet skal stå, for at en bredde passer ind på tværs
    const halfFovX = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect)
    const fitWidth = (half: number) => half / Math.tan(halfFovX)
    if (this.view === 'floor') {
      this.fitFloor(w, h)
    } else {
      // Med plads til kanonen og tallene uden for banens kant (x = ±10)
      const dist = Math.max(23, fitWidth(12.4))
      this.basePosition.set(0, 7.5, dist)
      this.lookTarget.set(0, 5.6, 0)
    }
    this.camera.updateProjectionMatrix()
  }
}
