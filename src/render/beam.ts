import * as THREE from 'three'
import type { Shot } from '../game/game'
import { samplePath, type Path } from '../math/path'
import { COLORS, FLOOR, hdr, type Plane } from './world'

const LASER_HEIGHT = 0.6
const GROW = 0.45
const FADE = 0.3

/** Hvor højt over gulvet (eller hvor langt ud mod kameraet) banerne tegnes. */
export const liftFor = (plane: Plane): number => (plane.view === 'floor' ? LASER_HEIGHT : 0)

/** Den stiplede sigtelinje, der viser grafen før skuddet. */
export class AimLine {
  private line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: COLORS.aim, dashSize: 0.35, gapSize: 0.22 }),
  )
  private plane: Plane = FLOOR

  constructor(scene: THREE.Scene) {
    scene.add(this.line)
  }

  setPlane(plane: Plane): void {
    this.plane = plane
  }

  set(path: Path | null, visible: boolean): void {
    this.line.visible = visible && !!path
    if (!path) return
    const lift = liftFor(this.plane)
    this.line.geometry.dispose()
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(
      samplePath(path, 0.1).map((p) => this.plane.toWorld(p.x, p.y, lift)),
    )
    this.line.computeLineDistances()
  }
}

/** Laserstrålen vokser hen ad linjen og falmer bagefter. */
export class Beam {
  private group = new THREE.Group()
  private glow: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
  private shot: Shot | null = null
  private t = 0

  constructor(scene: THREE.Scene) {
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color: hdr(COLORS.beamCore, 3) }),
    )
    this.glow = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.38, 0.38),
      new THREE.MeshBasicMaterial({
        color: hdr(COLORS.beam, 2),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.group.add(core, this.glow)
    this.group.visible = false
    scene.add(this.group)
  }

  start(shot: Shot): void {
    this.shot = shot
    this.t = 0
    this.group.visible = true
  }

  /** Giver strålens forreste x-værdi, og om animationen er færdig. */
  update(dt: number): { headX: number; done: boolean } | null {
    const shot = this.shot
    if (!shot) return null
    this.t += dt
    const { xa, xb, f } = shot.path
    const headX = xa + (xb - xa) * Math.min(1, this.t / GROW)
    const from = FLOOR.toWorld(xa, f(xa), LASER_HEIGHT)
    const to = FLOOR.toWorld(headX, f(headX), LASER_HEIGHT)
    const fade = this.t > GROW ? Math.max(0, 1 - (this.t - GROW) / FADE) : 1
    this.group.position.copy(from).lerp(to, 0.5)
    this.group.rotation.y = Math.atan2(f(xa + 1) - f(xa), 1)
    const thickness = 0.3 + 0.7 * fade
    this.group.scale.set(Math.max(0.001, from.distanceTo(to)), thickness, thickness)
    this.glow.material.opacity = 0.3 * fade

    const done = this.t >= GROW + FADE
    if (done) {
      this.group.visible = false
      this.shot = null
    }
    return { headX, done }
  }
}
