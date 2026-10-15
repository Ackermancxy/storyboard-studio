// P2：视口。自由视角 + 点选 + TransformControls（P3 扩展为 机位/导演/俯视 三视图）。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { Store } from "../state/store";
import type { SceneManager } from "../scene/SceneManager";

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private tcontrols: TransformControls;
  private raycaster = new THREE.Raycaster();
  private dirty = true;
  private container: HTMLElement;

  constructor(
    private scene: THREE.Scene,
    private store: Store,
    private sm: SceneManager,
    private onChange: () => void, // 任何需要重渲染的交互
  ) {
    this.container = document.getElementById("viewport")!;
    const canvas = document.getElementById("view3d") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.camera.position.set(2.6, 1.7, 3.6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.9, 0);
    this.controls.addEventListener("change", () => this.requestRender());

    this.tcontrols = new TransformControls(this.camera, canvas);
    this.tcontrols.setSpace("world");
    this.tcontrols.showX = true;
    this.tcontrols.showY = false;
    this.tcontrols.addEventListener("dragging-changed", (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      this.controls.enabled = !dragging;
      if (!dragging) {
        this.store.endDrag(); // 松手入撤销栈
        this.onChange();
      }
    });
    this.tcontrols.addEventListener("objectChange", () => this.writeBackTransform());
    const helper = this.tcontrols.getHelper();
    helper.traverse((o) => {
      o.userData.__gizmo = true; // 点选时跳过 gizmo
    });
    scene.add(helper);

    // 点选
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize();
  }

  requestRender(): void {
    this.dirty = true;
  }

  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this.tcontrols.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if ((hit.object as THREE.Line).isLine) continue;
      if (this.isGizmo(hit.object)) continue;
      const entity = this.sm.findEntity(hit.object);
      if (entity) {
        this.store.setSelected({ type: entity.type, id: entity.id });
        return;
      }
    }
    this.store.setSelected(null);
  }

  private isGizmo(obj: THREE.Object3D | null): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData.__gizmo) return true;
      cur = cur.parent;
    }
    return false;
  }

  /** 选中对象 → 挂 TransformControls */
  setSelection(sel: { type: string; id: string } | null): void {
    if (!sel || sel.type === "camera" || sel.type === "light") {
      this.tcontrols.detach();
      this.requestRender();
      return;
    }
    const group = this.sm.groupOf(sel.type as "actor" | "prop", sel.id);
    if (!group) {
      this.tcontrols.detach();
      return;
    }
    this.tcontrols.attach(group);
    this.requestRender();
  }

  setMode(mode: "translate" | "rotate"): void {
    this.tcontrols.setMode(mode);
    if (mode === "rotate") {
      this.tcontrols.showX = false;
      this.tcontrols.showY = false;
      this.tcontrols.showZ = true;
    } else {
      this.tcontrols.showX = true;
      this.tcontrols.showY = false;
      this.tcontrols.showZ = true;
    }
    this.requestRender();
  }

  /** 拖动 gizmo → 写回 store（拖动中 preview，松手 endDrag 入栈） */
  private writeBackTransform(): void {
    const obj = this.tcontrols.object;
    const sel = this.store.selected;
    if (!obj || !sel) return;
    const shot = this.store.shot;
    const p = obj.position;
    const facingDeg = THREE.MathUtils.radToDeg(obj.rotation.y);
    this.store.preview((proj) => {
      const s = proj.shots[this.store.shotIndex];
      if (sel.type === "actor") {
        const actor = s.actors.find((a) => a.id === sel.id);
        if (actor) {
          actor.position = [round2(p.x), round2(p.z)];
          actor.facing = Math.round(facingDeg);
        }
      } else if (sel.type === "prop") {
        const prop = s.props.find((x) => x.id === sel.id);
        if (prop) {
          prop.position = [round2(p.x), round2(p.z)];
          prop.facing = Math.round(facingDeg);
        }
      }
      void shot;
    });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
