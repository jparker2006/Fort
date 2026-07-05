import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BONES, childrenOf, type BoneDef } from "./skeleton-def.ts";
import { makeFabricTexture } from "./textures.ts";

// Original stylized hero, built entirely in code: a programmatic humanoid
// skeleton, a skinned mesh assembled from primitive parts, per-vertex color
// blocking for the courier/explorer outfit (teal + slate + copper), and an
// original Mattock harvesting tool parented to the right hand. See DESIGN.md
// for the originality review.

// Palette.
const TEAL = 0x27a3a0;
const SLATE = 0x3c4a57;
const DARK = 0x232d36;
const COPPER = 0xcf7d3c;
const HELMET = 0x455361;

export interface Hero {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  bones: Map<string, THREE.Bone>;
  mattock: THREE.Group;
  dispose(): void;
}

interface WorldPos {
  x: number;
  y: number;
  z: number;
}

function worldPositions(): Map<string, WorldPos> {
  const map = new Map<string, WorldPos>();
  for (const b of BONES) {
    const p = { x: b.pos[0], y: b.pos[1], z: b.pos[2] };
    map.set(b.name, p);
  }
  return map;
}

// A bone's rest segment (head -> tail) for auto weighting. Tail is the mean of
// child positions, or a short natural stub for leaves.
function boneSegment(b: BoneDef, wp: Map<string, WorldPos>): [THREE.Vector3, THREE.Vector3] {
  const head = wp.get(b.name)!;
  const start = new THREE.Vector3(head.x, head.y, head.z);
  const kids = childrenOf(b.name);
  const end = new THREE.Vector3();
  if (kids.length > 0) {
    for (const k of kids) {
      const kp = wp.get(k.name)!;
      end.add(new THREE.Vector3(kp.x, kp.y, kp.z));
    }
    end.multiplyScalar(1 / kids.length);
  } else {
    // Leaf stubs: head up, wrists down-out, ankles forward.
    const stub: Record<string, [number, number, number]> = {
      head: [0, 0.12, 0],
      wristL: [0.05, -0.1, 0],
      wristR: [-0.05, -0.1, 0],
      ankleL: [0, -0.02, -0.14],
      ankleR: [0, -0.02, -0.14],
    };
    const s = stub[b.name] ?? [0, -0.1, 0];
    end.set(start.x + s[0], start.y + s[1], start.z + s[2]);
  }
  return [start, end];
}

function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const len2 = ab.lengthSq();
  let t = len2 > 1e-8 ? ap.dot(ab) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const proj = new THREE.Vector3().copy(a).addScaledVector(ab, t);
  return proj.distanceTo(p);
}

// --- Geometry part helpers -------------------------------------------------

function setColor(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

function box(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  return setColor(g, color);
}

function capsule(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
  color: number,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, len), 4, 10);
  // Capsule is along +Y; rotate to the bone direction and place at the midpoint.
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  g.applyQuaternion(q);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return setColor(g, color);
}

function sphere(cx: number, cy: number, cz: number, r: number, color: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 16, 12);
  g.translate(cx, cy, cz);
  return setColor(g, color);
}

function buildParts(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Torso: slate pelvis, teal jacket, collar, chest zipper accent.
  parts.push(box(0, 0.9, 0, 0.36, 0.24, 0.24, SLATE));
  parts.push(box(0, 1.2, 0, 0.42, 0.46, 0.27, TEAL));
  parts.push(box(0, 1.46, 0, 0.32, 0.09, 0.25, SLATE));
  parts.push(box(0, 1.22, -0.135, 0.05, 0.4, 0.03, COPPER));

  // Backpack and strap (courier flavor, original silhouette).
  parts.push(box(0, 1.24, 0.17, 0.26, 0.34, 0.14, SLATE));
  parts.push(box(0, 1.22, 0.1, 0.06, 0.42, 0.02, COPPER));

  // Head: helmet with copper visor. No face, no likeness.
  parts.push(sphere(0, 1.68, 0, 0.135, HELMET));
  parts.push(box(0, 1.66, -0.1, 0.22, 0.07, 0.07, COPPER));
  parts.push(box(0, 1.56, 0, 0.11, 0.08, 0.11, HELMET));

  // Shoulders.
  parts.push(box(0.18, 1.47, 0, 0.14, 0.13, 0.22, TEAL));
  parts.push(box(-0.18, 1.47, 0, 0.14, 0.13, 0.22, TEAL));

  // Arms: teal upper sleeve, slate forearm, copper glove.
  parts.push(capsule(0.16, 1.46, 0, 0.3, 1.2, 0, 0.062, TEAL));
  parts.push(capsule(0.3, 1.2, 0, 0.37, 0.98, 0, 0.055, SLATE));
  parts.push(box(0.38, 0.94, 0, 0.1, 0.11, 0.12, COPPER));
  parts.push(capsule(-0.16, 1.46, 0, -0.3, 1.2, 0, 0.062, TEAL));
  parts.push(capsule(-0.3, 1.2, 0, -0.37, 0.98, 0, 0.055, SLATE));
  parts.push(box(-0.38, 0.94, 0, 0.1, 0.11, 0.12, COPPER));

  // Legs: slate thigh, dark shin, dark boot pointing forward (-Z).
  parts.push(capsule(0.11, 0.9, 0, 0.12, 0.5, 0, 0.092, SLATE));
  parts.push(capsule(0.12, 0.5, 0, 0.12, 0.1, 0, 0.072, DARK));
  parts.push(box(0.12, 0.05, -0.06, 0.14, 0.1, 0.28, DARK));
  parts.push(capsule(-0.11, 0.9, 0, -0.12, 0.5, 0, 0.092, SLATE));
  parts.push(capsule(-0.12, 0.5, 0, -0.12, 0.1, 0, 0.072, DARK));
  parts.push(box(-0.12, 0.05, -0.06, 0.14, 0.1, 0.28, DARK));

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("Failed to merge hero geometry");
  return merged;
}

