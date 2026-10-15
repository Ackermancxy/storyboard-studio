// P2：预设总表 = 内置 + 用户自定义（localStorage）。P7 补管理 UI。
import type { Pose } from "../types";
import { POSE_PRESETS, presetMap } from "./poses";

const LS_KEY = "storyboard.userPresets.v1";

export interface UserPreset {
  id: string;
  name: string;
  pose: Pose;
}

export function loadUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as UserPreset[];
    return Array.isArray(arr) ? arr.filter((p) => p?.id && p.pose) : [];
  } catch {
    return [];
  }
}

export function saveUserPresets(list: UserPreset[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function upsertUserPreset(id: string, name: string, pose: Pose): void {
  const list = loadUserPresets().filter((p) => p.id !== id);
  list.push({ id, name, pose });
  saveUserPresets(list);
}

export function deleteUserPreset(id: string): void {
  saveUserPresets(loadUserPresets().filter((p) => p.id !== id));
}

let cache: Record<string, Pose> | null = null;

export function getAllPresets(): Record<string, Pose> {
  if (!cache) {
    cache = { ...presetMap };
    for (const p of loadUserPresets()) cache[p.id] = p.pose;
  }
  return cache;
}

export function invalidatePresetCache(): void {
  cache = null;
}

/** AI 提示词 / 预设下拉用：「id（中文名）」列表 */
export function presetListItems(): string[] {
  const items = POSE_PRESETS.map((p) => `${p.id}（${p.name}）`);
  for (const p of loadUserPresets()) items.push(`${p.id}（${p.name}）`);
  return items;
}
