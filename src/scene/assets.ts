// P2/P6：读 manifest + GLTF 懒加载缓存（SPEC §6.1）。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Build } from "./mannequin";

export interface CharacterDef {
  id: string;
  name: string;
  type: "procedural" | "gltf";
  build?: Build;
  height?: number;
  color?: string;
  // gltf（P6）
  file?: string;
  rotateY?: number;
  boneMap?: string | Record<string, string>;
}

export interface PropDef {
  id: string;
  name: string;
  type: "procedural" | "gltf";
  shape?: string;
  file?: string;
  scale?: number;
  sizeable?: boolean; // box/wall/backdrop 可写 size
  color?: string;
}

export interface Manifest {
  characters: CharacterDef[];
  props: PropDef[];
}

let manifest: Manifest = { characters: [], props: [] };

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/assets/manifest.json");
  if (!res.ok) throw new Error(`manifest 加载失败：HTTP ${res.status}`);
  const raw = (await res.json()) as Partial<Manifest>;
  manifest = {
    characters: (raw.characters ?? []).filter((c): c is CharacterDef => !!c?.id),
    props: (raw.props ?? []).filter((p): p is PropDef => !!p?.id),
  };
  return manifest;
}

export function getManifest(): Manifest {
  return manifest;
}
export function characterDef(id: string): CharacterDef | undefined {
  return manifest.characters.find((c) => c.id === id);
}
export function propDef(id: string): PropDef | undefined {
  return manifest.props.find((p) => p.id === id);
}

/** box/wall/backdrop 支持自定义 size */
export function isSizeableShape(def: PropDef): boolean {
  return def.sizeable ?? ["box", "wall", "backdrop"].includes(def.shape ?? "");
}

/* ── GLTF（P6）：懒加载 + 缓存 + 克隆 ── */

const gltfCache = new Map<string, Promise<THREE.Group>>();

/** 加载 .glb 并返回「模板」Group（克隆用），失败时 Promise reject */
export function loadGLTFTemplate(url: string): Promise<THREE.Group> {
  let p = gltfCache.get(url);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoader().load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
    gltfCache.set(url, p);
  }
  return p;
}

/** 从模板克隆一份独立实例（骨骼动画模型必须用 SkeletonUtils.clone） */
export function cloneGltf(template: THREE.Group): THREE.Group {
  return skeletonClone(template) as THREE.Group;
}

/** 骨骼查找：兼容 "mixamorig:Hips" 与 "Hips" 两种命名 */
export function findBone(root: THREE.Object3D, name: string): THREE.Bone | undefined {
  const target = name.replace(/^mixamorig:/, "");
  let found: THREE.Bone | undefined;
  root.traverse((o) => {
    if (found) return;
    const b = o as THREE.Bone;
    if (!b.isBone) return;
    if (b.name === name || b.name.replace(/^mixamorig:/, "") === target) found = b;
  });
  return found;
}
