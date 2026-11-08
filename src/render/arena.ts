import * as THREE from 'three'
import { fmtNum } from '../math/format'
import { HoloGrid } from './grid'
import { textSprite } from './labels'
import { COLORS, hdr, SIDE, toWorld, type Plane } from './world'

/** En bane: det, der står stille, og gitteret, der lyser op, når noget bliver ramt. */
export interface Arena {
  group: THREE.Group
  grid: HoloGrid
  /** Det, der bevæger sig i kulissen, fx bobler i laboratoriet. */
  animate?: (dt: number) => void
}

/** Farverne i sidebillederne: gitter, bagvæg, jord og den lysende horisontlinje. */
const SIDE_LOOKS = {
  mountains: { grid: 0x6a3fb0, glow: 0xff7ad9, back: 0x12071f, ground: 0x1a0b2c, horizon: COLORS.neonPink },
  lab: { grid: 0x2a8a5c, glow: 0x9dffc4, back: 0x02110a, ground: 0x08190f, horizon: COLORS.liquid },
}

/** Gulv, gitter, akser med tal og kanten rundt om banen, med neonbyen omkring (Linjebyen). */
export function buildFloorArena(half: number): Arena {
  const arena = new THREE.Group()
  const size = 2 * half

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 3, size + 3),
    new THREE.MeshStandardMaterial({ color: COLORS.cityFloor, roughness: 0.55, metalness: 0.3 }),
  )
  floor.rotation.x = -Math.PI / 2
  arena.add(floor)

  const grid = new HoloGrid({
    orientation: 'floor',
    center: new THREE.Vector2(0, 0),
    half: new THREE.Vector2(half, half),
    color: COLORS.cityGrid,
    glow: COLORS.beam,
  })
  arena.add(grid.mesh)

  const axisMat = new THREE.MeshBasicMaterial({ color: COLORS.axis })
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(size + 1, 0.03, 0.07), axisMat)
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, size + 1), axisMat)
  xAxis.position.y = yAxis.position.y = 0.02
  arena.add(xAxis, yAxis)

  for (let v = -half; v <= half; v += 2) {
    if (v === 0) continue
    const onX = textSprite(fmtNum(v))
    onX.position.copy(toWorld(v, -0.55, 0.25))
    const onY = textSprite(fmtNum(v))
    onY.position.copy(toWorld(-0.6, v, 0.25))
    arena.add(onX, onY)
  }
  const xName = textSprite('x', { color: '#dce6f4', height: 0.7 })
  xName.position.copy(toWorld(half + 0.5, 0.5, 0.3))
  const yName = textSprite('y', { color: '#dce6f4', height: 0.7 })
  yName.position.copy(toWorld(0.5, half + 0.5, 0.3))
  arena.add(xName, yName)

  // Kanten, som kanonen kører rundt på, med en neonlist på toppen
  const rimMat = new THREE.MeshStandardMaterial({ color: COLORS.rim, roughness: 0.8 })
  const neonMat = new THREE.MeshBasicMaterial({ color: hdr(COLORS.neonCyan, 2) })
  const edge = half + 0.9
  const long = size + 2.2
  const sides: [number, number, number, number][] = [
    [0, -edge, long, 0.5],
    [0, edge, long, 0.5],
    [-edge, 0, 0.5, long],
    [edge, 0, 0.5, long],
  ]
  for (const [x, y, w, d] of sides) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), rimMat)
    rim.position.copy(toWorld(x, y, 0.12))
    const neon = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.06, w - 0.44), 0.05, Math.max(0.06, d - 0.44)),
      neonMat,
    )
    neon.position.copy(toWorld(x, y, 0.27))
    arena.add(rim, neon)
  }
  arena.add(buildCity(half))
  return { group: arena, grid }
}

