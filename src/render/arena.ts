import * as THREE from 'three'
import { fmtNum } from '../math/format'
import { HoloGrid } from './grid'
import { textSprite } from './labels'
import { COLORS, hdr, SIDE, toWorld, type Plane } from './world'

/** Tallene og navnene på akserne er dæmpede, så glitches og grafer er det, man ser først. */
const AXIS_NUMBER = { color: '#66779b', height: 0.46 }
const AXIS_NAME = { color: '#93a3c2', height: 0.6 }

/** En bane: det, der står stille, og gitteret, der lyser op, når noget bliver ramt. */
export interface Arena {
  group: THREE.Group
  grid: HoloGrid
  /** Det, der bevæger sig i kulissen, fx bobler i laboratoriet. */
  animate?: (dt: number) => void
  /** Hvor meget der sker i kulissen (1 = roligt). Laboratoriet bobler mere, når kolonierne vokser. */
  setActivity?: (level: number) => void
}

/** Farverne i sidebillederne: gitter, bagvæg, jord og den lysende horisontlinje. */
const SIDE_LOOKS = {
  mountains: { grid: 0x6a3fb0, glow: 0xff7ad9, back: 0x12071f, ground: 0x1a0b2c, horizon: COLORS.neonPink },
  lab: { grid: 0x2a8a5c, glow: 0x9dffc4, back: 0x02110a, ground: 0x08190f, horizon: COLORS.liquid },
  core: { grid: 0x8a1f3f, glow: 0xff6688, back: 0x0d0206, ground: 0x140409, horizon: COLORS.boss },
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
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(size + 1, 0.02, 0.05), axisMat)
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, size + 1), axisMat)
  xAxis.position.y = yAxis.position.y = 0.02
  arena.add(xAxis, yAxis)

  for (let v = -half; v <= half; v += 2) {
    if (v === 0) continue
    const onX = textSprite(fmtNum(v), AXIS_NUMBER)
    onX.position.copy(toWorld(v, -0.55, 0.25))
    const onY = textSprite(fmtNum(v), AXIS_NUMBER)
    onY.position.copy(toWorld(-0.6, v, 0.25))
    arena.add(onX, onY)
  }
  const xName = textSprite('x', AXIS_NAME)
  xName.position.copy(toWorld(half + 0.5, 0.5, 0.3))
  const yName = textSprite('y', AXIS_NAME)
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
  const city = buildCity(half)
  const life = buildCityLife(half, city.facades)
  arena.add(city.group, buildStreets(half), life.group)
  return { group: arena, grid, animate: life.animate }
}

/** Et neonskilt med tekst, fx "y = ax + b", tegnet som tekstur. */
function signTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(10, 6, 24, 0.85)'
  ctx.fillRect(0, 0, 256, 96)
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.strokeRect(6, 6, 244, 84)
  ctx.font = '700 46px "Atkinson Hyperlegible", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, 128, 52)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Biler, der flyver i baner bag og over byen med forlygter og en lysstribe bagved, neonskilte, der
 * blinker af og til, og et søgelys, der fejer hen over himlen.
 */
