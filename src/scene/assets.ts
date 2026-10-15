// P2：读 manifest；P6 加 GLTF 懒加载 + 缓存（SPEC §6.1）。
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
