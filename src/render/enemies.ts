import * as THREE from 'three'
import type { Enemy } from '../game/game'
import { fmtPoint } from '../math/format'
import { aimFunction, roots } from '../math/path'
import type { Effects } from './effects'
import { disposeSprite, textSprite } from './labels'
import { CHARGE_WARNING } from '../game/game'
import { COLORS, FLOOR, hdr, prefersReducedMotion, type Plane } from './world'

const BODY_HEIGHT = 0.6
const SPAWN_TIME = 0.35
const DIE_TIME = 0.3
const HOP_TIME = 0.25
const TWIN_BODY_HEIGHT = 3.2

/** To øjne, der følger kanonen, blinker og spærres op, når sigtet går igennem glitchen. */
interface Face {
  group: THREE.Group
  eyes: THREE.Mesh[]
  pupils: THREE.Mesh[]
  nextBlink: number
  blink: number // > 0 mens øjnene er lukket
  fear: number // 0 = rolig, 1 = rædselsslagen
}

/** Ringen af prikker, der tændes, mens glitchen lader op til at skyde mod basen. */
interface ChargeRing {
  group: THREE.Group
  dots: THREE.Mesh[]
  lit: THREE.MeshBasicMaterial
  off: THREE.MeshBasicMaterial
}

interface View {
  group: THREE.Group
  baseY: number // kroppens højde over punktet
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  face: Face
  charge: ChargeRing
  /** Kroppens egen glød, så den kan blinke rødt, når glitchen er ved at skyde. */
  glow: THREE.Color
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
const eyeGeo = new THREE.SphereGeometry(0.13, 14, 10)
const pupilGeo = new THREE.SphereGeometry(0.07, 10, 8)
const browGeo = new THREE.BoxGeometry(0.34, 0.07, 0.06)
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe9eef8 })
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0b0918 })
const BLINK_TIME = 0.12
const CHARGE_DOTS = 12
const dotGeo = new THREE.SphereGeometry(0.06, 6, 4)
const WARNING_RED = hdr(0xff3b3b, 1.8)
const CHARGE_AMBER = new THREE.Color(0xffd166)

/** Prikkerne ligger i en ring om glitchen: på gulvet vandret, i sidebilledet lodret ud mod kameraet. */
function makeChargeRing(side: boolean, baseY: number): ChargeRing {
  const group = new THREE.Group()
  const lit = new THREE.MeshBasicMaterial({ color: CHARGE_AMBER.clone() })
  const off = new THREE.MeshBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.5 })
  const dots: THREE.Mesh[] = []
  for (let i = 0; i < CHARGE_DOTS; i++) {
    // Starter øverst (kl. 12) og går med uret
    const a = Math.PI / 2 - (i / CHARGE_DOTS) * Math.PI * 2
    const dot = new THREE.Mesh(dotGeo, off)
    if (side) dot.position.set(Math.cos(a) * 0.82, baseY + Math.sin(a) * 0.82, 0.1)
    else dot.position.set(Math.cos(a) * 0.78, 0.08, -Math.sin(a) * 0.78)
    group.add(dot)
    dots.push(dot)
  }
  group.visible = false
  return { group, dots, lit, off }
}

/** Øjne (og vrede bryn på bosser). Ansigtet drejes mod kameraet hver frame. */
function makeFace(scale: number, angry: boolean): Face {
  const group = new THREE.Group()
  const eyes: THREE.Mesh[] = []
  const pupils: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.set(side * 0.16 * scale, 0.04 * scale, 0)
    eye.scale.setScalar(scale)
    const pupil = new THREE.Mesh(pupilGeo, pupilMat)
    pupil.position.z = 0.09
    eye.add(pupil)
    group.add(eye)
    eyes.push(eye)
    pupils.push(pupil)
    if (angry) {
      const brow = new THREE.Mesh(browGeo, pupilMat)
      brow.scale.setScalar(scale)
      brow.position.set(side * 0.16 * scale, 0.24 * scale, 0.08 * scale)
      brow.rotation.z = side * -0.45
      group.add(brow)
    }
  }
  return { group, eyes, pupils, nextBlink: 1 + Math.random() * 4, blink: 0, fear: 0 }
}

