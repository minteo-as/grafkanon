import './style.css'
import { Sfx } from './audio/sfx'
import { Game, HIT_RADIUS, type Shot } from './game/game'
import { weeklyChallenge } from './game/challenge'
import { LEVELS, type Level } from './game/levels'
import { loadProgress, recordLevel, saveProgress } from './game/progress'
import { hitIncrement } from './game/scoring'
import { ARENA_HALF, canHit, SIDE_TOP, type BossKind } from './game/waves'
import { buildFloorArena, buildSideArena } from './render/arena'
import { AimLine, Beam } from './render/beam'
import { BarrierLayer } from './render/barriers'
import { Effects } from './render/effects'
import { EnemyLayer } from './render/enemies'
import { Grenade } from './render/grenade'
import { Turret } from './render/turret'
import { WallLayer } from './render/walls'
import { COLORS, FLOOR, GROWTH, prefersReducedMotion, SIDE, THEMES, World, type Plane } from './render/world'
import { Controls } from './ui/controls'
import { fmtScore, Hud } from './ui/hud'
import { fmtNum } from './math/format'
import { Menu } from './ui/menu'

/** Bossernes drillerier: når bølgen starter, og når de bliver ramt. */
const TAUNTS: Record<BossKind, { start: string; hurt: string[] }> = {
  twins: {
    start: 'Vi er to. Du rammer aldrig begge på én gang!',
    hurt: ['Av! Det var bare held!', 'Okay… du kan godt regne.'],
  },
  curve: {
    start: 'Følg min bane, hvis du kan!',
    hurt: ['Hvordan fandt du mit toppunkt?!', 'Grr! Så skifter jeg form!'],
  },
  colony: {
    start: 'Vi vokser hurtigere, end du kan regne!',
    hurt: ['Hvem har lært dig procent?!', 'Vi vokser bare igen!'],
  },
}

const STAR_TIPS = [
  '',
  'Klar alle bølger uden ekstra skud for at få ★★.',
  'Slå hjælpen fra fra banens start for at få ★★★.',
  'Alle tre stjerner. Flot!',
]

