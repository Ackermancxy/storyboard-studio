// P2/P3：根据 store 的 Project 增量同步 three 对象（SPEC §3）。
// 相机：sync 时求解并存 cameraState；gaze 在摆姿势前注入。灯光同步在 P4。
import * as THREE from "three";
import type { Project, Shot } from "../types";
import { getAllPresets } from "../data/userPresets";
import { applyPose, autoGroundRig, resolvePose, type ResolvedPose, type Rig } from "./rig";
import { applyGaze } from "./gaze";
import { cameraHudText, solveCamera, type CameraSolve } from "./camera";
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

export function aspectValue(aspect: Project["aspect"]): number {
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
}

export class SceneManager {
  private actors = new Map<string, ActorEntry>();
  private props = new Map<string, PropEntry>();
  cameraState: CameraSolve | null = null;
  private hudSpec = "";

  constructor(readonly scene: THREE.Scene) {}

  sync(project: Project, shotIndex: number): void {
    const shot = project.shots[shotIndex];
    if (!shot) return;
    this.syncProps(shot);
    this.solveShotCamera(project, shot);
    this.syncActors(project, shot);
    this.applyHighlight();
  }

  /** §7.2：auto 用求解；manual 用存的 position/target */
  private solveShotCamera(project: Project, shot: Shot): void {
    const aspect = aspectValue(project.aspect);
    const cam = shot.camera;
    if (cam.mode === "manual" && cam.position && cam.target) {
      const position = new THREE.Vector3(...cam.position);
      const target = new THREE.Vector3(...cam.target);
      const up = new THREE.Vector3(0, 1, 0);
      if (cam.roll) {
        up.applyAxisAngle(target.clone().sub(position).normalize(), THREE.MathUtils.degToRad(cam.roll));
      }
      this.cameraState = { position, target, up, distance: position.distanceTo(target), subjectHeight: 1.7 };
    } else {
      const actors = shot.actors.map((a) => ({
        id: a.id,
        position: a.position,
        facing: a.facing,
        height: characterDef(a.model)?.height ?? 1.73,
      }));
      this.cameraState = solveCamera(cam, actors, aspect);
    }
    this.hudSpec = cameraHudText(cam, project.sensor);
  }

  hudText(): string {
    return this.hudSpec;
  }

  get aspect(): number {
    return aspectValue(this.proj?.aspect ?? "3:2");
  }
  private proj: Project | null = null;

  private syncActors(project: Project, shot: Shot): void {
    this.proj = project;
    const seen = new Set<string>();
    const cameraPos = this.cameraState?.position ?? new THREE.Vector3(0, 1.5, 3);
    const headByid = new Map<string, THREE.Vector3>();
    for (const a of shot.actors) {
      headByid.set(a.id, new THREE.Vector3(a.position[0], (characterDef(a.model)?.height ?? 1.73) * 0.93, a.position[1]));
    }

    for (const actor of shot.actors) {
      seen.add(actor.id);
      const def = characterDef(actor.model);
      let entry = this.actors.get(actor.id);
      if (entry && entry.modelKey !== actor.model) {
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
        entry = { group, rig, modelKey: actor.model, colorKey: "" };
        this.actors.set(actor.id, entry);
      }
      const colorKey = actor.color ?? def?.color ?? "";
      if (colorKey !== entry.colorKey) {
        setRigColor(entry.rig, colorKey || "#c9a06b");
        entry.colorKey = colorKey;
      }
      entry.group.position.set(actor.position[0], 0, actor.position[1]);
      entry.group.rotation.y = THREE.MathUtils.degToRad(actor.facing);

      const presets = getAllPresets();
      let pose: ResolvedPose = resolvePose(actor.pose, presets);
      // gaze：第一遍摆好后取真实头部位置，再反算头颈（§5.6）
      if (actor.gaze) {
        applyPose(entry.rig, pose);
        autoGroundRig(entry.rig, actor.elevation ?? 0);
        entry.rig.root.updateMatrixWorld(true);
        const head = new THREE.Vector3();
        const marker = entry.rig.markers.get("noseTip") ?? entry.rig.joints.get("head")?.obj;
        if (marker) marker.getWorldPosition(head);
        else head.copy(headByid.get(actor.id)!);
        const target =
          actor.gaze === "camera"
            ? cameraPos
            : headByid.get(actor.gaze) ?? cameraPos;
        applyGaze(pose, head, target, actor.facing);
      }
      applyPose(entry.rig, pose);
      autoGroundRig(entry.rig, actor.elevation ?? 0);
    }
    for (const id of [...this.actors.keys()]) {
      if (!seen.has(id)) this.removeActor(id);
    }
  }

  /** P2：程序化木头人；P6 在此扩展 GLTF */
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
  findEntity(obj: THREE.Object3D | null): { type: "actor" | "prop" | "camera"; id: string } | null {
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

  private applyHighlight(): void {
    const clear = (group: THREE.Object3D | null): void => {
      if (!group) return;
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && m.emissive) m.emissive.setHex(0x000000);
        }
      });
    };
    for (const entry of this.actors.values()) clear(entry.group);
    for (const entry of this.props.values()) clear(entry.group);
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
  return {
    root,
    joints: new Map(),
    height,
    hipHeight: height * 0.53,
    markers: new Map(),
  };
}
