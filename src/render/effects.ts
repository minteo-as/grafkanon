import * as THREE from 'three'
import { disposeSprite, textSprite } from './labels'
import { hdr, type View } from './world'

interface Effect {
  object: THREE.Object3D
  age: number
  life: number
  step(e: Effect, dt: number, t: number): void
  dispose?(): void
}

const shardGeo = new THREE.TetrahedronGeometry(0.13)
const ringGeo = new THREE.RingGeometry(0.42, 0.56, 36)
const flashGeo = new THREE.SphereGeometry(0.6, 12, 8)

/** Kortlivede effekter: eksplosioner, chokbølger og flydende point. */
export class Effects {
  private items: Effect[] = []

  constructor(private scene: THREE.Scene) {}

  /** På gulvet breder chokbølgen sig langs gulvet; i sidebilledet vender den mod kameraet. */
  explosion(at: THREE.Vector3, color: number, view: View = 'floor'): void {
    // Hvidt glimt
    const flash = new THREE.Mesh(
      flashGeo,
      new THREE.MeshBasicMaterial({
        color: hdr(0xfff4d6, 1.5),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    flash.position.copy(at)
    this.add(
      flash,
      0.18,
      (e, _dt, t) => {
        e.object.scale.setScalar(1 + t * 1.5)
        ;(flash.material as THREE.MeshBasicMaterial).opacity = 1 - t
      },
      () => (flash.material as THREE.Material).dispose(),
    )

    // Chokbølge langs gulvet
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: hdr(color, 2),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    if (view === 'floor') {
      ring.rotation.x = -Math.PI / 2
      ring.position.set(at.x, 0.05, at.z)
    } else ring.position.copy(at)
    this.add(
      ring,
      0.45,
      (e, _dt, t) => {
        e.object.scale.setScalar(1 + t * 4)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t)
      },
      () => (ring.material as THREE.Material).dispose(),
    )

    // Splinter i to farver
    const mats = [
      new THREE.MeshBasicMaterial({ color: hdr(color, 2) }),
      new THREE.MeshBasicMaterial({ color: hdr(0xffd166, 2) }),
    ]
    for (let i = 0; i < 18; i++) {
      const shard = new THREE.Mesh(shardGeo, mats[i % 2])
      shard.position.copy(at)
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.35, Math.random() - 0.5).multiplyScalar(
        5 + Math.random() * 4,
      )
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(14)
      this.add(shard, 0.55 + Math.random() * 0.3, (e, dt, t) => {
        v.y -= 18 * dt
        e.object.position.addScaledVector(v, dt)
        e.object.rotation.x += spin.x * dt
        e.object.rotation.y += spin.y * dt
        e.object.scale.setScalar(Math.max(0.01, 1 - t))
      })
    }
  }

  /** En glitch skyder mod basen: en rød stråle, der lyser op og falmer, og et glimt ved basen. */
  attackBolt(from: THREE.Vector3, to: THREE.Vector3, view: View): void {
    const length = from.distanceTo(to)
    const bolt = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.12, 0.12),
      new THREE.MeshBasicMaterial({
        color: hdr(0xff3b3b, 2.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    bolt.position.copy(from).lerp(to, 0.5)
    const dir = to.clone().sub(from).normalize()
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
    this.add(
      bolt,
      0.35,
      (e, _dt, t) => {
        // Strålen skyder frem på et øjeblik og bliver tyndere, mens den falmer
        const grow = Math.min(1, t * 5)
        e.object.scale.set(grow, 1 - t * 0.7, 1 - t * 0.7)
        e.object.position.copy(from).lerp(to, grow / 2)
        ;(bolt.material as THREE.MeshBasicMaterial).opacity = 1 - t
      },
      () => {
        bolt.geometry.dispose()
        ;(bolt.material as THREE.Material).dispose()
      },
    )
    this.explosion(to, 0xff3b3b, view)
  }

  /** En stiplet streg fra deleren til dens spejlbillede, så man kan se spejlingen i y-aksen. */
  mirrorLink(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2, transparent: true }),
    )
    line.computeLineDistances()
    this.add(
      line,
      1.2,
      (_e, _dt, t) => ((line.material as THREE.LineDashedMaterial).opacity = 1 - t),
      () => {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      },
    )
  }

  /** Tekst, der springer frem, stiger op og forsvinder, fx "+300". */
  floatingText(at: THREE.Vector3, text: string, color: string): void {
    const sprite = textSprite(text, { color, height: 0.9 })
    sprite.position.copy(at).add(new THREE.Vector3(0, 0.6, 0))
    const startY = sprite.position.y
    const base = sprite.scale.clone()
    this.add(
      sprite,
      1,
      (e, _dt, t) => {
        // Springer op i overstørrelse og falder på plads
        const pop = t < 0.12 ? 0.4 + (t / 0.12) * 0.95 : t < 0.26 ? 1.35 - ((t - 0.12) / 0.14) * 0.35 : 1
        sprite.scale.set(base.x * pop, base.y * pop, 1)
        e.object.position.y = startY + t * 1.4
        sprite.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      },
      () => disposeSprite(sprite),
    )
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i]
      e.age += dt
      const t = Math.min(1, e.age / e.life)
      e.step(e, dt, t)
      if (e.age >= e.life) {
        this.scene.remove(e.object)
        e.dispose?.()
        this.items.splice(i, 1)
      }
    }
  }

  private add(object: THREE.Object3D, life: number, step: Effect['step'], dispose?: () => void): void {
    this.scene.add(object)
    this.items.push({ object, age: 0, life, step, dispose })
  }
}