/** Vinduer som en tekstur: mørke ruder med tilfældige lys i varme og kolde farver. */
function windowTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 32, 64)
  let r = seed
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280
  const lights = ['#ffd27a', '#ffe9b0', '#7ae8ff', '#ff7ad9']
  for (let y = 2; y < 64; y += 6) {
    for (let x = 2; x < 32; x += 5) {
      if (rand() < 0.22) {
        ctx.fillStyle = lights[Math.floor(rand() * lights.length)]
        ctx.fillRect(x, y, 3, 3)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.NearestFilter
  return texture
}

/** Skyline rundt om banen: høje huse bagved og på siderne, neonlister på nogle af tagene og en sol i horisonten. */
function buildCity(half: number): THREE.Group {
  const city = new THREE.Group()
  const textures = [1, 2, 3, 4].map(windowTexture)
  const neon = [COLORS.neonPink, COLORS.neonCyan, COLORS.neonViolet].map(
    (color) => new THREE.MeshBasicMaterial({ color: hdr(color, 2.2) }),
  )
  let r = 7
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280
  const spots: [number, number][] = []
  // Bagved: flere rækker, der bliver højere jo længere væk
  for (let row = 0; row < 3; row++) {
    for (let x = -46; x <= 46; x += 4 + rand() * 3) spots.push([x, -(half + 7 + row * 7 + rand() * 3)])
  }
  // På siderne
  for (const sx of [-1, 1]) {
    for (let z = -half - 2; z <= half - 2; z += 4 + rand() * 2) spots.push([sx * (half + 9 + rand() * 6), z])
  }
  for (const [x, z] of spots) {
    const far = Math.min(1, Math.abs(z) / 30 + Math.abs(x) / 60)
    const w = 2.5 + rand() * 3
    const d = 2.5 + rand() * 3
    const h = 4 + rand() * 10 + far * 14
    const map = textures[Math.floor(rand() * textures.length)].clone()
    map.repeat.set(Math.max(1, Math.round(w / 2.5)), Math.max(1, Math.round(h / 4)))
    map.needsUpdate = true
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: COLORS.building,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 1.3,
        roughness: 0.9,
      }),
    )
    building.position.set(x, h / 2 - 0.3, z)
    city.add(building)
    if (rand() < 0.45) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1),
        neon[Math.floor(rand() * neon.length)],
      )
      strip.position.set(x, h - 0.3, z)
      city.add(strip)
    }
  }
  // En stor solnedgangssol bag byen, som i en synthwave-plakat
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.citySun, fog: false, transparent: true, opacity: 0.85 }),
  )
  sun.position.set(0, 10, -75)
  city.add(sun)
  return city
}

export interface SideArenaOptions {
  /** Hvor matematikkens koordinater står i 3D. SIDE har x fra −half til half, GROWTH fra 0 til 2·half. */
  plane?: Plane
  xFrom?: number
  xTo?: number
  /** Bjerge (Parabelbjergene) eller glaskolber (Vækstlaboratoriet) i baggrunden. */
  scenery?: 'mountains' | 'lab'
}