// Assign up to two bone influences per vertex by distance to bone segments.
function computeSkinWeights(geo: THREE.BufferGeometry): void {
  const wp = worldPositions();
  const boneDefs = BONES.filter((b) => b.name !== "root");
  const boneIndex = new Map<string, number>();
  BONES.forEach((b, i) => boneIndex.set(b.name, i));
  const segments = boneDefs.map((b) => ({ idx: boneIndex.get(b.name)!, seg: boneSegment(b, wp) }));

  const pos = geo.getAttribute("position");
  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const v = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    let best1 = Infinity;
    let best2 = Infinity;
    let idx1 = 0;
    let idx2 = 0;
    for (const s of segments) {
      const d = distToSegment(v, s.seg[0], s.seg[1]);
      if (d < best1) {
        best2 = best1;
        idx2 = idx1;
        best1 = d;
        idx1 = s.idx;
      } else if (d < best2) {
        best2 = d;
        idx2 = s.idx;
      }
    }
    // Inverse-square weighting between the two nearest bones for smooth joints.
    const w1 = 1 / (best1 * best1 + 1e-4);
    const w2 = 1 / (best2 * best2 + 1e-4);
    const sum = w1 + w2;
    skinIndex[i * 4] = idx1;
    skinIndex[i * 4 + 1] = idx2;
    skinWeight[i * 4] = w1 / sum;
    skinWeight[i * 4 + 1] = w2 / sum;
  }

  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
}

function buildBones(): { root: THREE.Bone; order: THREE.Bone[]; map: Map<string, THREE.Bone> } {
  const wp = worldPositions();
  const map = new Map<string, THREE.Bone>();
  const order: THREE.Bone[] = [];
  for (const def of BONES) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    map.set(def.name, bone);
    order.push(bone);
  }
  for (const def of BONES) {
    const bone = map.get(def.name)!;
    const here = wp.get(def.name)!;
    if (def.parent) {
      const parent = map.get(def.parent)!;
      const pp = wp.get(def.parent)!;
      bone.position.set(here.x - pp.x, here.y - pp.y, here.z - pp.z);
      parent.add(bone);
    } else {
      bone.position.set(here.x, here.y, here.z);
    }
  }
  return { root: map.get("root")!, order, map };
}

function buildMattock(): THREE.Group {
  // Original harvesting tool: a wooden haft with an angular slate head and a
  // copper cap. Deliberately not a Fortnite pickaxe silhouette.
  const g = new THREE.Group();
  g.name = "mattock";

  const haft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.026, 0.62, 8),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 }),
  );
  haft.castShadow = true;
  g.add(haft);

  const headMat = new THREE.MeshStandardMaterial({ color: 0x51606b, roughness: 0.5, metalness: 0.4 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.06), headMat);
  head.position.y = 0.3;
  head.castShadow = true;
  g.add(head);

  // Angular pick tine on one side (wedge via scaled box, rotated).
  const tine = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), headMat);
  tine.position.set(0.16, 0.3, 0);
  tine.rotation.z = -Math.PI / 2;
  tine.castShadow = true;
  g.add(tine);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: COPPER, roughness: 0.4, metalness: 0.5 }),
  );
  cap.position.y = -0.31;
  g.add(cap);

  return g;
}

export function buildHero(): Hero {
  const geo = buildParts();
  computeSkinWeights(geo);

  const fabric = makeFabricTexture();
  const material = new THREE.MeshStandardMaterial({
    map: fabric,
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.05,
  });

  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.name = "hero-mesh";
  mesh.castShadow = true;

  const { root, order, map } = buildBones();
  mesh.add(root);
  mesh.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(order);
  mesh.bind(skeleton);

  // Mattock rides in the right hand. The offset is in wristR-local space, so it
  // sits just past the wrist with the haft angled forward like a carried tool.
  const mattock = buildMattock();
  mattock.position.set(-0.02, -0.12, -0.02);
  mattock.rotation.set(0.5, 0, 0.15);
  map.get("wristR")!.add(mattock);

  const group = new THREE.Group();
  group.name = "hero";
  group.add(mesh);

  return {
    group,
    mesh,
    skeleton,
    bones: map,
    mattock,
    dispose() {
      geo.dispose();
      material.dispose();
      fabric.dispose();
      mattock.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