async function main(): Promise<void> {
  // Vent kort på skrifttyperne, så tallene i 3D tegnes med den rigtige font
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])

  const stage = document.getElementById('stage')!
  let world: World
  try {
    world = new World(stage)
  } catch (err) {
    console.error(err)
    stage.classList.add('no-webgl')
    return
  }

  document.getElementById('version')!.textContent = `Version ${__APP_VERSION__}`

  const progress = loadProgress()
  const sfx = new Sfx()
  sfx.setMuted(progress.muted)

  const game = new Game()
  // Kun under udvikling: gør spillet tilgængeligt i konsollen til fejlfinding
  if (import.meta.env.DEV) Object.assign(window, { __game: game })
  const floorArena = buildFloorArena(ARENA_HALF)
  const sideArena = buildSideArena(ARENA_HALF, SIDE_TOP)
  const growthArena = buildSideArena(ARENA_HALF, SIDE_TOP, {
    plane: GROWTH,
    xFrom: 0,
    xTo: 2 * ARENA_HALF,
    scenery: 'lab',
  })
  const ARENAS = { laser: floorArena, grenade: sideArena, rocket: growthArena }
  const THEME_OF = { laser: THEMES.city, grenade: THEMES.mountains, rocket: THEMES.lab }
  sideArena.group.visible = growthArena.group.visible = false
  world.scene.add(floorArena.group, sideArena.group, growthArena.group)
  const turret = new Turret(world.scene, ARENA_HALF)
  const aim = new AimLine(world.scene)
  const beam = new Beam(world.scene)
  const grenade = new Grenade(world.scene)
  const walls = new WallLayer(world.scene)
  const barriers = new BarrierLayer(world.scene, ARENA_HALF)
  const effects = new Effects(world.scene)
  const enemies = new EnemyLayer(world.scene, effects)
  const hud = new Hud()

  /** Banen, der spilles. index er null for ugens udfordring, som ikke er en del af kampagnen. */
  let current: { level: Level; index: number | null; seed?: number } = { level: LEVELS[0], index: 0 }
  let inLevel = false // en bane er i gang og kan fortsættes fra menuen
  let shot: Shot | null = null
  let killed = 0
  let finalShot = false // skuddet rammer bølgens sidste glitch
  let hitStop = 0 // sekunder, hvor skuddet næsten står stille efter et træf
  let slowMo = 0 // sekunder i slowmotion efter bølgens sidste træf
  const reducedMotion = prefersReducedMotion()

  /** Glitches, som sigtet går igennem lige nu, bliver bange (kun når sigtelinjen er slået til). */
  const refreshTargets = () => {
    const result = game.path
    if (!result.ok || !game.help.aimLine || game.phase !== 'aiming') return enemies.setTargeted([])
    const on = game.enemies.filter(
      (e) => e.alive && canHit(game.aim, e) && result.path.distanceTo(e.x, e.y) < HIT_RADIUS,
    )
    enemies.setTargeted(on.map((e) => e.id))
  }

  const refresh = () => {
    hud.update(game)
    controls.setFireEnabled(game.phase === 'aiming' && game.ammo > 0)
  }

  const showAim = () => {
    const result = game.path
    const path = result.ok ? result.path : null
    controls.showAim(game.aim, result.ok ? null : result.reason)
    refreshBarriers()
    aim.set(path, game.help.aimLine)
    turret.aimAlong(path)
    refreshTargets()
  }

  /** Laseren skyder på gulvet, granaten i sidebilledet og raketten i laboratoriets sidebillede. */
  const PLANES: Record<typeof game.weapon, Plane> = { laser: FLOOR, grenade: SIDE, rocket: GROWTH }
  const applyWeapon = () => {
    const plane = PLANES[game.weapon]
    world.setView(plane.view)
    world.setTheme(THEME_OF[game.weapon])
    for (const [weapon, arena] of Object.entries(ARENAS)) arena.group.visible = weapon === game.weapon
    turret.setPlane(plane)
    aim.setPlane(plane)
    enemies.setPlane(plane)
    controls.setWeapon(game.weapon, { locked: game.level.locked, form: game.level.form })
    showAim()
  }

  const loadWave = () => {
    hud.hideOverlay()
    controls.setLinearAvailable(!!game.spec.linear)
    enemies.set(game.enemies, game.help.coordinates)
    walls.set(game.walls)
    showAim()
    hud.hint(game.hint)
    refresh()
    if (game.spec.boss) window.setTimeout(() => enemies.say(TAUNTS[game.spec.boss!.kind].start), 600)
  }

  /** Barrierer findes kun i bølger, der har nogen; fanen viser, hvor mange der er tilbage. */
  const refreshBarriers = () => controls.setBarrierCharges(game.barrierCharges, (game.spec.barriers ?? 0) > 0)

  const retryButton = {
    label: 'Prøv bølgen igen',
    primary: true,
    onClick: () => {
      sfx.click()
      game.retryWave()
      loadWave()
    },
  }

  const toggleSound = () => {
    progress.muted = !progress.muted
    sfx.setMuted(progress.muted)
    saveProgress(progress)
    controls.setMuted(progress.muted)
    menu.setMuted(progress.muted)
    sfx.unlock()
    sfx.click()
  }

  const play = (next: typeof current) => {
    sfx.unlock()
    sfx.click()
    current = next
    inLevel = true
    game.startLevel(next.level, next.seed)
    applyWeapon()
    menu.hide()
    controls.enabled = true
    loadWave()
  }

  const startLevel = (index: number) => play({ level: LEVELS[index], index })

  /** Ugen findes først, når man starter, så en ny uge også slår igennem uden genindlæsning. */
  const startChallenge = () => {
    const { level, seed } = weeklyChallenge()
    play({ level, index: null, seed })
  }

  const replay = () => (current.index === null ? play(current) : startLevel(current.index))

  const openMenu = () => {
    controls.enabled = false
    menu.show(progress, weeklyChallenge(), inLevel, progress.muted)
  }

  const closeMenu = () => {
    sfx.click()
    menu.hide()
    controls.enabled = true
  }

  const menu = new Menu({
    onPlay: startLevel,
    onChallenge: startChallenge,
    onContinue: closeMenu,
    onToggleSound: toggleSound,
  })

  const controls = new Controls({
    onAim: (next) => {
      game.setAim(next)
      showAim()
    },
    onHelp: (help) => {
      game.setHelp(help)
      const result = game.path
      aim.set(result.ok ? result.path : null, help.aimLine)
      enemies.setCoordinatesVisible(help.coordinates)
      refreshTargets()
      refresh()
    },
    onFire: () => {
      if (game.phase !== 'aiming' || hud.overlayVisible) return
      if (controls.tool === 'barrier') {
        const { axis, k } = controls.barrierAim
        if (game.placeBarrier(axis, k)) {
          sfx.barrier()
          hud.toast(`Barriere ${axis} = ${fmtNum(k)}`)
        }
        refreshBarriers()
        return
      }
      if (!game.path.ok) {
        hud.toast(
          game.weapon === 'laser'
            ? 'Linjen rammer ikke banen'
            : game.weapon === 'rocket'
              ? 'Raketten kan ikke starte der'
              : 'Den bue kan ikke skydes',
        )
        return
      }
      shot = game.fire()
      if (!shot) return
      killed = 0
      enemies.setTargeted([])
      // Rammer skuddet de sidste glitches, uden at nye dukker op bagefter?
      finalShot = shot.hits.length > 0 && game.aliveCount === 0 && !game.bossLives && !shot.hits.some((e) => e.splits)
      turret.kick()
      if (game.weapon === 'laser') {
        beam.start(shot)
        sfx.laser()
      } else if (game.weapon === 'rocket') {
        grenade.start(shot, GROWTH, 'rocket')
        sfx.rocket()
      } else {
        grenade.start(shot, SIDE, 'grenade')
        sfx.grenade()
      }
      refresh()
    },
    onMenu: openMenu,
    onToggleSound: toggleSound,
    onBarrierPreview: (b) => barriers.preview(b),
  })
  controls.setMuted(progress.muted)

  document.addEventListener('keydown', (ev) => {
    // Esc, der lige har åbnet menuen (håndteret i Controls), må ikke også lukke den igen
    if (ev.defaultPrevented) return
    if (ev.code === 'Escape' && menu.visible && inLevel) {
      ev.preventDefault()
      closeMenu()
    }
  })

  const showLevelComplete = () => {
    const result = game.levelResult!
    const { level, index } = current
    const newBest = recordLevel(progress, level.id, result)
    saveProgress(progress)
    inLevel = false
    const next = index !== null && index + 1 < LEVELS.length ? index + 1 : null
    const challenge = index === null
    hud.showOverlay({
      title: challenge ? `Ugens udfordring klaret` : `${level.name} klaret`,
      text: challenge
        ? `${fmtScore(result.score)} point${newBest ? ' · ny rekord' : ''}. Alle har fået de samme bølger, så sammenlign med klassen.`
        : `${fmtScore(result.score)} point${newBest ? ' · ny rekord' : ''}. ${STAR_TIPS[result.stars]}`,
      stars: result.stars,
      onStar: (i) => sfx.star(i),
      buttons: [
        ...(next !== null ? [{ label: 'Næste bane', primary: true, onClick: () => startLevel(next) }] : []),
        { label: challenge ? 'Prøv igen' : 'Spil banen igen', primary: next === null, onClick: replay },
        {
          label: 'Menu',
          onClick: () => {
            sfx.click()
            openMenu()
          },
        },
      ],
    })
  }

  const finishShot = () => {
    const out = game.completeShot()
    shot = null
    if (out.spawned.length) {
      enemies.add(out.spawned)
      for (const e of out.spawned) {
        // Delerens spejlbillede: vis spejlingen i y-aksen med en streg fra den gamle plads
        if (!e.boss) effects.mirrorLink(FLOOR.toWorld(-e.x, e.y, 0.6), FLOOR.toWorld(e.x, e.y, 0.6), COLORS.splitter)
      }
    }
    if (out.boss === 'hurt') {
      hud.toast('Bossen er ramt! Den dukker op igen')
      sfx.bossHurt()
      world.shake(0.8)
      const lines = TAUNTS[game.spec.boss!.kind].hurt
      window.setTimeout(() => enemies.say(lines[(game.bossLives ?? 1) % lines.length]), 500)
    } else if (out.boss === 'defeated') {
      hud.toast('Bossen er besejret!')
      sfx.bossHurt()
      world.shake(1)
    } else if (out.hits === 0) {
      hud.toast('Forbi!')
      sfx.miss()
    } else if (out.spawned.length) hud.toast('Deleren delte sig!')
    refresh()
    refreshTargets()

    if (out.phase === 'cleared') {
      if (game.levelResult) {
        window.setTimeout(showLevelComplete, 700)
        return
      }
      sfx.waveCleared()
      const text = out.bonus
        ? `${fmtScore(game.pointsThisWave)} point i bølgen, heraf ${fmtScore(out.bonus)} i bonus for ${game.ammo} skud til overs.`
        : `${fmtScore(game.pointsThisWave)} point i bølgen.`
      const done = game.waveNumber
      window.setTimeout(() => {
        hud.showOverlay({
          title: `Bølge ${done} af ${game.waveCount} klaret`,
          text,
          buttons: [
            {
              label: 'Næste bølge',
              primary: true,
              onClick: () => {
                sfx.click()
                game.nextWave()
                loadWave()
              },
            },
          ],
        })
      }, 650)
    } else if (out.phase === 'outOfAmmo') {
      const left = game.aliveCount
      sfx.fail()
      window.setTimeout(() => {
        hud.showOverlay({
          title: 'Ikke flere skud',
          text:
            game.weapon === 'laser'
              ? `${left} ${left === 1 ? 'glitch' : 'glitches'} tilbage. Kig efter dem, der står på samme linje.`
              : game.weapon === 'rocket'
                ? `${left} mål tilbage. Kig efter droner, der vokser med den samme faktor.`
                : `${left} mål tilbage. Kig efter droner, der kan ligge på samme bue.`,
          buttons: [retryButton],
        })
      }, 650)
    }
  }

  let visible = true
  new IntersectionObserver((entries) => (visible = entries[0].isIntersecting)).observe(stage)

  let last = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (visible) {
      const running = inLevel && !menu.visible && !hud.overlayVisible && !document.hidden
      if (running) {
        const event = game.update(dt)
        if (event === 'hop') {
          sfx.hop()
          refreshTargets()
        }
        if (event === 'escaped') {
          sfx.escaped()
          refresh()
          hud.showOverlay({
            title: 'En marchør slap væk',
            text: 'Den nåede kanten af banen. Prøv igen, og skyd marchørerne først.',
            buttons: [retryButton],
          })
        }
        hud.updateMarch(game)
      }
      // Hit-stop og slowmotion bremser skuddet og effekterne, men ikke kameraet og menuerne
      const scale = hitStop > 0 ? 0.08 : slowMo > 0 ? 0.3 : 1
      hitStop = Math.max(0, hitStop - dt)
      slowMo = Math.max(0, slowMo - dt)
      const gdt = dt * scale
      barriers.update(game.barriers)
      turret.update(dt)
      enemies.setLook(world.camera.position, turret.position)
      enemies.update(gdt, game.enemies)
      effects.update(gdt)
      ARENAS[game.weapon].grid.update(dt)
      if (!reducedMotion) ARENAS[game.weapon].animate?.(dt)
      const flight = grenade.update(gdt)
      if (flight?.landed && shot && shot.path.end !== 'edge') {
        effects.explosion(flight.at, COLORS.beam, 'side')
        sfx.boom()
        world.shake(0.45)
      }
      const progressOfBeam = beam.update(gdt) ?? flight
      if (shot && progressOfBeam) {
        while (killed < shot.hits.length && shot.hits[killed].x <= progressOfBeam.headX + 1e-6) {
          killed++
          const target = shot.hits[killed - 1]
          enemies.kill(target.id, `+${fmtScore(hitIncrement(killed, shot.multiplier))}`)
          ARENAS[game.weapon].grid.ripple(PLANES[game.weapon].toWorld(target.x, target.y))
          sfx.hit(killed - 1)
          world.shake(0.35)
          if (killed >= 2) hud.combo(killed)
          if (!reducedMotion) hitStop = 0.05
          // Bølgens sidste glitch: slowmotion, lysglimt og et ekstra ryk
          if (finalShot && killed === shot.hits.length) {
            if (!reducedMotion) slowMo = 0.55
            hud.flash()
            world.shake(0.7)
          }
        }
        if (progressOfBeam.done) finishShot()
      }
      world.render(dt)
    }
    requestAnimationFrame(tick)
  }

  game.setHelp(controls.help)
  applyWeapon()
  openMenu()
  requestAnimationFrame(tick)
}

main()