function buildCityLife(half: number, facades: Facade[]): { group: THREE.Group; animate: (dt: number) => void } {
  const life = new THREE.Group()
  let r = 21
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280

  // Flyvende biler i rette baner (man kan næsten se deres forskrift)
  const cars: { mesh: THREE.Group; speed: number; span: number; z: number; y: number; x: number }[] = []
  const headMat = new THREE.MeshBasicMaterial({ color: hdr(0xfff2d0, 2) })
  const tailMat = new THREE.MeshBasicMaterial({ color: hdr(0xff3355, 1.8) })
  const trailMats = [COLORS.neonCyan, COLORS.neonPink, 0xffd166].map(
    (c) =>
      new THREE.MeshBasicMaterial({
        color: hdr(c, 1.4),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
  )
  const bodyGeo = new THREE.BoxGeometry(1.1, 0.26, 0.5)
  const cabinGeo = new THREE.BoxGeometry(0.6, 0.2, 0.44)
  const bodyMats = [0x2b1e4a, 0x16324a, 0x3a1630, 0x2a2a38].map(
    (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 }),
  )
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0c0c16, metalness: 0.8, roughness: 0.2 })
  for (let i = 0; i < 14; i++) {
    const dir = i % 2 === 0 ? 1 : -1
    const car = new THREE.Group()
    const body = new THREE.Mesh(bodyGeo, bodyMats[i % bodyMats.length])
    const cabin = new THREE.Mesh(cabinGeo, cabinMat)
    cabin.position.set(-0.05, 0.22, 0)
    // Forlygter foran og baglygter bagpå (bilen vendes, når den kører mod venstre)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), headMat)
    head.position.set(0.56, 0.02, 0)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), tailMat)
    tail.position.set(-0.56, 0.02, 0)
    const trail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.05), trailMats[i % trailMats.length])
    trail.position.set(-1.4, 0.02, 0)
    car.add(body, cabin, head, tail, trail)
    car.scale.x = dir
    // Hver vej har en bane i hver retning, med højrekørsel set fra kameraet
    const road = ROADS[i % ROADS.length]
    const z = -(half + road.at) + (dir > 0 ? road.width / 4 : -road.width / 4)
    const y = ROAD_Y + 0.15
    const span = 110
    cars.push({ mesh: car, speed: (6 + rand() * 7) * dir, span, z, y, x: (rand() - 0.5) * span })
    life.add(car)
  }

  // Neonskilte skruet fast på facaden af de høje huse i forreste række, tæt på midten
  const signs: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; next: number; off: number }[] = []
  const hosts: Facade[] = []
  for (const f of [...facades].filter((f) => f.h >= 6 && f.w >= 2.6).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))) {
    if (hosts.every((o) => Math.abs(o.x - f.x) >= 9)) hosts.push(f)
  }
  const texts: [string, string][] = [
    ['y = ax + b', '#3ff0ff'],
    ['GRAF', '#ff4fd8'],
    ['x² · 24/7', '#9b6bff'],
    ['GLITCH', '#ffd166'],
  ]
  texts.forEach(([text, color], i) => {
    const host = hosts[i]
    if (!host) return
    const width = Math.min(host.w - 0.4, 4.4)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.375),
      new THREE.MeshBasicMaterial({ map: signTexture(text, color), transparent: true, color: hdr(0xffffff, 1.15) }),
    )
    mesh.position.set(host.x, Math.min(host.h - 1.5, 4.5 + rand() * 2.5), host.front + 0.06)
    signs.push({ mesh, next: 2 + rand() * 6, off: 0 })
    life.add(mesh)
  })

  // Et søgelys bag byen, der fejer frem og tilbage hen over himlen
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9bb8ff,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  )
  beam.geometry.translate(0, -30, 0) // spidsen i lampen, keglen ud fra den
  const pivot = new THREE.Group()
  pivot.position.set(16, 0, -(half + 9))
  beam.rotation.x = Math.PI
  pivot.add(beam)
  life.add(pivot)

  let time = 0
  const animate = (dt: number) => {
    time += dt
    for (const c of cars) {
      c.x += c.speed * dt
      if (c.x > c.span / 2) c.x -= c.span
      if (c.x < -c.span / 2) c.x += c.span
      c.mesh.position.set(c.x, c.y, c.z)
    }
    for (const sign of signs) {
      // Skiltene flimrer kort af og til, som rigtige neonrør
      sign.next -= dt
      if (sign.next <= 0) {
        sign.off = 0.18 + rand() * 0.25
        sign.next = 3 + rand() * 7
      }
      sign.off = Math.max(0, sign.off - dt)
      sign.mesh.material.opacity = sign.off > 0 && Math.floor(sign.off * 30) % 2 === 0 ? 0.15 : 1
    }
    pivot.rotation.z = Math.sin(time * 0.25) * 0.6
    pivot.rotation.x = -0.25 + Math.sin(time * 0.17) * 0.12
  }
  return { group: life, animate }
}

