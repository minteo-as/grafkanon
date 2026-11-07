import * as THREE from 'three';
import { WALL_HALF_WIDTH, type Wall } from '../math/path';
import { COLORS } from './world';

const DEPTH = 1.4;

/** Murene i sidebilledet, som granaten skal over. */
export class WallLayer {
  private group = new THREE.Group();
  private bodyMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, flatShading: true, roughness: 0.9 });
  private topMat = new THREE.MeshBasicMaterial({ color: COLORS.wallTop });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  set(walls: readonly Wall[]): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    for (const w of walls) {
      const width = WALL_HALF_WIDTH * 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, w.height, DEPTH), this.bodyMat);
      body.position.set(w.x, w.height / 2, 0);
      // En lys kant på toppen gør det let at se, hvor høj muren er
      const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.08, DEPTH + 0.06), this.topMat);
      top.position.set(w.x, w.height, 0);
      this.group.add(body, top);
    }
  }
}