/** Et lodret koordinatsystem med jorden som x-akse og kulisser i baggrunden. */
export function buildSideArena(half: number, top: number, opts: SideArenaOptions = {}): Arena {
  const { plane = SIDE, xFrom = -half, xTo = half, scenery = 'mountains' } = opts
  const arena = new THREE.Group()

  const look = SIDE_LOOKS[scenery]
  // Gitteret står lodret lige bag dronerne
  const grid = new HoloGrid({
    orientation: 'side',
    center: new THREE.Vector2(0, top / 2),
    half: new THREE.Vector2(half, top / 2),
    color: look.grid,
    glow: look.glow,
  })
  arena.add(grid.mesh)
  // Bagvæggen er halvgennemsigtig, så kulissen skinner igennem bag gitteret
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * half, top),
    new THREE.MeshBasicMaterial({ color: look.back, transparent: true, opacity: 0.72, depthWrite: false }),
  )
  back.position.set(0, top / 2, -0.1)
  arena.add(back)

  // Jorden strækker sig ud mod kameraet, med en lysende kant ind mod kulissen
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(2 * half + 40, 0.4, 40),
    new THREE.MeshStandardMaterial({ color: look.ground, roughness: 0.6, metalness: 0.3 }),
  )
  ground.position.set(0, -0.2, 18)
  const horizon = new THREE.Mesh(
    new THREE.BoxGeometry(2 * half + 6, 0.05, 0.08),
    new THREE.MeshBasicMaterial({ color: hdr(look.horizon, 2) }),
  )
  horizon.position.set(0, 0.01, -1.96)
  arena.add(ground, horizon)

  const axisMat = new THREE.MeshBasicMaterial({ color: COLORS.axis })
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(2 * half + 1, 0.06, 0.06), axisMat)
  xAxis.position.set(0, 0.01, 0)
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.06, top + 0.6, 0.06), axisMat)
  yAxis.position.copy(plane.toWorld(0, (top + 0.6) / 2))
  arena.add(xAxis, yAxis)

  // Tallene på x-aksen står på jorden lige foran aksen. Under aksen ville jorden skjule dem.
  for (let v = xFrom; v <= xTo; v += 2) {
    if (v === 0) continue
    const label = textSprite(fmtNum(v))
    label.position.copy(plane.toWorld(v, 0.22, 1.1))
    arena.add(label)
  }
  for (let v = 2; v <= top; v += 2) {
    const label = textSprite(fmtNum(v))
    label.position.copy(plane.toWorld(-0.6, v, 0.1))
    arena.add(label)
  }
  const xName = textSprite('x', { color: '#dce6f4', height: 0.7 })
  xName.position.copy(plane.toWorld(xTo + 0.6, 0.5, 0.2))
  const yName = textSprite('y', { color: '#dce6f4', height: 0.7 })
  yName.position.copy(plane.toWorld(0.5, top + 0.5, 0.2))
  arena.add(xName, yName)

  const scene = scenery === 'lab' ? buildLab() : buildMountains()
  arena.add(scene.group)
  return { group: arena, grid, animate: scene.animate }
}

/** Synthwave-sol: gul foroven, lyserød forneden, med vandrette striber skåret ud af den nederste halvdel. */
function sunTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, size)
  g.addColorStop(0, '#ffe066')
  g.addColorStop(0.55, '#ff8a3d')
  g.addColorStop(1, '#ff2d8b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 7; i++) {
    const y = size * 0.52 + i * i * 2.2 + i * 10
    ctx.fillRect(0, y, size, 2 + i * 1.6)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Parabelbjergene: solnedgang, stjerner og lavpolygon-bjerge med neonkanter. */
function buildMountains(): { group: THREE.Group; animate?: (dt: number) => void } {
  const group = new THREE.Group()
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ map: sunTexture(), transparent: true, fog: false, color: hdr(0xffffff, 1.15) }),
  )
  sun.position.set(0, 9, -48)
  group.add(sun)

  // Stjerner højt på himlen
  const stars: number[] = []
  let r = 3
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280
  for (let i = 0; i < 220; i++) stars.push((rand() - 0.5) * 140, 14 + rand() * 40, -50 - rand() * 20)
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3))
  group.add(
    new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffe9ff, size: 0.35, fog: false, transparent: true })),
  )

  // To rækker bjerge: forreste med lyserøde neonkanter, bageste med lilla
  const ranges: [number, number, number, number][] = [
    // x, højde, radius, z
    [-20, 8, 7, -14],
    [-12, 13, 8, -16],
    [-3, 10, 6, -13],
    [6, 14, 9, -17],
    [14, 11, 7, -14],
    [22, 8, 6, -15],
    [-26, 15, 10, -28],
    [-9, 19, 12, -30],
    [10, 17, 11, -29],
    [28, 14, 9, -27],
  ]
  ranges.forEach(([x, h, rad, z], i) => {
    const front = i < 6
    const geo = new THREE.ConeGeometry(rad, h, 5)
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: front ? 0x1c0a33 : 0x150826, flatShading: true, roughness: 1 }),
    )
    m.position.set(x, h / 2 - 0.5, z)
    m.rotation.y = x
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: hdr(front ? COLORS.neonPink : COLORS.neonViolet, front ? 1.6 : 1.2) }),
    )
    edges.position.copy(m.position)
    edges.rotation.copy(m.rotation)
    group.add(m, edges)
  })
  return { group }
}