/** Hvor lys en farve opleves (0–1), regnet i lineære farver som gløden. */
function luminance(hex: number): number {
  const c = new THREE.Color(hex)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
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
/** Et hus i forreste række, så skilte kan skrues fast på facaden. */
interface Facade {
  x: number
  w: number
  h: number
  /** z for facaden, der vender ind mod banen. */
  front: number
}

/**
 * Husrækkerne bag banen står med gader imellem, så bilerne kan køre i gaderne uden at ramme husene.
 * Midten af række n ligger i z = −(half + ROWS[n]), og husene er højst ROW_DEPTH dybe.
 */
const ROWS = [8, 19, 30]
const ROW_DEPTH = 4.5
/**
 * Vejene: én lige bag banen og én mellem hver husrække. at er afstanden bag banens kant til vejens
 * midte, width er vejens bredde. Hver vej har en bane i hver retning.
 */
const ROADS = [
  { at: 2.6, width: 2.8 },
  { at: 13.5, width: 3.6 },
  { at: 24.5, width: 3.6 },
]
/** Vejens overflade ligger lige under banens gulv; husene står på jorden lidt længere nede. */
const GROUND_Y = -0.3
const ROAD_Y = -0.28

/** Jord under byen, veje med striber og gadelygter langs vejene. */
function buildStreets(half: number): THREE.Group {
  const streets = new THREE.Group()
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 110),
    new THREE.MeshStandardMaterial({ color: 0x0a0817, roughness: 0.95 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(0, GROUND_Y, -40)
  streets.add(ground)

  const length = 120
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.75, metalness: 0.1 })
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x5a6078 })
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd9c27a })
  const dashGeo = new THREE.BoxGeometry(1.1, 0.02, 0.09)
  const dashesPerRoad = Math.floor(length / 2.4)
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashesPerRoad * ROADS.length)
  const postGeo = new THREE.BoxGeometry(0.08, 1.7, 0.08)
  const lampGeo = new THREE.BoxGeometry(0.42, 0.08, 0.14)
  const lampsPerRoad = Math.floor(length / 9)
  const posts = new THREE.InstancedMesh(
    postGeo,
    new THREE.MeshStandardMaterial({ color: 0x2b2f42, metalness: 0.6 }),
    lampsPerRoad * ROADS.length,
  )
  const lamps = new THREE.InstancedMesh(
    lampGeo,
    new THREE.MeshBasicMaterial({ color: hdr(0xffd9a0, 1.6) }),
    lampsPerRoad * ROADS.length,
  )
  const m = new THREE.Matrix4()
  ROADS.forEach((road, r) => {
    const z = -(half + road.at)
    const surface = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, road.width), asphalt)
    surface.position.set(0, ROAD_Y - 0.01, z)
    streets.add(surface)
    // Kantlinjer på begge sider og en stiplet midterlinje
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, 0.06), edgeMat)
      edge.position.set(0, ROAD_Y, z + side * (road.width / 2 - 0.12))
      streets.add(edge)
    }
    for (let i = 0; i < dashesPerRoad; i++) {
      m.makeTranslation(-length / 2 + i * 2.4 + 1.2, ROAD_Y + 0.005, z)
      dashes.setMatrixAt(r * dashesPerRoad + i, m)
    }
    // Gadelygter på husenes side af vejen
    const lampZ = z - road.width / 2 - 0.25
    for (let i = 0; i < lampsPerRoad; i++) {
      const x = -length / 2 + i * 9 + 4.5
      m.makeTranslation(x, GROUND_Y + 0.85, lampZ)
      posts.setMatrixAt(r * lampsPerRoad + i, m)
      m.makeTranslation(x, GROUND_Y + 1.7, lampZ + 0.16)
      lamps.setMatrixAt(r * lampsPerRoad + i, m)
    }
  })
  streets.add(dashes, posts, lamps)
  return streets
}

