import * as THREE from 'three'
import type { Enemy } from '../game/game'
import { fmtPoint } from '../math/format'
import { aimFunction, roots } from '../math/path'
import type { Effects } from './effects'
import { disposeSprite, textSprite } from './labels'
import { COLORS, FLOOR, prefersReducedMotion, type Plane } from './world'

const BODY_HEIGHT = 0.6
const SPAWN_TIME = 0.35
const DIE_TIME = 0.3
const HOP_TIME = 0.25
const TWIN_BODY_HEIGHT = 3.2

interface View {
  group: THREE.Group
  baseY: number // kroppens højde over punktet
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  label: THREE.Sprite
  labelColors: [string, string]
  spin: number
  color: number
  cell: { x: number; y: number }
  hopFrom: THREE.Vector3
  hopTo: THREE.Vector3
  hopT: number // 1 = ikke i gang
  phase: number
  age: number
  delay: number
  dying: number // 0 = lever, > 0 = sekunder siden den blev ramt
}

const staticGeo = new THREE.IcosahedronGeometry(0.42, 0)
const marcherGeo = new THREE.OctahedronGeometry(0.48, 0)
const splitterGeo = new THREE.TetrahedronGeometry(0.55, 0)
const weakGeo = new THREE.IcosahedronGeometry(0.5, 1)
const curveCoreGeo = new THREE.TorusGeometry(0.6, 0.18, 8, 24)
const shieldGeo = new THREE.SphereGeometry(0.78, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
const ringGeo = new THREE.RingGeometry(0.32, 0.46, 20)
const arrowGeo = new THREE.ConeGeometry(0.2, 0.45, 3)
const rotorGeo = new THREE.TorusGeometry(0.62, 0.05, 6, 24)
const bossBodyGeo = new THREE.OctahedronGeometry(1.1, 0)

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2

/** Udseendet afhænger af, hvad slags glitch det er. */
function lookOf(e: Enemy, side: boolean) {
  const drone = side && e.y > 0
  if (e.boss)
    return {
      geo: e.boss.kind === 'curve' ? curveCoreGeo : weakGeo,
      color: COLORS.boss,
      glow: COLORS.bossGlow,
      spin: 2.4,
    }
  if (e.march) return { geo: marcherGeo, color: COLORS.marcher, glow: COLORS.marcherGlow, spin: 1.6 }
  if (e.splits) return { geo: splitterGeo, color: COLORS.splitter, glow: COLORS.splitterGlow, spin: 1.2 }
  if (drone) return { geo: staticGeo, color: COLORS.drone, glow: COLORS.droneGlow, spin: 0.9 }
  return { geo: staticGeo, color: COLORS.enemy, glow: COLORS.enemyGlow, spin: 0.9 }
}

function labelColors(e: Enemy): [string, string] {
  if (e.boss) return ['#ffe0ec', 'rgba(80,10,40,0.9)']
  if (e.march) return ['#efe2ff', 'rgba(40,16,72,0.88)']
  if (e.splits) return ['#dcfffb', 'rgba(8,52,56,0.88)']
  return ['#ffe3d6', 'rgba(60,20,8,0.85)']
}

const makeLabel = (x: number, y: number, [color, background]: [string, string]) =>
  textSprite(fmtPoint(x, y), { color, background, height: 0.5 })

export class EnemyLayer {
  private views = new Map<number, View>()
  private time = 0
  private reduced = prefersReducedMotion()
  private showCoordinates = true
  private plane: Plane = FLOOR
  // Bossernes ekstra dele: Tvillingens krop og bånd, Kurvens bane og krop
  private decor = new THREE.Group()
  private decorDirty = false
  private twinBodies: THREE.Mesh[] = []
  private curve: { mesh: THREE.Mesh; points: THREE.Vector3[] } | null = null

  constructor(
    private scene: THREE.Scene,
    private effects: Effects,
  ) {
    scene.add(this.decor)
  }

  setPlane(plane: Plane): void {
    this.plane = plane
  }

  /** Erstatter alle glitches med en ny bølge. */
  set(enemies: Enemy[], showCoordinates: boolean): void {
    for (const v of this.views.values()) this.remove(v)
    this.views.clear()
    this.showCoordinates = showCoordinates
    enemies.forEach((e, i) => this.views.set(e.id, this.createView(e, i * 0.07)))
    this.decorDirty = true
  }

  /** Nye glitches midt i bølgen: delernes spejlbilleder og bossens næste fase. */
  add(enemies: Enemy[]): void {
    enemies.forEach((e, i) => this.views.set(e.id, this.createView(e, 0.15 + i * 0.07)))
    this.decorDirty = true
  }

  setCoordinatesVisible(visible: boolean): void {
    this.showCoordinates = visible
    for (const v of this.views.values()) if (v.dying === 0) v.label.visible = visible
  }

  /** Sprænger glitchen og viser pointene for træfferen. */
  kill(id: number, pointsText: string): void {
    const v = this.views.get(id)
    if (!v || v.dying > 0) return
    v.dying = 1e-4
    v.label.visible = false
    const at = v.group.position.clone().add(new THREE.Vector3(0, v.baseY, 0))
    this.effects.explosion(at, v.color, this.plane.view)
    this.effects.floatingText(at, pointsText, '#ffd166')
    this.decorDirty = true
  }

  update(dt: number, enemies: Enemy[]): void {
    this.time += dt
    for (const e of enemies) {
      const v = this.views.get(e.id)
      if (!v || !e.alive || (e.x === v.cell.x && e.y === v.cell.y)) continue
      // Marchøren har taget et skridt: hop derhen og skift koordinaterne
      v.cell = { x: e.x, y: e.y }
      v.hopFrom.copy(v.group.position)
      v.hopTo.copy(this.plane.toWorld(e.x, e.y))
      v.hopT = 0
      v.group.remove(v.label)
      disposeSprite(v.label)
      v.label = makeLabel(e.x, e.y, v.labelColors)
      v.label.position.y = v.baseY + 0.85
      v.label.visible = this.showCoordinates
      v.group.add(v.label)
    }

    for (const v of this.views.values()) {
      v.age += dt
      if (v.hopT < 1) {
        v.hopT = Math.min(1, v.hopT + dt / HOP_TIME)
        v.group.position.lerpVectors(v.hopFrom, v.hopTo, v.hopT)
        v.group.position.y = Math.sin(Math.PI * v.hopT) * 0.6
      }
      if (v.dying === 0) {
        const t = Math.min(1, Math.max(0, (v.age - v.delay) / SPAWN_TIME))
        v.group.scale.setScalar(Math.max(0.001, easeOutBack(t)))
        if (!this.reduced) {
          v.body.position.y = v.baseY + Math.sin(this.time * 2.2 + v.phase) * 0.08
          v.body.rotation.y += dt * v.spin
          v.body.rotation.x += dt * 0.4
        }
      } else if (v.group.visible) {
        v.dying += dt
        v.body.scale.setScalar(1 + v.dying * 4)
        v.body.material.opacity = Math.max(0, 1 - v.dying / DIE_TIME)
        if (v.dying > DIE_TIME) v.group.visible = false
      }
    }

    if (this.decorDirty) {
      this.decorDirty = false
      this.buildDecor(enemies)
    }
    this.animateDecor(dt)
  }

  private createView(e: Enemy, delay: number): View {
    const side = this.plane.view === 'side'
    const look = lookOf(e, side)
    // I sidebilledet svæver droner i luften; glitches på jorden sidder oven på jorden
    const baseY = side ? (e.y > 0 ? 0 : 0.42) : BODY_HEIGHT
    const group = new THREE.Group()
    group.position.copy(this.plane.toWorld(e.x, e.y))
    const body = new THREE.Mesh(
      look.geo,
      new THREE.MeshStandardMaterial({ color: look.color, emissive: look.glow, flatShading: true, transparent: true }),
    )
    body.position.y = baseY
    group.add(body)

    if (!side) {
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.03
      group.add(ring)
    } else if (e.y > 0 && !e.boss) {
      const rotor = new THREE.Mesh(
        rotorGeo,
        new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.6 }),
      )
      rotor.rotation.x = Math.PI / 2
      body.add(rotor)
    }

    if (e.march) {
      // Pil på gulvet, der viser hvilken vej marchøren går
      const pivot = new THREE.Group()
      pivot.rotation.y = Math.atan2(-e.march.dx, e.march.dy)
      const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: COLORS.marcher }))
      arrow.rotation.x = -Math.PI / 2
      arrow.position.set(0, 0.05, -0.8)
      pivot.add(arrow)
      group.add(pivot)
    }

    if (e.shield) {
      // Gennemsigtigt skjold med fortegnet, der skal til: − kræver a < 0, + kræver a > 0
      const color = e.shield === 'neg' ? COLORS.shieldNeg : COLORS.shieldPos
      const dome = new THREE.Mesh(
        shieldGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      group.add(dome)
      const badge = textSprite(e.shield === 'neg' ? '−' : '+', {
        color: '#0b1320',
        background: `#${color.toString(16).padStart(6, '0')}`,
        height: 0.8,
      })
      badge.position.set(0.85, baseY + 0.35, 0)
      group.add(badge)
    }

    const colors = labelColors(e)
    const label = makeLabel(e.x, e.y, colors)
    label.position.y = baseY + 0.85
    label.visible = this.showCoordinates
    group.add(label)
    group.scale.setScalar(0.001)
    this.scene.add(group)
    return {
      group,
      baseY,
      color: look.color,
      body,
      label,
      labelColors: colors,
      spin: look.spin,
      cell: { x: e.x, y: e.y },
      hopFrom: group.position.clone(),
      hopTo: group.position.clone(),
      hopT: 1,
      phase: Math.random() * 6,
      age: 0,
      delay,
      dying: 0,
    }
  }

  private buildDecor(enemies: Enemy[]): void {
    for (const child of [...this.decor.children]) {
      this.decor.remove(child)
      const mesh = child as THREE.Mesh
      mesh.geometry?.dispose()
      ;(mesh.material as THREE.Material | undefined)?.dispose()
    }
    this.twinBodies = []
    this.curve = null
    const alive = enemies.filter((e) => e.alive && e.boss)

    // Tvillingen: et lysende bånd mellem de svage punkter og en stor krop over midten
    const links = new Map<number, Enemy[]>()
    for (const e of alive) if (e.link !== undefined) links.set(e.link, [...(links.get(e.link) ?? []), e])
    for (const pair of links.values()) {
      if (pair.length !== 2) continue
      const [p, q] = pair.map((e) => this.plane.toWorld(e.x, e.y, BODY_HEIGHT))
      const tether = new THREE.Mesh(
        new THREE.BoxGeometry(p.distanceTo(q), 0.06, 0.06),
        new THREE.MeshBasicMaterial({
          color: COLORS.boss,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
        }),
      )
      tether.position.copy(p).lerp(q, 0.5)
      tether.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x)
      const body = new THREE.Mesh(
        bossBodyGeo,
        new THREE.MeshStandardMaterial({ color: COLORS.bossBody, emissive: COLORS.bossGlow, flatShading: true }),
      )
      body.position.copy(p).lerp(q, 0.5).setY(TWIN_BODY_HEIGHT)
      this.twinBodies.push(body)
      this.decor.add(tether, body)
    }

    // Kurven: dens bane som stiplet linje og en krop, der flyver frem og tilbage langs den
    const curveBoss = alive.find((e) => e.boss?.kind === 'curve')
    const path = curveBoss?.boss?.path
    if (path?.kind === 'parabola') {
      const rs = roots(path.a, path.h, path.k)
      if (rs) {
        const f = aimFunction(path)
        const points = Array.from({ length: 81 }, (_, i) => {
          const x = rs[0] + ((rs[1] - rs[0]) * i) / 80
          return this.plane.toWorld(x, f(x), -0.02)
        })
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineDashedMaterial({
            color: COLORS.boss,
            dashSize: 0.25,
            gapSize: 0.2,
            transparent: true,
            opacity: 0.7,
          }),
        )
        line.computeLineDistances()
        const mesh = new THREE.Mesh(
          bossBodyGeo,
          new THREE.MeshStandardMaterial({ color: COLORS.bossBody, emissive: COLORS.bossGlow, flatShading: true }),
        )
        mesh.scale.setScalar(0.95)
        this.curve = { mesh, points }
        this.decor.add(line, mesh)
      }
    }
  }

  private animateDecor(dt: number): void {
    for (const body of this.twinBodies) {
      body.rotation.y += dt * 0.8
      if (!this.reduced) body.position.y = TWIN_BODY_HEIGHT + Math.sin(this.time * 1.5) * 0.2
    }
    if (this.curve) {
      // Frem og tilbage langs banen på 5 sekunder; den ligger stille, hvis man har slået bevægelse fra
      const u = this.reduced ? 0.5 : 0.5 - 0.5 * Math.cos((this.time / 5) * Math.PI * 2)
      const pts = this.curve.points
      const i = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)))
      this.curve.mesh.position.lerpVectors(pts[i], pts[i + 1], u * (pts.length - 1) - i).setZ(-0.6)
      this.curve.mesh.rotation.y += dt
    }
  }

  private remove(v: View): void {
    this.scene.remove(v.group)
    v.body.material.dispose()
    disposeSprite(v.label)
  }
}
