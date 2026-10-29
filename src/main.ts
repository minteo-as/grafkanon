import './style.css';
import { Sfx } from './audio/sfx';
import { Game, type Shot } from './game/game';
import { LEVELS } from './game/levels';
import { loadProgress, recordLevel, saveProgress } from './game/progress';
import { hitIncrement } from './game/scoring';
import { ARENA_HALF } from './game/waves';
import { buildArena } from './render/arena';
import { AimLine, Beam } from './render/beam';
import { Effects } from './render/effects';
import { EnemyLayer } from './render/enemies';
import { Turret } from './render/turret';
import { World } from './render/world';
import { Controls } from './ui/controls';
import { fmtScore, Hud } from './ui/hud';
import { Menu } from './ui/menu';

const STAR_TIPS = [
  '',
  'Klar alle bølger uden ekstra skud for at få ★★.',
  'Slå hjælpen fra fra banens start for at få ★★★.',
  'Alle tre stjerner. Flot!',
];

async function main(): Promise<void> {
  // Vent kort på skrifttyperne, så tallene i 3D tegnes med den rigtige font
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);

  const stage = document.getElementById('stage')!;
  let world: World;
  try {
    world = new World(stage);
  } catch (err) {
    console.error(err);
    stage.classList.add('no-webgl');
    return;
  }

  const progress = loadProgress();
  const sfx = new Sfx();
  sfx.setMuted(progress.muted);

  const game = new Game();
  // Kun under udvikling: gør spillet tilgængeligt i konsollen til fejlfinding
  if (import.meta.env.DEV) Object.assign(window, { __game: game });
  buildArena(world.scene, ARENA_HALF);
  const turret = new Turret(world.scene, ARENA_HALF);
  const aim = new AimLine(world.scene);
  const beam = new Beam(world.scene);
  const effects = new Effects(world.scene);
  const enemies = new EnemyLayer(world.scene, effects);
  const hud = new Hud();

  let levelIndex = 0;
  let inLevel = false; // en bane er i gang og kan fortsættes fra menuen
  let shot: Shot | null = null;
  let killed = 0;

  const refresh = () => {
    hud.update(game);
    controls.setFireEnabled(game.phase === 'aiming' && game.ammo > 0);
  };

  const showLine = () => {
    const segment = game.segment;
    controls.showLine(game.line, segment);
    aim.set(game.line, segment, game.help.aimLine);
    turret.aimAt(game.line, segment);
  };

  const loadWave = () => {
    hud.hideOverlay();
    enemies.set(game.enemies, game.help.coordinates);
    hud.hint(game.hint);
    refresh();
  };

  const retryButton = { label: 'Prøv bølgen igen', primary: true, onClick: () => { sfx.click(); game.retryWave(); loadWave(); } };

  const toggleSound = () => {
    progress.muted = !progress.muted;
    sfx.setMuted(progress.muted);
    saveProgress(progress);
    controls.setMuted(progress.muted);
    menu.setMuted(progress.muted);
    sfx.unlock();
    sfx.click();
  };

  const startLevel = (index: number) => {
    sfx.unlock();
    sfx.click();
    levelIndex = index;
    inLevel = true;
    game.startLevel(LEVELS[index]);
    menu.hide();
    controls.enabled = true;
    loadWave();
  };

  const openMenu = () => {
    controls.enabled = false;
    menu.show(progress, inLevel, progress.muted);
  };

  const closeMenu = () => {
    sfx.click();
    menu.hide();
    controls.enabled = true;
  };

  const menu = new Menu({ onPlay: startLevel, onContinue: closeMenu, onToggleSound: toggleSound });

  const controls = new Controls({
    onLine: line => {
      game.setLine(line);
      showLine();
    },
    onHelp: help => {
      game.setHelp(help);
      aim.set(game.line, game.segment, help.aimLine);
      enemies.setCoordinatesVisible(help.coordinates);
      refresh();
    },
    onFire: () => {
      if (game.phase !== 'aiming' || hud.overlayVisible) return;
      if (!game.segment) {
        hud.toast('Linjen rammer ikke banen');
        return;
      }
      shot = game.fire();
      if (!shot) return;
      killed = 0;
      beam.start(shot);
      turret.kick();
      sfx.laser();
      refresh();
    },
    onMenu: openMenu,
    onToggleSound: toggleSound,
  });
  controls.setMuted(progress.muted);

  document.addEventListener('keydown', ev => {
    if (ev.code === 'Escape' && menu.visible && inLevel) {
      ev.preventDefault();
      closeMenu();
    }
  });

  const showLevelComplete = () => {
    const result = game.levelResult!;
    const level = LEVELS[levelIndex];
    const newBest = recordLevel(progress, level.id, result);
    saveProgress(progress);
    inLevel = false;
    const hasNext = levelIndex + 1 < LEVELS.length;
    hud.showOverlay({
      title: `${level.name} klaret`,
      text: `${fmtScore(result.score)} point${newBest ? ' · ny rekord' : ''}. ${STAR_TIPS[result.stars]}`,
      stars: result.stars,
      onStar: i => sfx.star(i),
      buttons: [
        ...(hasNext ? [{ label: 'Næste bane', primary: true, onClick: () => startLevel(levelIndex + 1) }] : []),
        { label: 'Spil banen igen', primary: !hasNext, onClick: () => startLevel(levelIndex) },
        { label: 'Menu', onClick: () => { sfx.click(); openMenu(); } },
      ],
    });
  };

  const finishShot = () => {
    const out = game.completeShot();
    shot = null;
    if (out.hits === 0) {
      hud.toast('Forbi!');
      sfx.miss();
    } else if (out.hits > 1) hud.toast(`${out.hits} på én linje!`);
    refresh();

    if (out.phase === 'cleared') {
      if (game.levelResult) {
        window.setTimeout(showLevelComplete, 700);
        return;
      }
      sfx.waveCleared();
      const text = out.bonus
        ? `${fmtScore(game.pointsThisWave)} point i bølgen, heraf ${fmtScore(out.bonus)} i bonus for ${game.ammo} skud til overs.`
        : `${fmtScore(game.pointsThisWave)} point i bølgen.`;
      const done = game.waveNumber;
      window.setTimeout(() => {
        hud.showOverlay({
          title: `Bølge ${done} af ${game.waveCount} klaret`,
          text,
          buttons: [{ label: 'Næste bølge', primary: true, onClick: () => { sfx.click(); game.nextWave(); loadWave(); } }],
        });
      }, 650);
    } else if (out.phase === 'outOfAmmo') {
      const left = game.aliveCount;
      sfx.fail();
      window.setTimeout(() => {
        hud.showOverlay({
          title: 'Ikke flere skud',
          text: `${left} ${left === 1 ? 'glitch' : 'glitches'} tilbage. Kig efter dem, der står på samme linje.`,
          buttons: [retryButton],
        });
      }, 650);
    }
  };

  let visible = true;
  new IntersectionObserver(entries => (visible = entries[0].isIntersecting)).observe(stage);

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      const running = inLevel && !menu.visible && !hud.overlayVisible && !document.hidden;
      if (running) {
        const event = game.update(dt);
        if (event === 'hop') sfx.hop();
        if (event === 'escaped') {
          sfx.escaped();
          refresh();
          hud.showOverlay({
            title: 'En marchør slap væk',
            text: 'Den nåede kanten af banen. Prøv igen, og skyd marchørerne først.',
            buttons: [retryButton],
          });
        }
        hud.updateMarch(game);
      }
      turret.update(dt);
      enemies.update(dt, game.enemies);
      effects.update(dt);
      const progressOfBeam = beam.update(dt);
      if (shot && progressOfBeam) {
        while (killed < shot.hits.length && shot.hits[killed].x <= progressOfBeam.headX + 1e-6) {
          killed++;
          enemies.kill(shot.hits[killed - 1].id, `+${fmtScore(hitIncrement(killed, shot.multiplier))}`);
          sfx.hit(killed - 1);
          world.shake(0.35);
        }
        if (progressOfBeam.done) finishShot();
      }
      world.render(dt);
    }
    requestAnimationFrame(tick);
  };

  game.setHelp(controls.help);
  showLine();
  openMenu();
  requestAnimationFrame(tick);
}

main();