function buildCity(half: number): { group: THREE.Group; facades: Facade[] } {
  const city = new THREE.Group()
  const textures = [1, 2, 3, 4].map(windowTexture)
  const neon = [COLORS.neonPink, COLORS.neonCyan, COLORS.neonViolet].map(
    // Lige meget glød i alle farver: lyse farver (cyan) forstærkes mindre end mørke (lyserød, lilla)
    (color) => new THREE.MeshBasicMaterial({ color: hdr(color, Math.min(3, 0.95 / luminance(color))) }),
  )
  let r = 7
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280
  const spots: [number, number, number][] = []
  // Bagved: tre rækker med gader imellem, højere jo længere væk, med huller, så himlen kan ses imellem
  ROWS.forEach((depth, row) => {
    for (let x = -46; x <= 46; x += 5 + rand() * 5) spots.push([x, -(half + depth + (rand() - 0.5) * 2), row])
  })
  // På siderne, kun ud for den bageste halvdel og ikke ude i den forreste gade.
  // Huse tæt på kameraet ville vælte udad i perspektivet
  for (const sx of [-1, 1]) {
    for (let z = -half + 1; z <= 1; z += 4 + rand() * 2) spots.push([sx * (half + 9 + rand() * 6), z, -1])
  }
  const facades: Facade[] = []
  for (const [x, z, row] of spots) {
    const far = Math.min(1, Math.max(0, (Math.abs(z) - half - 6) / 20) + Math.abs(x) / 80)
    const w = 2.5 + rand() * 3
    const d = 2.5 + rand() * (ROW_DEPTH - 2.5)
    const h = 4 + rand() * (6 + far * 12) + far * 10
    const map = textures[Math.floor(rand() * textures.length)].clone()
    map.repeat.set(Math.max(1, Math.round(w / 2.5)), Math.max(1, Math.round(h / 4)))
    map.needsUpdate = true
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: COLORS.building,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.95,
        roughness: 0.9,
      }),
    )
    building.position.set(x, h / 2 - 0.3, z)
    city.add(building)
    if (row === 0) facades.push({ x, w, h, front: z + d / 2 })
    if (rand() < 0.45) {
      // Neonlister langs tagkanten (kun kanten, så taget ikke ligner en farvet plade)
      const mat = neon[Math.floor(rand() * neon.length)]
      const t = 0.07
      for (const [sx, sz, lx, lz] of [
        [0, d / 2, w, t],
        [0, -d / 2, w, t],
        [w / 2, 0, t, d],
        [-w / 2, 0, t, d],
      ]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(lx + t, 0.08, lz + t), mat)
        strip.position.set(x + sx, h - 0.3, z + sz)
        city.add(strip)
      }
    }
  }
  // En stor solnedgangssol bag byen, som i en synthwave-plakat
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshBasicMaterial({ color: COLORS.citySun, fog: false, transparent: true, opacity: 0.85 }),
  )
  sun.position.set(0, 10, -75)
  city.add(sun)
  return { group: city, facades }
}

export interface SideArenaOptions {
  /** Hvor matematikkens koordinater står i 3D. SIDE har x fra −half til half, GROWTH fra 0 til 2·half. */
  plane?: Plane
  xFrom?: number
  xTo?: number
  /** Bjerge (Parabelbjergene), glaskolber (Vækstlaboratoriet) eller Kernen (Finalen) i baggrunden. */
  scenery?: 'mountains' | 'lab' | 'core'
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
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(2 * half + 1, 0.045, 0.045), axisMat)
  xAxis.position.set(0, 0.01, 0)
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.045, top + 0.6, 0.045), axisMat)
  yAxis.position.copy(plane.toWorld(0, (top + 0.6) / 2))
  arena.add(xAxis, yAxis)

  // Tallene på x-aksen står på jorden lige foran aksen. Under aksen ville jorden skjule dem.
  for (let v = xFrom; v <= xTo; v += 2) {
    if (v === 0) continue
    const label = textSprite(fmtNum(v), AXIS_NUMBER)
    label.position.copy(plane.toWorld(v, 0.22, 1.1))
    arena.add(label)
  }
  for (let v = 2; v <= top; v += 2) {
    const label = textSprite(fmtNum(v), AXIS_NUMBER)
    label.position.copy(plane.toWorld(-0.6, v, 0.1))
    arena.add(label)
  }
  const xName = textSprite('x', AXIS_NAME)
  xName.position.copy(plane.toWorld(xTo + 0.6, 0.5, 0.2))
  const yName = textSprite('y', AXIS_NAME)
  yName.position.copy(plane.toWorld(0.5, top + 0.5, 0.2))
  arena.add(xName, yName)

  const scene: { group: THREE.Group; animate?: (dt: number) => void; setActivity?: (k: number) => void } =
    scenery === 'lab' ? buildLab() : scenery === 'core' ? buildCore() : buildMountains()
  arena.add(scene.group)
  return { group: arena, grid, animate: scene.animate, setActivity: scene.setActivity }
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

  // Stjerneskud: lange, tynde lysstriber, der af og til farer skråt ned over himlen
  const shooting = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.06, 0.06),
      new THREE.MeshBasicMaterial({
        color: hdr(0xffffff, 2),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    )
    group.add(mesh)
    return { mesh, t: -1, from: new THREE.Vector3(), dir: new THREE.Vector3() }
  })
  let nextStar = 2

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

  let time = 0
  const animate = (dt: number) => {
    time += dt
    // Solen ånder langsomt
    sun.scale.setScalar(1 + Math.sin(time * 0.6) * 0.015)
    nextStar -= dt
    if (nextStar <= 0) {
      nextStar = 2.5 + rand() * 4
      const star = shooting.find((s) => s.t < 0)
      if (star) {
        star.t = 0
        star.from.set((rand() - 0.5) * 70, 26 + rand() * 18, -52)
        star.dir.set(rand() < 0.5 ? -1 : 1, -0.45 - rand() * 0.3, 0).normalize()
        star.mesh.rotation.z = Math.atan2(star.dir.y, star.dir.x)
      }
    }
    for (const s of shooting) {
      if (s.t < 0) continue
      s.t += dt
      const life = 0.9
      s.mesh.position.copy(s.from).addScaledVector(s.dir, s.t * 38)
      s.mesh.material.opacity = Math.max(0, 1 - s.t / life)
      if (s.t > life) {
        s.t = -1
        s.mesh.material.opacity = 0
      }
    }
  }
  return { group, animate }
}