const _local = new THREE.Vector3()

/** Drejer ansigtet mod kameraet, lader pupillerne kigge mod målet og styrer blink og frygt. */
function animateFace(face: Face, dt: number, camera: THREE.Vector3, target: THREE.Vector3, scared: boolean): void {
  face.group.lookAt(camera)
  face.fear += ((scared ? 1 : 0) - face.fear) * Math.min(1, dt * 10)
  face.nextBlink -= dt
  if (face.nextBlink <= 0) {
    face.blink = BLINK_TIME
    face.nextBlink = 2 + Math.random() * 4
  }
  face.blink = Math.max(0, face.blink - dt)
  _local.copy(target)
  face.group.worldToLocal(_local)
  _local.z = 0
  if (_local.lengthSq() > 1e-6) _local.normalize().multiplyScalar(0.045)
  const open = face.blink > 0 ? 0.12 : 1 + face.fear * 0.35
  for (const eye of face.eyes) eye.scale.set(eye.scale.x, eye.scale.x * open, eye.scale.z)
  for (const pupil of face.pupils) {
    pupil.position.set(_local.x, _local.y, 0.09)
    pupil.scale.setScalar(1 - face.fear * 0.45)
  }
}

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

/** Koordinaterne står på en mørk, halvgennemsigtig plade med en kant i glitchens farve. */
function labelColors(e: Enemy, side: boolean): [string, string] {
  if (e.boss) return ['#ffe9f1', '#ff5c93']
  if (e.march) return ['#f1e9ff', '#b07cff']
  if (e.splits) return ['#e3fffb', '#38d6c4']
  if (side && e.y > 0) return ['#fff3e0', '#ffb347']
  return ['#fff0ea', '#ff6b3d']
}

const makeLabel = (x: number, y: number, [color, border]: [string, string], scale = 1) =>
  textSprite(fmtPoint(x, y), {
    color,
    border,
    background: 'rgba(9, 11, 26, 0.8)',
    height: 0.46 * scale,
    font: 'body',
  })

export class EnemyLayer {
  private views = new Map<number, View>()
  private time = 0
  private reduced = prefersReducedMotion()
  private showCoordinates = true
  private plane: Plane = FLOOR
  // Bossernes ekstra dele: Tvillingens og Koloniens krop og bånd, Kurvens bane og krop
  private decor = new THREE.Group()
  private decorDirty = false
  private twinBodies: { mesh: THREE.Mesh; baseY: number; face: Face }[] = []
  private curve: { mesh: THREE.Mesh; points: THREE.Vector3[]; face: Face } | null = null
  private targeted = new Set<number>()
  private labelScale = 1
  private camera = new THREE.Vector3(0, 20, 20)
  private lookTarget = new THREE.Vector3()
  private speech: { sprite: THREE.Sprite; timeLeft: number } | null = null

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

  /** På smalle skærme er banen lille, så koordinaterne gøres større for at kunne læses. */
  setLabelScale(scale: number): void {
    this.labelScale = scale
  }

  /** Glitches, som sigtet lige nu går igennem. De bliver bange. */
  setTargeted(ids: Iterable<number>): void {
    this.targeted = new Set(ids)
  }

  /** Hvor kameraet står (ansigterne vender mod det), og hvad pupillerne kigger på (kanonen). */
  setLook(camera: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.copy(camera)
    this.lookTarget.copy(target)
  }

