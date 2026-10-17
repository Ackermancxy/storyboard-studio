// P2/P6：读 manifest + GLTF 懒加载缓存（SPEC §6.1）。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Build } from "./mannequin";
import type { JointName } from "../types";
import type { ModelLists } from "../state/normalize";

export interface CharacterDef {
  id: string;
  name: string;
  type: "procedural" | "gltf" | "mmd";
  build?: Build;
  height?: number;
  color?: string;
  // gltf（P6）
  file?: string;
  rotateY?: number;
  boneMap?: string | Record<string, string>;
  hideTextures?: string[]; // MMD：按贴图名隐藏换装层
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

async function fetchManifestPart(url: string): Promise<Partial<Manifest> | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as Partial<Manifest>;
  } catch {
    return null;
  }
}

/** 按 id 合并：manifest.local.json 覆盖/追加 base，顺序沿用 base */
function mergeById<T extends { id: string }>(base: T[], patch: T[] | undefined): T[] {
  if (!patch || patch.length === 0) return base;
  const map = new Map(base.map((x) => [x.id, x]));
  for (const x of patch) if (x?.id) map.set(x.id, x);
  return [...map.values()];
}

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/assets/manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest 加载失败：HTTP ${res.status}`);
  const raw = (await res.json()) as Partial<Manifest>;
  // 仓库只带通用模型；本机私有模型/覆盖配置放 manifest.local.json（已被 .gitignore 忽略）
  const local = await fetchManifestPart("/assets/manifest.local.json");
  const chars = (raw.characters ?? []).filter((c): c is CharacterDef => !!c?.id);
  const localChars = (local?.characters ?? []).filter((c): c is CharacterDef => !!c?.id);
  const props = (raw.props ?? []).filter((p): p is PropDef => !!p?.id);
  const localProps = (local?.props ?? []).filter((p): p is PropDef => !!p?.id);
  manifest = {
    characters: mergeById(chars, localChars),
    props: mergeById(props, localProps),
  };
  return manifest;
}

export function getManifest(): Manifest {
  return manifest;
}
export function modelLists(): ModelLists {
  return {
    characters: manifest.characters.map((c) => c.id),
    props: manifest.props.map((p) => p.id),
    characterNames: new Map(manifest.characters.map((c) => [c.name, c.id])),
    propNames: new Map(manifest.props.map((p) => [p.name, p.id])),
  };
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

/** 加载 MMD .pmx（three-stdlib MMDLoader），返回包了一层 Group 的模板。
 *  后处理：Toon→Standard（Toon 在本渲染管线里会隐形）。
 *  必须等「网格 + 全部贴图」都就绪才 resolve：
 *  MMDLoader 给材质挂的是空 Texture，图像是后填的，早 resolve 会拿到没有 image 的贴图
 *  （表现：首帧无贴图，且按贴图名做的换装层隐藏全部落空）。 */
const mmdCache = new Map<string, Promise<THREE.Group>>();
export function loadMMDTemplate(url: string): Promise<THREE.Group> {
  let p = mmdCache.get(url);
  if (!p) {
    p = import("three-stdlib").then(
      ({ MMDLoader }) =>
        new Promise<THREE.Group>((resolve, reject) => {
          const manager = new THREE.LoadingManager();
          const holder = new THREE.Group();
          let meshReady = false;
          let texturesReady = false;
          let done = false;
          let safety: ReturnType<typeof setTimeout> | undefined;
          const finish = (): void => {
            if (done) return;
            done = true;
            if (safety !== undefined) clearTimeout(safety);
            postprocessMMD(holder);
            resolve(holder);
          };
          const tryFinish = (): void => { if (meshReady && texturesReady) finish(); };
          manager.onLoad = () => { texturesReady = true; tryFinish(); };
          // 兜底：个别贴图既不成也不败时别把占位盒挂死
          safety = setTimeout(() => { texturesReady = true; tryFinish(); }, 10000);
          new MMDLoader(manager).load(
            url,
            (mesh) => {
              holder.add(mesh as unknown as THREE.Object3D);
              meshReady = true;
              tryFinish();
            },
            undefined,
            (err) => {
              if (safety !== undefined) clearTimeout(safety);
              reject(err instanceof Error ? err : new Error(String(err)));
            },
          );
        }),
    );
    mmdCache.set(url, p);
  }
  return p;
}

function postprocessMMD(root: THREE.Group): void {
  root.traverse((o) => {
    const sm = o as SkinnedMeshLike;
    if (!sm.isSkinnedMesh) return;
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    const converted = mats.map((m) => {
      const src = m as THREE.MeshToonMaterial;
      const std = new THREE.MeshStandardMaterial({
        map: src.map ?? null,
        side: m.side,
        transparent: m.transparent,
        opacity: m.opacity,
        alphaTest: m.alphaTest,
        vertexColors: m.vertexColors,
        // 名称必须带过来：换装层隐藏（hideTextures）按 PMX 材质名匹配
        name: m.name,
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        roughness: 0.9,
        metalness: 0,
        // MMD 模型多层服装贴合身体，不加偏移会 z-fight 出彩点
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
      return std;
    });
    sm.material = Array.isArray(sm.material) ? converted : converted[0];
  });
}

interface SkinnedMeshLike extends THREE.Object3D {
  isSkinnedMesh?: boolean;
  material: THREE.Material | THREE.Material[];
}

/** 隐藏指定换装层（MMD 会把内衣/泳装等整套叠在制服上一层渲染，不隐藏就 z-fight 出彩点）。
 *  优先按 PMX 材质名匹配：MMDLoader 会把材质名写进 material.name，且加载完成时就有；
 *  贴图名只作兜底——贴图是异步填进 Texture 的，早期调用取不到 src。 */
export function mmdHideTextures(root: THREE.Object3D, keywords: string[]): void {
  root.traverse((o) => {
    const sm = o as SkinnedMeshLike;
    if (!sm.isSkinnedMesh) return;
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    for (const m of mats) {
      if (matchesLayer(m, keywords)) m.visible = false;
    }
  });
}

/** 材质名 / 贴图名任一命中关键词即算该换装层 */
function matchesLayer(m: THREE.Material, keywords: string[]): boolean {
  if (m.name && keywords.some((k) => m.name.includes(k))) return true;
  const data = (m as THREE.MeshStandardMaterial).map?.source?.data as { src?: string } | undefined;
  const src = data?.src;
  return !!(src && keywords.some((k) => decodeURIComponent(src).includes(k)));
}

/** 从模板克隆一份独立实例（骨骼动画模型必须用 SkeletonUtils.clone） */
export function cloneGltf(template: THREE.Group): THREE.Group {
  return skeletonClone(template) as THREE.Group;
}

/* ── PMX「付与親」（append transform）── */

/** MMDLoader 把 PMX 原始骨骼表挂在 geometry.bones 上（含付与信息），与 skeleton.bones 同序 */
interface MmdRawBone {
  name?: string;
  grant?: {
    parentIndex: number;
    ratio: number;
    affectRotation: boolean;
    affectPosition: boolean;
  };
}

export interface MmdGrantLink {
  bone: THREE.Bone;
  joint: JointName;
  ratio: number;
}

/** MMD 捩り骨的命名约定：关节名 + 这些后缀（腕+ / 首+ / 腕捩 …） */
const TWIST_SUFFIXES = ["+", "捩", "捩り"];

/**
 * 找出「应当跟随某个关节一起转」的骨骼，交给姿势引擎镜像关节的旋转。
 *
 * 两个来源：
 * 1. PMX 付与親：`足D`/`足首D` 跟随腿、`目` 跟随両目、`肩C` 反向抵消（ratio −1）。
 *    源在自己下游的（如 `肩C ← 左腕` 那种写法）要跳过，否则会和层级叠乘转出双倍角度。
 * 2. 捩り骨命名约定：`左腕+` 与 `左腕` **同级同位**且无付与，MMD 里靠腕 IK 的 links
 *    带动；我们不跑 IK（姿势直接写在关节上），所以按约定把关节的旋转也镜像给它。
 *    短袖这类面在它身上挂了四成权重，不镜像就会半边跟着大臂、半边留在原地。
 */
export function collectMmdGrants(
  root: THREE.Object3D,
  boneMap: Partial<Record<JointName, string>>,
): MmdGrantLink[] {
  let mesh: THREE.SkinnedMesh | undefined;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!mesh && sm.isSkinnedMesh) mesh = sm;
  });
  const raw = (mesh?.geometry as THREE.BufferGeometry & { bones?: MmdRawBone[] })?.bones;
  const skel = mesh?.skeleton?.bones;
  if (!raw || !skel || raw.length !== skel.length) return [];

  const jointByBoneName = new Map<string, JointName>();
  for (const [joint, boneName] of Object.entries(boneMap) as [JointName, string][]) {
    if (boneName && !jointByBoneName.has(boneName)) jointByBoneName.set(boneName, joint);
  }

  const out: MmdGrantLink[] = [];
  const taken = new Set<THREE.Bone>();

  // 1) PMX 付与表
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i]?.grant;
    if (!g || !g.affectRotation || Math.abs(g.ratio) < 0.99) continue;
    const sourceName = raw[g.parentIndex]?.name;
    if (!sourceName) continue;
    const joint = jointByBoneName.get(sourceName);
    const bone = skel[i];
    const source = skel[g.parentIndex];
    if (!joint || !bone || !source) continue;
    if (isAncestorOf(bone, source)) continue; // 源在下游：镜像会与层级叠乘
    out.push({ bone, joint, ratio: g.ratio });
    taken.add(bone);
  }

  // 2) 捩り骨命名约定
  for (let i = 0; i < raw.length; i++) {
    const name = raw[i]?.name;
    const bone = skel[i];
    if (!name || !bone || taken.has(bone)) continue;
    const suffix = TWIST_SUFFIXES.find((s) => name.endsWith(s));
    if (!suffix) continue;
    const joint = jointByBoneName.get(name.slice(0, name.length - suffix.length));
    if (!joint) continue;
    out.push({ bone, joint, ratio: 1 });
    taken.add(bone);
  }

  return out;
}

function isAncestorOf(maybeAncestor: THREE.Object3D, node: THREE.Object3D): boolean {
  for (let p = node.parent; p; p = p.parent) if (p === maybeAncestor) return true;
  return false;
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
