// P3：视口 —— 机位视图（letterbox + 三分线 + HUD）/ 导演视图（自由 + 相机 gizmo）/ 俯视视图。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { Store } from "../state/store";
import type { Shot } from "../types";
import type { SceneManager } from "../scene/SceneManager";
import { FILM_GAUGE } from "../scene/camera";
import { characterDef } from "../scene/assets";
import { FlyControls, type FlySubject, type FlyTarget } from "./flycam";

export type ViewMode = "shot" | "director" | "top";

const BG_BAR = 0x0b0b0e;

export class Viewport {
  mode: ViewMode = "shot";
  readonly shotCam: THREE.PerspectiveCamera;
  readonly directorCam: THREE.PerspectiveCamera;
  readonly topCam: THREE.OrthographicCamera;
  private directorControls: OrbitControls;
  private topControls: OrbitControls;
  private tcontrols: TransformControls;
  private raycaster = new THREE.Raycaster();
  private dirty = true;
  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private hud: HTMLElement;
  private thirds: HTMLDivElement;
  private camGizmo: THREE.Group;
  private camHelper: THREE.CameraHelper;
  overlayVisible = true;
  private camDragRef: { forward: THREE.Vector3; dist: number } | null = null;
  /** 飞行相机（WASD + 鼠标）；机位视图下直接驱动机位相机并写回 manual */
  private fly: FlyControls;
  private flyHint: HTMLDivElement;
  private flyDist = 3;
  private lastFlyWrite = 0;
  /** 当前飞行目标 + 物体飞行用的代理位置 */
  private flyTargetName: FlyTarget | null = null;
  private flyPos = new THREE.Vector3();
  private gizmoMode: "translate" | "rotate" = "translate";
  private helpersHidden = false;

  constructor(
    private scene: THREE.Scene,
    private store: Store,
    private sm: SceneManager,
    private onChange: () => void,
  ) {
    this.container = document.getElementById("viewport")!;
    const canvas = document.getElementById("view3d") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // 机位相机：filmGauge 36 + setFocalLength（SPEC §7.1）
    this.shotCam = new THREE.PerspectiveCamera(40, 1.5, 0.02, 800);
    this.shotCam.filmGauge = FILM_GAUGE;

    this.directorCam = new THREE.PerspectiveCamera(50, 1, 0.05, 800);
    this.directorCam.position.set(4.2, 3.2, 5.2);

    this.topCam = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 100);
    this.topCam.position.set(0, 30, 0);
    this.topCam.up.set(0, 0, -1); // 舞台背面朝屏幕上方
    this.topCam.lookAt(0, 0, 0);
    this.topCam.zoom = 0.5;
    this.topCam.updateProjectionMatrix();

    this.directorControls = new OrbitControls(this.directorCam, canvas);
    this.directorControls.target.set(0, 0.9, 0);
    this.directorControls.addEventListener("change", () => this.requestRender());
    this.topControls = new OrbitControls(this.topCam, canvas);
    this.topControls.enableRotate = false;
    this.topControls.addEventListener("change", () => this.requestRender());

    this.tcontrols = new TransformControls(this.directorCam, canvas);
    this.tcontrols.addEventListener("dragging-changed", (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      this.directorControls.enabled = !dragging;
      if (!dragging) {
        this.store.endDrag();
        this.camDragRef = null;
        this.onChange();
      } else if (this.tcontrols.object === this.camGizmo) {
        const cs = this.sm.cameraState;
        if (cs) {
          const forward = cs.target.clone().sub(cs.position).normalize();
          this.camDragRef = { forward, dist: cs.target.distanceTo(cs.position) };
        }
      }
    });
    this.tcontrols.addEventListener("objectChange", () => {
      if (this.tcontrols.object === this.camGizmo) this.writeBackCameraDrag();
      else this.writeBackTransform();
    });
    const helper = this.tcontrols.getHelper();
    helper.traverse((o) => {
      o.userData.__gizmo = true;
    });
    scene.add(helper);