  /** Bossen siger noget i en taleboble over sin krop. */
  say(text: string, seconds = 3.2): void {
    this.clearSpeech()
    const sprite = textSprite(text, { color: '#2a0a1c', background: '#ffe0ec', height: 0.62, font: 'body' })
    sprite.renderOrder = 10
    this.scene.add(sprite)
    this.speech = { sprite, timeLeft: seconds }
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
    v.face.group.visible = false
    v.charge.group.visible = false
    const at = v.group.position.clone().add(new THREE.Vector3(0, v.baseY, 0))
    this.effects.explosion(at, v.color, this.plane.view)
    this.effects.floatingText(at, pointsText, '#ffd166')
    this.decorDirty = true
  }

  /** attacking: glitcherne lader op i denne bølge, så ladningen vises. */
  update(dt: number, enemies: Enemy[], attacking = false): void {
    this.time += dt
    for (const e of enemies) {
      const v = this.views.get(e.id)
      if (v && e.alive) this.showCharge(v, e.charge, attacking)
    }
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
      v.label = makeLabel(e.x, e.y, v.labelColors, this.labelScale)
      v.label.position.y = v.baseY + 0.85
      v.label.visible = this.showCoordinates
      v.group.add(v.label)
    }

    for (const [id, v] of this.views) {
      v.age += dt
      if (v.hopT < 1) {
        v.hopT = Math.min(1, v.hopT + dt / HOP_TIME)
        v.group.position.lerpVectors(v.hopFrom, v.hopTo, v.hopT)
        v.group.position.y = Math.sin(Math.PI * v.hopT) * 0.6
      }
      if (v.dying === 0) {
        const t = Math.min(1, Math.max(0, (v.age - v.delay) / SPAWN_TIME))
        v.group.scale.setScalar(Math.max(0.001, easeOutBack(t)))
        const scared = this.targeted.has(id)
        if (!this.reduced) {
          v.body.position.y = v.baseY + Math.sin(this.time * 2.2 + v.phase) * 0.08
          v.body.rotation.y += dt * v.spin
          v.body.rotation.x += dt * 0.4
          // En bange glitch ryster
          if (v.face.fear > 0.05) v.body.position.x = Math.sin(this.time * 70 + v.phase) * 0.05 * v.face.fear
          else v.body.position.x = 0
        }
        v.face.group.position.set(v.body.position.x, v.body.position.y, 0)
        animateFace(v.face, dt, this.camera, this.lookTarget, scared)
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

    const charge = makeChargeRing(side, baseY)
    group.add(charge.group)

    // Ansigtet sidder foran kroppen og drejes mod kameraet
    const face = makeFace(e.boss ? 1.25 : 1, !!e.boss)
    face.eyes.forEach((eye) => (eye.position.z = 0.36))
    face.group.position.y = baseY
    group.add(face.group)

    const colors = labelColors(e, side)
    const label = makeLabel(e.x, e.y, colors, this.labelScale)
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
      face,
      charge,
      glow: new THREE.Color(look.glow),
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

    // Tvillingen og Kolonien: et lysende bånd mellem de svage punkter og en stor krop over midten
    const side = this.plane.view === 'side'
    const links = new Map<number, Enemy[]>()
    for (const e of alive) if (e.link !== undefined) links.set(e.link, [...(links.get(e.link) ?? []), e])
    for (const pair of links.values()) {
      if (pair.length !== 2) continue
      const [p, q] = pair.map((e) => this.plane.toWorld(e.x, e.y, side ? 0 : BODY_HEIGHT))
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
      if (side) tether.rotation.z = Math.atan2(q.y - p.y, q.x - p.x)
      else tether.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x)
      const body = new THREE.Mesh(
        bossBodyGeo,
        new THREE.MeshStandardMaterial({ color: COLORS.bossBody, emissive: COLORS.bossGlow, flatShading: true }),
      )
      // I sidebilledet svæver kroppen et stykke over båndet, så den ikke dækker de svage punkter
      body.position.copy(p).lerp(q, 0.5)
      if (side) body.position.y = Math.max(p.y, q.y) + 2.4
      else body.position.y = TWIN_BODY_HEIGHT
      const face = makeFace(2.6, true)
      face.eyes.forEach((eye) => (eye.position.z = 0.95))
      face.group.position.copy(body.position)
      this.twinBodies.push({ mesh: body, baseY: body.position.y, face })
      this.decor.add(tether, body, face.group)
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
        const face = makeFace(2.4, true)
        face.eyes.forEach((eye) => (eye.position.z = 0.9))
        this.curve = { mesh, points, face }
        this.decor.add(line, mesh, face.group)
      }
    }
  }

  private animateDecor(dt: number): void {
    for (const { mesh, baseY, face } of this.twinBodies) {
      mesh.rotation.y += dt * 0.8
      if (!this.reduced) mesh.position.y = baseY + Math.sin(this.time * 1.5) * 0.2
      face.group.position.copy(mesh.position)
      animateFace(face, dt, this.camera, this.lookTarget, false)
    }
    if (this.curve) {
      // Frem og tilbage langs banen på 5 sekunder; den ligger stille, hvis man har slået bevægelse fra
      const u = this.reduced ? 0.5 : 0.5 - 0.5 * Math.cos((this.time / 5) * Math.PI * 2)
      const pts = this.curve.points
      const i = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)))
      this.curve.mesh.position.lerpVectors(pts[i], pts[i + 1], u * (pts.length - 1) - i).setZ(-0.6)
      this.curve.mesh.rotation.y += dt
      this.curve.face.group.position.copy(this.curve.mesh.position)
      animateFace(this.curve.face, dt, this.camera, this.lookTarget, false)
    }
    // Talebobben følger bossens krop
    if (this.speech) {
      this.speech.timeLeft -= dt
      const anchor = this.twinBodies[0]?.mesh.position ?? this.curve?.mesh.position
      if (anchor) {
        // Boblen holdes inden for banen, så den ikke bliver skåret af ved kanten
        const room = Math.max(0, 10.5 - this.speech.sprite.scale.x / 2)
        this.speech.sprite.position.copy(anchor).add(new THREE.Vector3(0, 2.1, 0.5))
        this.speech.sprite.position.x = THREE.MathUtils.clamp(this.speech.sprite.position.x, -room, room)
      }
      this.speech.sprite.visible = !!anchor
      const fadeIn = Math.min(1, (3.2 - this.speech.timeLeft) * 6)
      this.speech.sprite.material.opacity = Math.min(fadeIn, this.speech.timeLeft * 3)
      if (this.speech.timeLeft <= 0) this.clearSpeech()
    }
  }

  /** Tænder prikkerne efter ladningen. De sidste sekunder lyser de og kroppen rødt og pulserer. */
  private showCharge(v: View, charge: number, attacking: boolean): void {
    const ring = v.charge
    ring.group.visible = attacking && v.dying === 0
    if (!ring.group.visible) {
      v.body.material.emissive.copy(v.glow)
      return
    }
    const c = Math.max(0, Math.min(1, charge))
    const lit = Math.floor(c * CHARGE_DOTS)
    ring.dots.forEach((dot, i) => (dot.material = i < lit ? ring.lit : ring.off))
    const warning = c >= CHARGE_WARNING
    const pulse = warning && !this.reduced ? 0.5 + 0.5 * Math.sin(this.time * 18) : 1
    ring.lit.color.copy(warning ? WARNING_RED : CHARGE_AMBER).multiplyScalar(warning ? 0.6 + 0.4 * pulse : 1)
    v.body.material.emissive.copy(v.glow).lerp(new THREE.Color(0xff1a1a), warning ? 0.5 * pulse : 0)
  }

  private clearSpeech(): void {
    if (!this.speech) return
    this.scene.remove(this.speech.sprite)
    disposeSprite(this.speech.sprite)
    this.speech = null
  }

  private remove(v: View): void {
    this.scene.remove(v.group)
    v.body.material.dispose()
    v.charge.lit.dispose()
    v.charge.off.dispose()
    disposeSprite(v.label)
  }
}
