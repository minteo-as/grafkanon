import * as THREE from 'three';
import { disposeSprite, textSprite } from './labels';

interface Effect {
  object: THREE.Object3D;
  age: number;
  life: number;
  step(e: Effect, dt: number, t: number): void;
  dispose?(): void;
}

const shardGeo = new THREE.TetrahedronGeometry(0.13);
const ringGeo = new THREE.RingGeometry(0.42, 0.56, 36);
const flashGeo = new THREE.SphereGeometry(0.6, 12, 8);

/** Kortlivede effekter: eksplosioner, chokbølger og flydende point. */
export class Effects {
  private items: Effect[] = [];

  constructor(private scene: THREE.Scene) {}

  explosion(at: THREE.Vector3, color: number): void {
    // Hvidt glimt
    const flash = new THREE.Mesh(
      flashGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flash.position.copy(at);
    this.add(flash, 0.18, (e, _dt, t) => {
      e.object.scale.setScalar(1 + t * 1.5);
      (flash.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }, () => (flash.material as THREE.Material).dispose());

    // Chokbølge langs gulvet
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.05, at.z);
    this.add(ring, 0.45, (e, _dt, t) => {
      e.object.scale.setScalar(1 + t * 4);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    }, () => (ring.material as THREE.Material).dispose());

    // Splinter i to farver
    const mats = [new THREE.MeshBasicMaterial({ color }), new THREE.MeshBasicMaterial({ color: 0xffd166 })];
    for (let i = 0; i < 18; i++) {
      const shard = new THREE.Mesh(shardGeo, mats[i % 2]);
      shard.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.35, Math.random() - 0.5).multiplyScalar(5 + Math.random() * 4);
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(14);
      this.add(shard, 0.55 + Math.random() * 0.3, (e, dt, t) => {
        v.y -= 18 * dt;
        e.object.position.addScaledVector(v, dt);
        e.object.rotation.x += spin.x * dt;
        e.object.rotation.y += spin.y * dt;
        e.object.scale.setScalar(Math.max(0.01, 1 - t));
      });
    }
  }

  /** Tekst, der stiger op og forsvinder, fx "+300". */
  floatingText(at: THREE.Vector3, text: string, color: string): void {
    const sprite = textSprite(text, { color, height: 0.75 });
    sprite.position.copy(at).add(new THREE.Vector3(0, 0.6, 0));
    const startY = sprite.position.y;
    this.add(sprite, 0.9, (e, _dt, t) => {
      e.object.position.y = startY + t * 1.4;
      sprite.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }, () => disposeSprite(sprite));
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      e.age += dt;
      const t = Math.min(1, e.age / e.life);
      e.step(e, dt, t);
      if (e.age >= e.life) {
        this.scene.remove(e.object);
        e.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }

  private add(object: THREE.Object3D, life: number, step: Effect['step'], dispose?: () => void): void {
    this.scene.add(object);
    this.items.push({ object, age: 0, life, step, dispose });
  }
}
