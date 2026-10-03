import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadHumanModel } from '../../src/body3d/human/load';
import type { MuscleLook } from '../../src/body3d/deform';
import { avatarColors, buildAvatar, clothingMask } from '../../src/body3d/human/avatar';
import { AVERAGE_SHAPE, coeffsFromSemantic } from '../../src/body3d/human/model';
import { buildMuscleMap } from '../../src/body3d/human/muscleMap';
import { MUSCLE_IDS, type MuscleId } from '../../src/domain/muscles';

const q = new URLSearchParams(location.search);
const sex = (q.get('sex') ?? 'male') as 'male' | 'female';
const view = q.get('view') ?? 'front';
const W = Number(q.get('w') ?? 600);
const H = Number(q.get('h') ?? 900);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1e24');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(2, 4, 3);
scene.add(key);
const rim = new THREE.DirectionalLight('#9fb8ff', 1.4);
rim.position.set(-2.5, 3, -3);
scene.add(rim);

const model = await loadHumanModel(sex);
const stature = sex === 'male' ? 1.78 : 1.65;
const coeffs = coeffsFromSemantic(model, {
  ...AVERAGE_SHAPE,
  weight: Number(q.get('weight') ?? 0.5),
  muscle: Number(q.get('muscle') ?? 0.5),
});
const map = buildMuscleMap(model);
const now = Number(q.get('bulge') ?? 1);
const only = q.get('only');
const bulges = Object.fromEntries(MUSCLE_IDS.map((id) => [id, !only || only === id ? now : 1])) as Record<
  MuscleId,
  number
>;
const anchor = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 1])) as Record<MuscleId, number>;
const t0 = performance.now();
const geo = buildAvatar({
  model,
  map,
  coeffs,
  statureM: stature,
  bulges,
  anchorBulges: anchor,
  detail: 'precise',
  fatDelta: Number(q.get('fat') ?? 0),
});
const t1 = performance.now();
const looks = Object.fromEntries(
  MUSCLE_IDS.map((id, i) => {
    const c = new THREE.Color().setHSL((i * 0.61803) % 1, 0.75, 0.5);
    return [id, { color: [c.r, c.g, c.b], bulgeScale: 1, highlight: 0 }];
  }),
) as Record<MuscleId, MuscleLook>;
const skinC = new THREE.Color(q.get('color') ?? '#c9a58c');
const colors = avatarColors(geo, clothingMask(model), looks, {
  skin: [skinC.r, skinC.g, skinC.b],
  cloth: [0.12, 0.13, 0.16],
  tint: Number(q.get('tint') ?? 0.85),
});
console.log('build ms', (t1 - t0).toFixed(1));
const bg = new THREE.BufferGeometry();
bg.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
bg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
bg.setIndex(new THREE.BufferAttribute(geo.index, 1));
bg.computeVertexNormals();
const mat = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.55,
  sheen: 0.4,
  sheenRoughness: 0.6,
  sheenColor: new THREE.Color('#ffd9c7'),
});
scene.add(new THREE.Mesh(bg, mat));

const views = view === 'grid' ? ['front', 'side', 'back', 'three-quarter'] : [view];
renderer.setSize(W * views.length, H);
renderer.setScissorTest(true);
views.forEach((v, i) => {
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
  const target = new THREE.Vector3(0, stature * 0.52, 0);
  const az = { front: 0, side: Math.PI / 2, back: Math.PI, 'three-quarter': Math.PI / 5 }[v] ?? 0;
  const dist = 4.6;
  cam.position.set(Math.sin(az) * dist, target.y + 0.2, Math.cos(az) * dist);
  cam.lookAt(target);
  renderer.setViewport(i * W, 0, W, H);
  renderer.setScissor(i * W, 0, W, H);
  renderer.render(scene, cam);
});
(window as unknown as { ready: boolean }).ready = true;
