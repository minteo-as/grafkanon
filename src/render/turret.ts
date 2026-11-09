import * as THREE from 'three'
import type { Path } from '../math/path'
import { COLORS, FLOOR, GROWTH, type Plane } from './world'

const BARREL_X = 0.6

/**
 * Kanonen kører hen til det sted, hvor skuddet starter. På gulvet kører den langs kanten og drejer
 * vandret; i sidebilledet står den i venstre nulpunkt og vipper løbet op. I Vækstlaboratoriet kører
 * den op og ned ad en skinne ved y-aksen til startværdien b.
 */
export class Turret {
  private group = new THREE.Group()
  private yaw = new THREE.Group()
  private pitch = new THREE.Group()
  private head: THREE.Mesh
  private barrel: THREE.Mesh
  private plane: Plane = FLOOR
  private targetPosition: THREE.Vector3
  private targetAngle = 0
  private recoil = 0
  private rail: THREE.Mesh
  /** Skjoldet om basen: en lysende kuppel, der bliver svagere for hvert skjold, der springer. */
  private shield: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  private shieldLevel = 0
  private shieldHit = 0

  constructor(
    scene: THREE.Scene,
    private half: number,
  ) {
    const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.turret, flatShading: true })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.35, 8), baseMat)
    base.position.y = 0.2
    this.head = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.38, 0.55),
      new THREE.MeshStandardMaterial({ color: COLORS.turretHead, flatShading: true }),
    )
    this.barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: COLORS.beam, emissive: 0x0d4a5a }),
    )
    this.barrel.rotation.z = -Math.PI / 2
    this.barrel.position.x = BARREL_X
    this.pitch.position.y = 0.55
    this.pitch.add(this.head, this.barrel)
    this.yaw.add(base, this.pitch)
    this.group.add(this.yaw)
    scene.add(this.group)

    this.rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1, 6),
      new THREE.MeshStandardMaterial({ color: COLORS.turret, flatShading: true }),
    )
    this.rail.visible = false
    scene.add(this.rail)

    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 24, 16),
      new THREE.MeshBasicMaterial({
        color: COLORS.beam,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.shield.position.y = 0.5
    this.shield.visible = false
    this.group.add(this.shield)

    this.targetPosition = this.parkedPosition()
    this.group.position.copy(this.targetPosition)
  }

  /** Hvor kanonen står lige nu. Glitchernes øjne følger den. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  setPlane(plane: Plane): void {
    this.plane = plane
    this.rail.visible = plane === GROWTH
    this.yaw.rotation.y = 0
    this.pitch.rotation.z = 0
    this.park()
    this.group.position.copy(this.targetPosition)
  }

  /**
   * Stiller kanonen ved banens start og peger langs den. I sidebilledet står den på jorden ved
   * granatens nulpunkt; ved linjer og raketter (onRail) kører den op ad en skinne til startpunktet.
   */
  aimAlong(path: Path | null, onRail = this.plane === GROWTH): void {
    if (!path) {
      this.park()
      return
    }
    this.rail.visible = this.plane.view === 'side' && onRail
    const slope = (path.f(path.xa + 1e-3) - path.f(path.xa)) / 1e-3
    if (this.plane.view === 'floor') {
      const len = Math.hypot(1, slope)
      this.targetPosition = this.plane.toWorld(path.xa - 0.8 / len, path.f(path.xa) - (0.8 * slope) / len)
    } else if (onRail) {
      // Løbet skal sidde i startpunktet (0, b), så kanonen står lidt under og til venstre for det
      this.targetPosition = this.plane.toWorld(path.xa - 0.75, path.f(path.xa) - 0.55)
    } else {
      this.targetPosition = this.plane.toWorld(path.xa - 0.35, 0)
    }
    this.targetAngle = Math.atan(slope)
  }

  /** Viser basens skjolde (0–3). Uden angreb i bølgen er skjoldet skjult. */
  setShields(count: number, visible: boolean): void {
    this.shieldLevel = count
    this.shield.visible = visible && count > 0
  }

  /** Et angreb rammer: skjoldet blinker rødt og ryster. */
  hitShield(): void {
    this.shieldHit = 1
  }

  kick(): void {
    this.recoil = 1
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 12)
    this.group.position.lerp(this.targetPosition, k)
    const pivot = this.plane.view === 'floor' ? this.yaw.rotation : this.pitch.rotation
    const axis = this.plane.view === 'floor' ? 'y' : 'z'
    pivot[axis] += (this.targetAngle - pivot[axis]) * k
    if (this.rail.visible) {
      const h = Math.max(0.01, this.group.position.y)
      this.rail.scale.y = h
      this.rail.position.set(this.group.position.x, h / 2, this.group.position.z)
    }
    this.recoil = Math.max(0, this.recoil - dt * 4)
    this.shieldHit = Math.max(0, this.shieldHit - dt * 2.2)
    if (this.shield.visible) {
      const m = this.shield.material
      m.color.setHex(COLORS.beam).lerp(new THREE.Color(0xff3b3b), this.shieldHit)
      m.opacity = 0.05 + this.shieldLevel * 0.035 + this.shieldHit * 0.35
      this.shield.scale.setScalar(1 + this.shieldHit * 0.25)
    }
    this.barrel.position.x = BARREL_X - this.recoil * 0.25
    this.head.scale.setScalar(1 + this.recoil * 0.12)
  }

  private park(): void {
    this.targetPosition = this.parkedPosition()
    this.targetAngle = this.plane.view === 'floor' ? 0 : Math.PI / 4
  }

  private parkedPosition(): THREE.Vector3 {
    if (this.plane === GROWTH) return this.plane.toWorld(-0.75, 0)
    return this.plane.toWorld(-this.half - 0.8, 0)
  }
}
