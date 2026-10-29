import * as THREE from 'three';
import type { Enemy } from '../game/game';
import { fmtPoint } from '../math/format';
import { disposeSprite, textSprite } from './labels';
import { COLORS, prefersReducedMotion, toWorld } from './world';

const BODY_HEIGHT = 0.6;
const SPAWN_TIME = 0.35;
const DIE_TIME = 0.3;

interface View {
  group: THREE.Group;
  body: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
  phase: number;
  age: number;
  delay: number;
  dying: number; // 0 = lever, > 0 = sekunder siden den blev ramt
}

const bodyGeo = new THREE.IcosahedronGeometry(0.42, 0);
const ringGeo = new THREE.RingGeometry(0.32, 0.46, 20);
const shardGeo = new THREE.TetrahedronGeometry(0.13);

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export class EnemyLayer {
  private views = new Map<number, View>();
  private particles: Particle[] = [];
  private shardMat = new THREE.MeshBasicMaterial({ color: COLORS.enemy });
  private time = 0;
  private reduced = prefersReducedMotion();

  constructor(private scene: THREE.Scene) {}

  /** Erstatter alle glitches med en ny bølge. */
  set(enemies: Enemy[], showCoordinates: boolean): void {
    for (const v of this.views.values()) this.remove(v);
    this.views.clear();
    enemies.forEach((e, i) => {
      const group = new THREE.Group();
      group.position.copy(toWorld(e.x, e.y));
      const body = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ color: COLORS.enemy, emissive: COLORS.enemyGlow, flatShading: true, transparent: true }),
      );
      body.position.y = BODY_HEIGHT;
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: COLORS.enemy, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      const label = textSprite(fmtPoint(e.x, e.y), { color: '#ffe3d6', background: 'rgba(60,20,8,0.85)', height: 0.5 });
      label.position.y = 1.35;
      label.visible = showCoordinates;
      group.add(body, ring, label);
      group.scale.setScalar(0.001);
      this.scene.add(group);
      this.views.set(e.id, { group, body, label, phase: i * 1.3 + Math.random(), age: 0, delay: i * 0.07, dying: 0 });
    });
  }

  setCoordinatesVisible(visible: boolean): void {
    for (const v of this.views.values()) if (v.dying === 0) v.label.visible = visible;
  }

  kill(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v || v.dying > 0) return null;
    v.dying = 1e-4;
    v.label.visible = false;
    const origin = v.group.position.clone().setY(BODY_HEIGHT);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(shardGeo, this.shardMat);
      mesh.position.copy(origin);
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).multiplyScalar(7);
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.7 });
    }
    return origin;
  }

  update(dt: number): void {
    this.time += dt;
    for (const v of this.views.values()) {
      v.age += dt;
      if (v.dying === 0) {
        const t = Math.min(1, Math.max(0, (v.age - v.delay) / SPAWN_TIME));
        v.group.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        if (!this.reduced) {
          v.body.position.y = BODY_HEIGHT + Math.sin(this.time * 2.2 + v.phase) * 0.08;
          v.body.rotation.y += dt * 0.9;
          v.body.rotation.x += dt * 0.4;
        }
      } else if (v.group.visible) {
        v.dying += dt;
        v.body.scale.setScalar(1 + v.dying * 4);
        v.body.material.opacity = Math.max(0, 1 - v.dying / DIE_TIME);
        if (v.dying > DIE_TIME) v.group.visible = false;
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.7));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  private remove(v: View): void {
    this.scene.remove(v.group);
    v.body.material.dispose();
    disposeSprite(v.label);
  }
}