/** Glaskolber med lysende væske og bobler, rør på væggen og sporer, der svæver op. */
function buildLab(): { group: THREE.Group; animate: (dt: number) => void } {
  const lab = new THREE.Group()
  const glass = new THREE.MeshStandardMaterial({
    color: COLORS.flask,
    transparent: true,
    opacity: 0.18,
    roughness: 0.1,
    depthWrite: false,
  })
  const liquid = new THREE.MeshBasicMaterial({ color: hdr(COLORS.liquid, 1.25), transparent: true, opacity: 0.8 })
  const bubbleMat = new THREE.MeshBasicMaterial({ color: hdr(0xc8ffe0, 1.8), transparent: true, opacity: 0.85 })
  const bubbleGeo = new THREE.SphereGeometry(0.16, 8, 6)
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1d2b26, metalness: 0.6, roughness: 0.4 })
  const bubbles: { mesh: THREE.Mesh; bottom: number; top: number; speed: number }[] = []
  // [x, højde, radius, væskens andel]: væsken stiger mod højre, som når noget vokser
  const tubes: [number, number, number, number][] = [
    [-17, 6, 1.2, 0.2],
    [-11, 9, 1.6, 0.25],
    [-4, 7, 1.3, 0.35],
    [3, 11, 1.8, 0.45],
    [10, 8, 1.4, 0.65],
    [16, 12, 1.9, 0.85],
    [22, 7, 1.3, 0.95],
  ]
  for (const [x, h, r, fill] of tubes) {
    const z = -11 - (Math.abs(x) % 3)
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10, 1, true), glass)
    tube.position.set(x, h / 2 - 0.5, z)
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * fill, 10), liquid)
    fluid.position.set(x, (h * fill) / 2 - 0.5, z)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 6, 16), glass)
    rim.rotation.x = Math.PI / 2
    rim.position.set(x, h - 0.5, z)
    lab.add(fluid, tube, rim)
    // Bobler, der stiger op gennem væsken
    const surface = h * fill - 0.5
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(bubbleGeo, bubbleMat)
      mesh.position.set(x + (i - 1.5) * r * 0.35, -0.3 + ((i * 0.37) % 1) * surface, z + r * 0.5)
      mesh.scale.setScalar(0.6 + (i % 3) * 0.3)
      lab.add(mesh)
      bubbles.push({ mesh, bottom: -0.3, top: surface, speed: 0.8 + (i % 3) * 0.45 })
    }
    // Et rør fra toppen af kolben op til en ledning langs væggen
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 16 - h, 8), pipeMat)
    pipe.position.set(x, h - 0.5 + (16 - h) / 2, z)
    lab.add(pipe)
  }
  const main = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 10), pipeMat)
  main.rotation.z = Math.PI / 2
  main.position.set(0, 15.5, -13)
  lab.add(main)

  // Sporer, der svæver langsomt op foran væggen
  const count = 90
  const spores = new Float32Array(count * 3)
  let r = 11
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280
  for (let i = 0; i < count; i++) spores.set([(rand() - 0.5) * 60, rand() * 22, -4 - rand() * 8], i * 3)
  const sporeGeo = new THREE.BufferGeometry()
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(spores, 3))
  lab.add(
    new THREE.Points(
      sporeGeo,
      new THREE.PointsMaterial({ color: hdr(0x9dffc4, 1.4), size: 0.18, transparent: true, opacity: 0.8 }),
    ),
  )

  const animate = (dt: number) => {
    for (const b of bubbles) {
      b.mesh.position.y += b.speed * dt
      if (b.mesh.position.y > b.top) b.mesh.position.y = b.bottom
    }
    for (let i = 0; i < count; i++) {
      spores[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.08)
      if (spores[i * 3 + 1] > 22) spores[i * 3 + 1] = 0
    }
    sporeGeo.attributes.position.needsUpdate = true
  }
  return { group: lab, animate }
}
