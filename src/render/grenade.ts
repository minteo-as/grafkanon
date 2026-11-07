import * as THREE from 'three'
import type { Shot } from '../game/game'
import { samplePath } from '../math/path'
import { COLORS, SIDE } from './world'

const SPEED = 16 // enheder i sekundet langs buen
const MIN_TIME = 0.7
const FADE = 0.45
const TUBE_RADIAL = 6

/** Granaten flyver langs parablen og trækker et lysende spor efter sig. */
export class Grenade {
  private ball: THREE.Mesh
  private trail: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> | null = null
  private points: THREE.Vector3[] = []
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
  }

  start(shot: Shot): void {
    this.clearTrail()
    const samples = samplePath(shot.path, 0.05)
    this.points = samples.map((p) => SIDE.toWorld(p.x, p.y))
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
        color: COLORS.beam,
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
    this.ball.visible = true
    this.ball.position.copy(this.points[0])
  }

  /** Giver granatens x-værdi, og om animationen er færdig. landed er sand i det øjeblik, granaten rammer. */
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
    const pos = this.points[i - 1].clone().lerp(this.points[i], (s - this.lengths[i - 1]) / seg)
    this.ball.position.copy(pos)

    const segments = this.trail.geometry.parameters.tubularSegments
    this.trail.geometry.setDrawRange(0, Math.ceil(u * segments) * TUBE_RADIAL * 6)
    const landed = before < this.duration && this.t >= this.duration
    if (this.t >= this.duration) {
      this.ball.visible = false
      this.trail.material.opacity = 0.9 * Math.max(0, 1 - (this.t - this.duration) / FADE)
    }
    const done = this.t >= this.duration + FADE
    if (done) {
      this.clearTrail()
      this.active = false
    }
    return { headX: pos.x, done, landed, at: pos }
  }

  private clearTrail(): void {
    if (!this.trail) return
    this.scene.remove(this.trail)
    this.trail.geometry.dispose()
    this.trail.material.dispose()
    this.trail = null
  }
}