    // 相机 gizmo（导演/俯视视图显示）
    this.camGizmo = new THREE.Group();
    this.camGizmo.name = "camera:gizmo";
    this.camGizmo.userData.entity = { type: "camera", id: "camera" };
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x66d9a0, roughness: 0.6 }),
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x2f8f65 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.16;
    this.camGizmo.add(body, lens);
    scene.add(this.camGizmo);
    this.camHelper = new THREE.CameraHelper(this.shotCam);
    scene.add(this.camHelper);

    // 覆盖层：三分线 + 中心十字 + HUD
    this.overlay = document.createElement("div");
    this.overlay.style.cssText = "position:absolute;pointer-events:none;inset:0;";
    this.thirds = document.createElement("div");
    this.thirds.style.cssText = "position:absolute;";
    this.thirds.innerHTML =
      '<div class="thirds-line" style="left:33.33%"></div><div class="thirds-line" style="left:66.66%"></div>' +
      '<div class="thirds-line" style="top:33.33%"></div><div class="thirds-line" style="top:66.66%"></div>' +
      '<div class="cross-h"></div><div class="cross-v"></div>';
    this.hud = document.createElement("div");
    this.hud.id = "view-hud";
    this.overlay.appendChild(this.thirds);
    this.overlay.appendChild(this.hud);
    this.container.appendChild(this.overlay);

    this.flyHint = document.createElement("div");
    this.flyHint.id = "fly-hint";
    this.flyHint.style.cssText =
      "position:absolute;left:10px;bottom:10px;padding:4px 10px;border-radius:5px;" +
      "background:rgba(0,0,0,.55);color:#d8d8de;font-size:12px;display:none;pointer-events:none;z-index:5;";
    this.container.appendChild(this.flyHint);

    this.fly = new FlyControls(canvas);
    this.fly.onRelease = () => {
      this.flushFlyWrite();
      this.store.endDrag();
      this.requestRender();
    };
    this.fly.onClick = (e) => this.pickAt(e);

    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize();
  }
  readonly renderer: THREE.WebGLRenderer;

  get activeCamera(): THREE.Camera {
    return this.mode === "shot" ? this.shotCam : this.mode === "top" ? this.topCam : this.directorCam;
  }

  /** 按需渲染：置脏 + 合帧（一帧内多次请求只画一次） */
  requestRender(): void {
    this.dirty = true;
    if (this.rafId === 0) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.render();
      });
    }
  }
  private rafId = 0;

  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const shot = this.store.shot;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // 相机 gizmo / 视锥 / 灯位只在导演和俯视视图显示
    const showGizmos = this.mode !== "shot" && !this.helpersHidden;
    this.camGizmo.visible = showGizmos;
    this.camHelper.visible = showGizmos;
    this.sm.setGizmosVisible(showGizmos);
    const flying = this.fly.active;
    this.tcontrols.enabled = this.mode === "director" && !flying;

    // 相机 gizmo 跟随机位相机；正在飞它时由飞行器接管（机位视图或第三人称飞机位）
    const drivingShot = flying && (this.mode === "shot" || this.flyTargetName === "shot");
    if (!drivingShot) this.updateShotCamera(shot);
    this.camGizmo.position.copy(this.shotCam.position);
    this.camGizmo.quaternion.copy(this.shotCam.quaternion);
    this.camHelper.update();

    this.directorControls.enabled = this.mode === "director" && !this.tcontrols.dragging && !flying;
    this.topControls.enabled = this.mode === "top" && !this.tcontrols.dragging;

    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(BG_BAR);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.clear();

    if (this.mode === "shot") {
      const aspect = this.sm.aspect;
      let innerW = w;
      let innerH = w / aspect;
      if (innerH > h) {
        innerH = h;
        innerW = h * aspect;
      }
      const ox = (w - innerW) / 2;
      const oy = (h - innerH) / 2;
      this.renderer.setViewport(ox, oy, innerW, innerH);
      this.renderer.setScissor(ox, oy, innerW, innerH);
      this.renderer.render(this.scene, this.shotCam);
      this.layoutOverlay(ox, h - oy - innerH, innerW, innerH);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.activeCamera);
      this.layoutOverlay(0, 0, 0, 0);
    }
  }

  /** 机位视图的覆盖层几何 + HUD */
  private layoutOverlay(x: number, y: number, w: number, h: number): void {
    const show = this.mode === "shot" && this.overlayVisible && w > 0;
    this.thirds.style.display = show ? "block" : "none";
    this.hud.style.display = this.mode === "shot" ? "block" : "none";
    if (show) {
      this.thirds.style.left = `${x}px`;
      this.thirds.style.top = `${y}px`;
      this.thirds.style.width = `${w}px`;
      this.thirds.style.height = `${h}px`;
    }
    if (this.mode === "shot") {
      const shot = this.store.shot;
      this.hud.textContent = `${shot.id} · ${this.sm.hudText()}`;
      this.hud.style.left = "10px";
      this.hud.style.top = "8px";
    }
  }

  private updateShotCamera(shot: Shot): void {
    const cs = this.sm.cameraState;
    if (!cs) return;
    // 关键：aspect 必须同步成项目画幅，否则 setFocalLength 的 FOV 与 solveCamera 不一致
    const aspect = this.sm.aspect;
    if (Math.abs(this.shotCam.aspect - aspect) > 1e-6) this.shotCam.aspect = aspect;
    this.shotCam.position.copy(cs.position);
    this.shotCam.up.copy(cs.up);
    this.shotCam.lookAt(cs.target);
    this.shotCam.setFocalLength(shot.camera.focalLength ?? 50);
    this.shotCam.updateProjectionMatrix();
  }

  setMode(mode: ViewMode): void {
    this.stopFly();
    this.mode = mode;
    this.tcontrols.detach();
    this.overlay.style.display = "block";
    if (mode === "shot") {
      this.overlayVisible = true;
    }
    this.requestRender();
  }
  /** 视角切换：机位 ⇄ 导演（俯视时回机位）；飞行中切换不中断，接着飞新视图的相机 */
  toggleView(): void {
    const wasFlying = this.fly.active;
    const target = this.flyTargetName;
    this.setMode(this.mode === "shot" ? "director" : "shot");
    if (wasFlying) this.toggleFly(target ?? "view");
  }
  toggleTop(): void {
    this.setMode(this.mode === "top" ? "shot" : "top");
  }
  toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
    this.requestRender();
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sm.setShadows(on);
    this.requestRender();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.directorCam.aspect = w / h;
    this.directorCam.updateProjectionMatrix();
    const frustum = 6 / this.topCam.zoom;
    this.topCam.left = (-frustum * w) / h / 2;
    this.topCam.right = (frustum * w) / h / 2;
    this.topCam.top = frustum / 2;
    this.topCam.bottom = -frustum / 2;
    this.topCam.updateProjectionMatrix();
    this.requestRender();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this.tcontrols.dragging || this.fly.active) return;
    this.pickAt(e);
  }

  /** 拾取：点选人物/道具/灯/相机 */
  private pickAt(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.activeCamera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if ((hit.object as THREE.Line).isLine) continue;
      if (this.hasFlag(hit.object, "__gizmo")) continue;
      if (hit.object === this.camGizmo || this.hasFlag(hit.object, "__camgizmo")) {
        this.store.setSelected({ type: "camera", id: "camera" });
        return;
      }
      const entity = this.sm.findEntity(hit.object);
      if (entity) {
        this.store.setSelected({ type: entity.type, id: entity.id });
        return;
      }
    }
    this.store.setSelected(null);
  }
  private hasFlag(obj: THREE.Object3D | null, flag: string): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData[flag]) return true;
      cur = cur.parent;
    }
    return false;
  }

  setSelection(sel: { type: string; id: string } | null): void {
    if (this.mode !== "director" || !sel || this.fly.active) {
      this.tcontrols.detach();
      this.requestRender();
      return;
    }
    if (sel.type === "camera") {
      this.tcontrols.attach(this.camGizmo);
    } else {
      const group = this.sm.groupOf(sel.type as "actor" | "prop" | "light", sel.id);
      if (group) this.tcontrols.attach(group);
      else this.tcontrols.detach();
    }
    this.setGizmoMode(this.gizmoMode);
    this.requestRender();
  }

  setGizmoMode(mode: "translate" | "rotate"): void {
    this.gizmoMode = mode;
    this.tcontrols.setMode(mode);
    // 灯要 3D 摆位（绕被摄者定方位）；人物/道具只在 XZ 平面挪
    const isLight = this.store.selected?.type === "light";
    this.tcontrols.showX = true;
    this.tcontrols.showY = mode === "translate" && isLight;
    this.tcontrols.showZ = true;
    this.requestRender();
  }

  /** 离屏捕获（缩略图/导出）期间隐藏 gizmo：它们和正式画面共用同一个 scene，
   *  不隐藏会把相机模型、灯位线、变换轴一起拍进图里（表现为缩略图整块绿）。 */
  setHelpersVisible(visible: boolean): void {
    this.helpersHidden = !visible;
    // 必须同步生效：缩略图/导出是当场同步渲染的，等不到下一次 rAF
    const show = visible && this.mode !== "shot";
    this.camGizmo.visible = show;
    this.camHelper.visible = show;
    this.tcontrols.getHelper().visible = show;
    this.sm.setGizmosVisible(show);
    this.requestRender();
  }

  /* ── 飞行（WASD + 鼠标）：可驱动视图相机 / 机位相机 / 选中对象 ── */
  get flying(): boolean {
    return this.fly.active;
  }

  get flyTarget(): FlyTarget | null {
    return this.flyTargetName;
  }

  /**
   * @param target view = 当前视图相机（第三人称=导演相机，机位视图=机位相机）
   *               shot = 机位相机（第三人称下也可飞它）
   *               selected = 用飞行键位控制选中的人物/道具/灯/相机
   */
  toggleFly(target: FlyTarget): void {
    if (this.fly.active) {
      const same = this.flyTargetName === target;
      this.stopFly();
      if (same) return; // 再按一次同一个键 = 退出
    }
    if (this.mode === "top") return; // 俯视视图不放飞
    const subj = this.makeFlySubject(target);
    if (!subj) return;
    this.flyTargetName = target;
    const cs = this.sm.cameraState;
    this.flyDist = cs ? Math.max(0.3, cs.position.distanceTo(cs.target)) : 3;
    this.tcontrols.detach();
    this.directorControls.enabled = false;
    this.store.beginDragOnce(); // 一次飞行算一步撤销
    this.fly.enter(subj);
    this.refreshFlyHint();
    this.flyHint.style.display = "block";
    this.requestRender();
  }

  /** 取景重置：把机位相机和主体一起框回导演视图（相机被拖远/飞丢时用） */
  frameAll(): void {
    const cs = this.sm.cameraState;
    const camPos = this.shotCam.position.clone();
    const subject = cs ? cs.target.clone() : new THREE.Vector3(0, 0.9, 0);
    const mid = camPos.clone().add(subject).multiplyScalar(0.5);
    const span = camPos.distanceTo(subject);
    const dist = THREE.MathUtils.clamp(span * 0.9 + 1.5, 2.5, 12);
    const side = new THREE.Vector3(0.7, 0.55, 0.7).normalize();
    this.directorCam.position.copy(mid).addScaledVector(side, dist);
    this.directorControls.target.copy(mid);
    this.directorControls.update();
    this.requestRender();
  }

  /** 退出飞行（Esc / 切视图） */
  exitFly(): void {
    this.stopFly();
  }

  private stopFly(): void {
    if (!this.fly.active) return;
    this.flushFlyWrite();
    this.fly.exit();
    this.flyTargetName = null;
    this.flyHint.style.display = "none";
    this.store.endDrag();
    this.requestRender();
  }

  private refreshFlyHint(): void {
    if (this.fly.active) this.flyHint.textContent = this.fly.hint();
  }

  private makeFlySubject(target: FlyTarget): FlySubject | null {
    if (target === "selected") {
      const sel = this.store.selected;
      if (!sel) return null;
      if (sel.type === "camera") return this.shotCamSubject("机位相机");
      const group = this.sm.groupOf(sel.type as "actor" | "prop" | "light", sel.id);
      if (!group) return null;
      const isLight = sel.type === "light";
      // 人物/道具的 group.y 恒为 0（高度由 elevation 驱动），所以用代理位置
      const baseY = isLight ? group.position.y : this.selectedElevation(sel);
      this.flyPos.set(group.position.x, Math.max(0, baseY), group.position.z);
      const viewQ = (this.mode === "shot" ? this.shotCam : this.directorCam).quaternion.clone();
      return {
        label: `${kindName(sel.type)} ${sel.id}`,
        position: this.flyPos,
        allowPitch: false, // 物体只转朝向，不翻跟头
        minY: 0,
        frame: viewQ,
        getYaw: () => THREE.MathUtils.radToDeg(group.rotation.y),
        getPitch: () => 0,
        setYawPitch: (yaw) => {
          if (!isLight) group.rotation.y = THREE.MathUtils.degToRad(yaw);
        },
        commit: () => this.commitSelected(sel, group),
      };
    }
    if (target === "shot" || this.mode === "shot") {
      return this.shotCamSubject(target === "shot" ? "机位相机" : "机位相机（当前视图）");
    }
    return this.cameraSubject(this.directorCam, "导演相机", () => this.requestRender());
  }

  private cameraSubject(
    cam: THREE.PerspectiveCamera,
    label: string,
    after: () => void,
  ): FlySubject {
    return {
      label,
      position: cam.position,
      allowPitch: true,
      minY: 0.05,
      getYaw: () => new THREE.Euler().setFromQuaternion(cam.quaternion, "YXZ").y,
      getPitch: () => new THREE.Euler().setFromQuaternion(cam.quaternion, "YXZ").x,
      setYawPitch: (yaw, pitch) => {
        cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        cam.updateMatrixWorld();
      },
      commit: () => {
        this.refreshFlyHint();
        after();
      },
    };
  }

  private shotCamSubject(label: string): FlySubject {
    return this.cameraSubject(this.shotCam, label, () => this.writeBackShotCam());
  }

  private selectedElevation(sel: { type: string; id: string }): number {
    const shot = this.store.shot;
    if (sel.type === "actor") return shot.actors.find((a) => a.id === sel.id)?.elevation ?? 0;
    if (sel.type === "prop") return shot.props.find((x) => x.id === sel.id)?.elevation ?? 0;
    return 0;
  }

  /** 飞行控制选中物体：写回位置/朝向/垫高（灯则换算方位角/仰角/距离） */
  private commitSelected(sel: { type: string; id: string }, group: THREE.Object3D): void {
    const now = performance.now();
    if (now - this.lastFlyWrite < 100) return; // 节流，别每帧重建整个场景
    this.lastFlyWrite = now;
    this.refreshFlyHint();
    const p = this.flyPos;
    const facingDeg = THREE.MathUtils.radToDeg(group.rotation.y);
    this.store.beginDragOnce();
    this.store.preview((proj) => {
      const s = proj.shots[this.store.shotIndex];
      if (sel.type === "actor") {
        const a = s.actors.find((x) => x.id === sel.id);
        if (a) {
          a.position = [round2(p.x), round2(p.z)];
          a.facing = Math.round(facingDeg);
          a.elevation = Math.max(0, round2(p.y));
        }
      } else if (sel.type === "prop") {
        const pr = s.props.find((x) => x.id === sel.id);
        if (pr) {
          pr.position = [round2(p.x), round2(p.z)];
          pr.facing = Math.round(facingDeg);
          pr.elevation = Math.max(0, round2(p.y));
        }
      } else if (sel.type === "light") {
        const l = s.lights.find((x) => x.id === sel.id);
        const subj = s.actors.find((a) => a.id === l?.subject) ?? s.actors[0];
        if (l && subj) {
          const h = characterDef(subj.model)?.height ?? 1.73;
          const aim = new THREE.Vector3(subj.position[0], h * 0.75, subj.position[1]);
          const d = new THREE.Vector3(p.x, p.y, p.z).sub(aim);
          const dist = d.length();
          if (dist > 1e-3) {
            l.azimuth = Math.round(
              normalizeDeg(THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)) - subj.facing),
            );
            l.elevation = Math.round(
              THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1))),
            );
            l.distance = round2(Math.max(0.3, dist));
          }
        }
      }
    });
    this.requestRender();
  }

  /** 收尾：把节流中最后一次改动强制写回 */
  private flushFlyWrite(): void {
    this.lastFlyWrite = 0;
    const target = this.flyTargetName;
    if (target === "selected") {
      const sel = this.store.selected;
      if (!sel) return;
      if (sel.type === "camera") {
        this.writeBackShotCam(true);
      } else {
        const group = this.sm.groupOf(sel.type as "actor" | "prop" | "light", sel.id);
        if (group) this.commitSelected(sel, group);
      }
      return;
    }
    if (target === "shot") this.writeBackShotCam(true);
  }

  /** 机位相机飞行：把 shotCam 的位置/朝向写回 manual 机位（节流，避免每帧重建） */
  private writeBackShotCam(force = false): void {
    if (!(this.mode === "shot" || this.flyTargetName === "shot")) return;
    const now = performance.now();
    if (!force && now - this.lastFlyWrite < 120) return;
    this.lastFlyWrite = now;
    this.refreshFlyHint();
    const pos = this.shotCam.position;
    const target = pos.clone().addScaledVector(this.fly.forward(), this.flyDist);
    this.store.beginDragOnce();
    this.store.preview((p) => {
      const cam = p.shots[this.store.shotIndex].camera;
      cam.mode = "manual";
      cam.position = [round2(pos.x), round2(pos.y), round2(pos.z)];
      cam.target = [round2(target.x), round2(target.y), round2(target.z)];
    });
    this.requestRender();
  }

  /** 拖相机 gizmo → 写回 manual position/target */
  private writeBackCameraDrag(): void {
    const ref = this.camDragRef;
    if (!ref) return;
    const sel = this.store.selected;
    if (sel?.type !== "camera") return;
    const pos = this.camGizmo.position;
    const target = pos.clone().addScaledVector(ref.forward, ref.dist);
    this.store.beginDragOnce();
    this.store.preview((p) => {
      const cam = p.shots[this.store.shotIndex].camera;
      cam.mode = "manual";
      cam.position = [round2(pos.x), round2(pos.y), round2(pos.z)];
      cam.target = [round2(target.x), round2(target.y), round2(target.z)];
    });
  }

  /** 拖人物/道具/灯 gizmo → 写回 store */
  private writeBackTransform(): void {
    const obj = this.tcontrols.object;
    const sel = this.store.selected;
    if (!obj || !sel || sel.type === "camera") return;
    if (sel.type === "light") {
      this.writeBackLight(obj.position);
      return;
    }
    const p = obj.position;
    const facingDeg = THREE.MathUtils.radToDeg(obj.rotation.y);
    this.store.beginDragOnce();
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
    });
  }

  /** 拖灯 gizmo：世界坐标逆算回 azimuth / elevation / distance（placeLight 的逆运算） */
  private writeBackLight(pos: THREE.Vector3): void {
    const shot = this.store.shot;
    const light = shot.lights.find((l) => l.id === this.store.selected?.id);
    if (!light) return;
    const subject = shot.actors.find((a) => a.id === light.subject) ?? shot.actors[0];
    if (!subject) return;
    const h = characterDef(subject.model)?.height ?? 1.73;
    const aim = new THREE.Vector3(subject.position[0], h * 0.75, subject.position[1]);
    const d = pos.clone().sub(aim);
    const dist = d.length();
    if (dist < 1e-3) return;
    const elevation = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1)),
    );
    const azimuth = normalizeDeg(THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)) - subject.facing);
    this.store.beginDragOnce();
    this.store.preview((proj) => {
      const l = proj.shots[this.store.shotIndex].lights.find((x) => x.id === light.id);
      if (!l) return;
      l.azimuth = Math.round(azimuth);
      l.elevation = Math.round(elevation);
      l.distance = round2(Math.max(0.3, dist));
    });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function kindName(type: string): string {
  return { actor: "人物", prop: "道具", light: "灯", camera: "相机" }[type] ?? type;
}

function normalizeDeg(v: number): number {
  const w = ((v + 180) % 360 + 360) % 360 - 180;
  return w;
}
