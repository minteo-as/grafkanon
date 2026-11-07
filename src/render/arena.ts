import * as THREE from 'three';
import { fmtNum } from '../math/format';
import { textSprite } from './labels';
import { COLORS, SIDE, toWorld } from './world';

/** Gulv, gitter, akser med tal og kanten rundt om banen (Linjebyen). */
export function buildFloorArena(half: number): THREE.Group {
  const arena = new THREE.Group();
  const size = 2 * half;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 3, size + 3),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  arena.add(floor);

  const grid = new THREE.GridHelper(size, size, COLORS.gridMain, COLORS.grid);
  grid.position.y = 0.01;
  arena.add(grid);

  const axisMat = new THREE.MeshBasicMaterial({ color: COLORS.axis });
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(size + 1, 0.03, 0.07), axisMat);
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, size + 1), axisMat);
  xAxis.position.y = yAxis.position.y = 0.02;
  arena.add(xAxis, yAxis);

  for (let v = -half; v <= half; v += 2) {
    if (v === 0) continue;
    const onX = textSprite(fmtNum(v));
    onX.position.copy(toWorld(v, -0.55, 0.25));
    const onY = textSprite(fmtNum(v));
    onY.position.copy(toWorld(-0.6, v, 0.25));
    arena.add(onX, onY);
  }
  const xName = textSprite('x', { color: '#dce6f4', height: 0.7 });
  xName.position.copy(toWorld(half + 0.5, 0.5, 0.3));
  const yName = textSprite('y', { color: '#dce6f4', height: 0.7 });
  yName.position.copy(toWorld(0.5, half + 0.5, 0.3));
  arena.add(xName, yName);

  // Kanten, som kanonen kører rundt på
  const rimMat = new THREE.MeshStandardMaterial({ color: COLORS.rim, roughness: 0.8 });
  const edge = half + 0.9;
  const long = size + 2.2;
  const sides: [number, number, number, number][] = [
    [0, -edge, long, 0.5],
    [0, edge, long, 0.5],
    [-edge, 0, 0.5, long],
    [edge, 0, 0.5, long],
  ];
  for (const [x, y, w, d] of sides) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), rimMat);
    rim.position.copy(toWorld(x, y, 0.12));
    arena.add(rim);
  }
  return arena;
}

/** Et lodret koordinatsystem med jorden som x-akse og bjerge i baggrunden (Parabelbjergene). */
export function buildSideArena(half: number, top: number): THREE.Group {
  const arena = new THREE.Group();

  // Gitteret står lodret lige bag dronerne
  const minor: number[] = [];
  const major: number[] = [];
  for (let x = -half; x <= half; x++) (x % 5 === 0 ? major : minor).push(x, 0, -0.05, x, top, -0.05);
  for (let y = 1; y <= top; y++) (y % 5 === 0 ? major : minor).push(-half, y, -0.05, half, y, -0.05);
  for (const [points, color] of [[minor, COLORS.grid], [major, COLORS.gridMain]] as const) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    arena.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color })));
  }
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * half, top),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }),
  );
  back.position.set(0, top / 2, -0.1);
  arena.add(back);

  // Jorden strækker sig ud mod kameraet
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(2 * half + 6, 0.4, 10),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.9 }),
  );
  ground.position.set(0, -0.2, 3);
  arena.add(ground);

  const axisMat = new THREE.MeshBasicMaterial({ color: COLORS.axis });
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(2 * half + 1, 0.06, 0.06), axisMat);
  xAxis.position.set(0, 0.01, 0);
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.06, top + 0.6, 0.06), axisMat);
  yAxis.position.set(0, (top + 0.6) / 2, 0);
  arena.add(xAxis, yAxis);

  for (let v = -half; v <= half; v += 2) {
    if (v === 0) continue;
    const label = textSprite(fmtNum(v));
    label.position.copy(SIDE.toWorld(v, -0.55, 0.3));
    arena.add(label);
  }
  for (let v = 2; v <= top; v += 2) {
    const label = textSprite(fmtNum(v));
    label.position.copy(SIDE.toWorld(-0.6, v, 0.1));
    arena.add(label);
  }
  const xName = textSprite('x', { color: '#dce6f4', height: 0.7 });
  xName.position.copy(SIDE.toWorld(half + 0.6, 0.5, 0.2));
  const yName = textSprite('y', { color: '#dce6f4', height: 0.7 });
  yName.position.copy(SIDE.toWorld(0.5, top + 0.5, 0.2));
  arena.add(xName, yName);

  // Lavpolygon-bjerge bag gitteret
  const mountainMat = new THREE.MeshStandardMaterial({ color: COLORS.mountain, flatShading: true, roughness: 1 });
  const peaks: [number, number, number][] = [
    [-15, 9, 7], [-8, 13, 8], [-1, 10, 6], [6, 14, 9], [13, 11, 7], [19, 8, 6], [-20, 7, 6],
  ];
  for (const [x, h, r] of peaks) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mountainMat);
    m.position.set(x, h / 2 - 0.5, -12 - (Math.abs(x) % 4));
    m.rotation.y = x;
    arena.add(m);
  }
  return arena;
}