/** Glaskolber med lysende væske og bobler, rør på væggen og sporer, der svæver op. */
function buildLab(): {
  group: THREE.Group
  animate: (dt: number) => void
  setActivity: (level: number) => void
} {
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

  let activity = 1
  const setActivity = (level: number) => {
    activity = level
  }
  const animate = (dt: number) => {
    for (const b of bubbles) {
      b.mesh.position.y += b.speed * activity * dt
      if (b.mesh.position.y > b.top) b.mesh.position.y = b.bottom
    }
    for (let i = 0; i < count; i++) {
      spores[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.08) * (0.6 + activity * 0.4)
      if (spores[i * 3 + 1] > 22) spores[i * 3 + 1] = 0
    }
    sporeGeo.attributes.position.needsUpdate = true
  }
  return { group: lab, animate, setActivity }
}

/** Finalen: Kernen som et kæmpe roterende glitch-krystal og "dataregn", der falder i baggrunden. */
function buildCore(): { group: THREE.Group; animate: (dt: number) => void } {
  const group = new THREE.Group()
  const crystal = (radius: number, color: number, strength: number) => {
    const geo = new THREE.IcosahedronGeometry(radius, 1)
    const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x14030a, flatShading: true }))
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: hdr(color, strength) }),
    )
    const g = new THREE.Group()
    g.add(solid, edges)
    return g
  }
  const outer = crystal(15, COLORS.boss, 1.5)
  outer.position.set(0, 12, -46)
  const inner = crystal(6, 0xffb347, 2)
  inner.position.set(0, 12, -38)
  group.add(outer, inner)

  // Dataregn: lodrette streger, der falder
  const count = 140
  const drops = new Float32Array(count * 6)
  let r = 5
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280
  const speeds: number[] = []
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 80
    const y = rand() * 30
    const z = -14 - rand() * 18
    drops.set([x, y, z, x, y + 0.6 + rand() * 1.2, z], i * 6)
    speeds.push(3 + rand() * 6)
  }
  const dropGeo = new THREE.BufferGeometry()
  dropGeo.setAttribute('position', new THREE.BufferAttribute(drops, 3))
  group.add(
    new THREE.LineSegments(
      dropGeo,
      new THREE.LineBasicMaterial({ color: hdr(0xff5577, 1.3), transparent: true, opacity: 0.7 }),
    ),
  )

  const animate = (dt: number) => {
    outer.rotation.y += dt * 0.08
    outer.rotation.x += dt * 0.03
    inner.rotation.y -= dt * 0.25
    inner.rotation.z += dt * 0.15
    for (let i = 0; i < count; i++) {
      const fall = speeds[i] * dt
      drops[i * 6 + 1] -= fall
      drops[i * 6 + 4] -= fall
      if (drops[i * 6 + 4] < -1) {
        drops[i * 6 + 1] += 32
        drops[i * 6 + 4] += 32
      }
    }
    dropGeo.attributes.position.needsUpdate = true
  }
  return { group, animate }
}
