// P2：根据 store 的 Project 增量同步 three 对象（SPEC §3）。
// 相机 / 灯光的同步在 P3 / P4 扩展；本阶段只管人物和道具。
import * as THREE from "three";
import type { Project, Shot } from "../types";
import { getAllPresets } from "../data/userPresets";
import { applyPose, autoGroundRig, resolvePose, type Rig } from "./rig";
import { buildMannequin, disposeMannequin, setRigColor, type Build } from "./mannequin";
import { buildProp } from "./props";
import { characterDef, propDef } from "./assets";
import type { Selection } from "../state/store";

interface ActorEntry {
  group: THREE.Group; // 外层：position(x,z) + facing
  rig: Rig;
  modelKey: string;
  colorKey: string;
}
interface PropEntry {
  group: THREE.Group;
  buildKey: string; // model+size+color，变了就重建
}

const HIGHLIGHT = 0x1e3f66;

export class SceneManager {
  private actors = new Map<string, ActorEntry>();
  private props = new Map<string, PropEntry>();

  constructor(readonly scene: THREE.Scene) {}

  sync(project: Project, shotIndex: number): void {
    const shot = project.shots[shotIndex];
    if (!shot) return;
    this.syncActors(shot);
    this.syncProps(shot);
    this.applyHighlight();
  }

  private syncActors(shot: Shot): void {
    const seen = new Set<string>();
    for (const actor of shot.actors) {
      seen.add(actor.id);
      const def = characterDef(actor.model);
      const modelKey = actor.model;
      let entry = this.actors.get(actor.id);
      if (entry && entry.modelKey !== modelKey) {
        this.removeActor(actor.id);
        entry = undefined;
      }
      if (!entry) {
        const group = new THREE.Group();
        group.name = `actor:${actor.id}`;
        group.userData.entity = { type: "actor", id: actor.id };
        const rig = this.buildCharacterRig(actor.model, actor.color);
        group.add(rig.root);
        this.scene.add(group);
        entry = { group, rig, modelKey, colorKey: actor.color ?? "" };
        this.actors.set(actor.id, entry);
      }
      const colorKey = actor.color ?? def?.color ?? "";
      if (colorKey !== entry.colorKey) {
        setRigColor(entry.rig, colorKey || "#c9a06b");
        entry.colorKey = colorKey;
      }
      entry.group.position.set(actor.position[0], 0, actor.position[1]);
      entry.group.rotation.y = THREE.MathUtils.degToRad(actor.facing);
      const pose = resolvePose(actor.pose, getAllPresets());
      applyPose(entry.rig, pose);
      autoGroundRig(entry.rig, actor.elevation ?? 0);
    }
    for (const id of [...this.actors.keys()]) {
      if (!seen.has(id)) this.removeActor(id);
    }
  }

  /** P2：只有程序化木头人；P6 在此扩展 GLTF */
  private buildCharacterRig(model: string, color?: string): Rig {
    const def = characterDef(model);
    if (!def || def.type === "procedural") {
      return buildMannequin({
        build: (def?.build ?? "male") as Build,
        height: def?.height ?? 1.73,
        color: color ?? def?.color ?? "#c9a06b",
      });
    }
    return placeholderRig(1.75, "#888888"); // GLTF 占位（P6 实现）
  }

  private syncProps(shot: Shot): void {
    const seen = new Set<string>();
    for (const prop of shot.props) {
      seen.add(prop.id);
      const def = propDef(prop.model);
      const size = prop.size ? prop.size.join(",") : "";
      const buildKey = `${prop.model}|${size}|${prop.color ?? ""}`;
      let entry = this.props.get(prop.id);
      if (entry && entry.buildKey !== buildKey) {
        this.removeProp(prop.id);
        entry = undefined;
      }
      if (!entry) {
        const group = def
          ? buildProp(def, prop)
          : buildProp({ id: "box", name: "box", type: "procedural", shape: "box" }, prop);
        group.userData.entity = { type: "prop", id: prop.id };
        this.scene.add(group);
        entry = { group, buildKey };
        this.props.set(prop.id, entry);
      }
      entry.group.position.set(prop.position[0], prop.elevation ?? 0, prop.position[1]);
      entry.group.rotation.y = THREE.MathUtils.degToRad(prop.facing ?? 0);
      entry.group.visible = true;
    }
    for (const id of [...this.props.keys()]) {
      if (!seen.has(id)) this.removeProp(id);
    }
  }

  private removeActor(id: string): void {
    const entry = this.actors.get(id);
    if (!entry) return;
    this.scene.remove(entry.group);
    disposeMannequin(entry.rig);
    this.actors.delete(id);
  }
  private removeProp(id: string): void {
    const entry = this.props.get(id);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.props.delete(id);
  }

  /** 点选用：从 mesh 往上找 entity 标记 */
  findEntity(obj: THREE.Object3D | null): { type: "actor" | "prop"; id: string } | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData.entity) return cur.userData.entity;
      cur = cur.parent;
    }
    return null;
  }

  groupOf(type: "actor" | "prop", id: string): THREE.Object3D | null {
    if (type === "actor") return this.actors.get(id)?.group ?? null;
    return this.props.get(id)?.group ?? null;
  }

  rigOf(id: string): Rig | undefined {
    return this.actors.get(id)?.rig;
  }

  actorHeadWorld(id: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const rig = this.rigOf(id);
    if (!rig) return null;
    const marker = rig.markers.get("noseTip") ?? rig.joints.get("head")?.obj;
    if (!marker) return null;
    rig.root.updateMatrixWorld(true);
    return marker.getWorldPosition(out);
  }

  private applyHighlight(): void {
    const paint = (group: THREE.Object3D | null, on: boolean): void => {
      if (!group) return;
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && m.emissive) m.emissive.setHex(on ? HIGHLIGHT : 0x000000);
        }
      });
    };
    for (const entry of this.actors.values()) paint(entry.group, false);
    for (const entry of this.props.values()) paint(entry.group, false);
  }

  setSelected(sel: Selection): void {
    this.applyHighlight();
    if (!sel || sel.type === "camera" || sel.type === "light") return;
    const group = this.groupOf(sel.type, sel.id);
    if (!group) return;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m && m.emissive) m.emissive.setHex(HIGHLIGHT);
      }
    });
  }
}

/** GLTF 加载前的灰色占位（P6 换真模型） */
function placeholderRig(height: number, color: string): Rig {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(height * 0.28, height, height * 0.18),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  mesh.position.y = height / 2;
  root.add(mesh);
  const joints = new Map();
  return {
    root,
    joints,
    height,
    hipHeight: height * 0.53,
    markers: new Map(),
  };
}
