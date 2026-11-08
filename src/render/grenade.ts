import * as THREE from 'three'
import type { Shot } from '../game/game'
import { samplePath } from '../math/path'
import { COLORS, SIDE, type Plane } from './world'

const SPEED = 16 // enheder i sekundet langs buen
const MIN_TIME = 0.7
const FADE = 0.45
const TUBE_RADIAL = 6

/** Granaten flyver langs parablen og raketten langs vækstkurven. Begge trækker et lysende spor efter sig. */
export class Grenade {
  private ball: THREE.Mesh
  private rocket: THREE.Group
  private head: THREE.Object3D
  private trail: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> | null = null
  private points: THREE.Vector3[] = []
  private xs: number[] = []
  private lengths: number[] = []
  private duration = 1
  private t = 0
  private active = false

  constructor(private scene: THREE.Scene) {
    this.ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ color: COLORS.beamCore }),
    )
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 8),
      new THREE.MeshBasicMaterial({
        color: COLORS.beam,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.ball.add(glow)
    this.ball.visible = false
    scene.add(this.ball)

    // Raketten: en spids krop, der peger i flyveretningen, med en flamme bagved
    this.rocket = new THREE.Group()
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: COLORS.beamCore, emissive: 0x335544, flatShading: true }),
    )
    nose.rotation.z = -Math.PI / 2
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.6, 8),
      new THREE.MeshBasicMaterial({
        color: COLORS.rocket,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    flame.rotation.z = Math.PI / 2
    flame.position.x = -0.6
    this.rocket.add(nose, flame)
    this.rocket.visible = false
    scene.add(this.rocket)
    this.head = this.ball
  }

  start(shot: Shot, plane: Plane = SIDE, kind: 'grenade' | 'rocket' = 'grenade'): void {
    this.clearTrail()
    const samples = samplePath(shot.path, 0.05)
    this.xs = samples.map((p) => p.x)
    this.points = samples.map((p) => plane.toWorld(p.x, p.y))
    this.lengths = [0]
    for (let i = 1; i < this.points.length; i++) {
      this.lengths.push(this.lengths[i - 1] + this.points[i].distanceTo(this.points[i - 1]))
    }
    const total = this.lengths[this.lengths.length - 1]
    this.duration = Math.max(MIN_TIME, total / SPEED)

    const curve = new THREE.CatmullRomCurve3(this.points)
    const segments = Math.min(200, Math.max(16, this.points.length))
    this.trail = new THREE.Mesh(
      new THREE.TubeGeometry(curve, segments, 0.07, TUBE_RADIAL, false),
      new THREE.MeshBasicMaterial({
        color: kind === 'rocket' ? COLORS.rocket : COLORS.beam,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.trail.geometry.setDrawRange(0, 0)
    this.scene.add(this.trail)

    this.t = 0
    this.active = true
    this.ball.visible = this.rocket.visible = false
    this.head = kind === 'rocket' ? this.rocket : this.ball
    this.head.visible = true
    this.head.position.copy(this.points[0])
  }

  /** Giver skuddets x-værdi (i matematikkens koordinater), og om animationen er færdig. landed er sand i det øjeblik, det rammer. */
  update(dt: number): { headX: number; done: boolean; landed: boolean; at: THREE.Vector3 } | null {
    if (!this.active || !this.trail) return null
    const before = this.t
    this.t += dt
    const u = Math.min(1, this.t / this.duration)
    const total = this.lengths[this.lengths.length - 1]
    const s = u * total
    let i = 1
    while (i < this.lengths.length - 1 && this.lengths[i] < s) i++
    const seg = this.lengths[i] - this.lengths[i - 1] || 1
    const frac = (s - this.lengths[i - 1]) / seg
    const pos = this.points[i - 1].clone().lerp(this.points[i], frac)
    const headX = this.xs[i - 1] + (this.xs[i] - this.xs[i - 1]) * frac
    this.head.position.copy(pos)
    const dir = this.points[i].clone().sub(this.points[i - 1])
    this.head.rotation.z = Math.atan2(dir.y, dir.x)

    const segments = this.trail.geometry.parameters.tubularSegments
    this.trail.geometry.setDrawRange(0, Math.ceil(u * segments) * TUBE_RADIAL * 6)
    const landed = before < this.duration && this.t >= this.duration
    if (this.t >= this.duration) {
      this.head.visible = false
      this.trail.material.opacity = 0.9 * Math.max(0, 1 - (this.t - this.duration) / FADE)
    }
    const done = this.t >= this.duration + FADE
    if (done) {
      this.clearTrail()
      this.active = false
    }
    return { headX, done, landed, at: pos }
  }

  private clearTrail(): void {
    if (!this.trail) return
    this.scene.remove(this.trail)
    this.trail.geometry.dispose()
    this.trail.material.dispose()
    this.trail = null
  }
}
