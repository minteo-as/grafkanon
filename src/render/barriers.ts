import * as THREE from 'three'
import { BARRIER_TIME, type Barrier } from '../game/game'
import { COLORS, FLOOR } from './world'

const HEIGHT = 1.3

/** Barriererne står som lysende vægge på gulvet og falmer, mens tiden løber ud. */
export class BarrierLayer {
  private group = new THREE.Group()
  private walls = new Map<Barrier, THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>>()
  private ghost: THREE.Line | null = null

  constructor(
    scene: THREE.Scene,
    private half: number,
  ) {
    scene.add(this.group)
  }

  /** Stiplet linje, der viser hvor barrieren kommer til at stå. */
  preview(b: Pick<Barrier, 'axis' | 'k'> | null): void {
    if (this.ghost) {
      this.group.remove(this.ghost)
      this.ghost.geometry.dispose()
      ;(this.ghost.material as THREE.Material).dispose()
      this.ghost = null
    }
    if (!b) return
    const h = this.half
    const ends =
      b.axis === 'x'
        ? [FLOOR.toWorld(b.k, -h, 0.05), FLOOR.toWorld(b.k, h, 0.05)]
        : [FLOOR.toWorld(-h, b.k, 0.05), FLOOR.toWorld(h, b.k, 0.05)]
    this.ghost = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ends),
      new THREE.LineDashedMaterial({ color: COLORS.barrier, dashSize: 0.4, gapSize: 0.25 }),
    )
    this.ghost.computeLineDistances()
    this.group.add(this.ghost)
  }

  update(barriers: readonly Barrier[]): void {
    for (const [b, mesh] of this.walls) {
      if (barriers.includes(b)) continue
      this.group.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
      this.walls.delete(b)
    }
    for (const b of barriers) {
      let mesh = this.walls.get(b)
      if (!mesh) {
        const long = 2 * this.half
        mesh = new THREE.Mesh(
          b.axis === 'x' ? new THREE.BoxGeometry(0.12, HEIGHT, long) : new THREE.BoxGeometry(long, HEIGHT, 0.12),
          new THREE.MeshBasicMaterial({
            color: COLORS.barrier,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        )
        mesh.position.copy(b.axis === 'x' ? FLOOR.toWorld(b.k, 0, HEIGHT / 2) : FLOOR.toWorld(0, b.k, HEIGHT / 2))
        this.group.add(mesh)
        this.walls.set(b, mesh)
      }
      // Blinker de sidste to sekunder, så man kan se, at den snart forsvinder
      const fading = b.timeLeft < 2 && Math.floor(b.timeLeft * 6) % 2 === 0
      mesh.material.opacity = fading ? 0.12 : 0.18 + 0.32 * (b.timeLeft / BARRIER_TIME)
    }
  }
}
