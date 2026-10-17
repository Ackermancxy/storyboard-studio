// 视口飞行控制：WASD 平移、鼠标环视/转向、Shift 加速、Ctrl 微调、Space/C 升降、滚轮调速。
// 被驱动的「主体」可以是相机、机位相机、或者选中的物体（人物/道具/灯），由调用方给出读写方式。
import * as THREE from "three";

const MOVE_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "Space", "KeyC", "KeyQ", "KeyE",
]);

const LOOK_SPEED = 0.0026; // 像素 → 弧度
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);

function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/** 飞行目标：视图相机 / 机位相机 / 选中对象 */
export type FlyTarget = "view" | "shot" | "selected";

/** 被飞行键位驱动的主体 */
export interface FlySubject {
  /** 显示名（HUD 提示用） */
  label: string;
  /** 被驱动的位置：相机可直接给 camera.position；物体给一个代理 Vector3 */
  position: THREE.Vector3;
  /** camera：鼠标允许俯仰；object：只转 yaw（人物/道具的朝向） */
  allowPitch: boolean;
  /** 最低高度（相机 0.05，贴地物体 0） */
  minY: number;
  /** WASD 的参考坐标系；缺省用自身朝向 */
  frame?: THREE.Quaternion;
  getYaw(): number;
  getPitch(): number;
  setYawPitch(yaw: number, pitch: number): void;
  /** 位置/朝向改动后（每帧、拖拽、滚轮） */
  commit(): void;
}

export class FlyControls {
  /** 一次拖拽/飞行结束（收尾：endDrag + 最终写回） */
  onRelease: (() => void) | null = null;
  /** 未拖动的点击 → 交给视口做拾取 */
  onClick: ((e: PointerEvent) => void) | null = null;

  private subj: FlySubject | null = null;
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private raf = 0;
  private lastT = 0;
  private dragging = false;
  private dragged = 0;
  private lastX = 0;
  private lastY = 0;
  /** 米/秒（Shift ×4，Ctrl ×0.25，滚轮可调） */
  speed = 3.2;

  constructor(private dom: HTMLElement) {
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);
    dom.addEventListener("contextmenu", this.onContextMenu);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
  }

  get active(): boolean {
    return this.subj !== null;
  }

  enter(subj: FlySubject): void {
    this.subj = subj;
    this.yaw = subj.getYaw();
    this.pitch = THREE.MathUtils.clamp(subj.getPitch(), -PITCH_LIMIT, PITCH_LIMIT);
    this.keys.clear();
    this.lastT = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  exit(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.subj = null;
    this.keys.clear();
    this.dragging = false;
  }

  /** 当前主体的视线方向（写回机位 target 用） */
  forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.orientation());
  }

  hint(): string {
    const s = this.subj;
    const who = s ? s.label : "";
    const pitch = s?.allowPitch ? "环视转方向" : "转向";
    return `飞行[${who}] · WASD 移动 · 左键拖拽${pitch} · Shift 加速 · Ctrl 微调 · Space/C 升降 · 滚轮调速（${this.speed.toFixed(1)} m/s）· F/V/X/Esc 退出`;
  }

  private orientation(): THREE.Quaternion {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const subj = this.subj;
    if (!subj) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    const k = this.keys;
    let f = 0;
    let r = 0;
    let u = 0;
    if (k.has("KeyW")) f += 1;
    if (k.has("KeyS")) f -= 1;
    if (k.has("KeyD")) r += 1;
    if (k.has("KeyA")) r -= 1;
    if (k.has("Space") || k.has("KeyE")) u += 1;
    if (k.has("KeyC") || k.has("KeyQ")) u -= 1;
    if (f === 0 && r === 0 && u === 0) return;

    let speed = this.speed;
    if (k.has("ShiftLeft") || k.has("ShiftRight")) speed *= 4;
    if (k.has("ControlLeft") || k.has("ControlRight")) speed *= 0.25;

    // 参考朝向：物体模式用视图朝向（W = 远离镜头），相机模式用自身朝向
    const frame = subj.frame ?? this.orientation();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(frame);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
    if (!subj.allowPitch) {
      // 物体只在地面平面里移动
      fwd.y = 0;
      right.y = 0;
      if (fwd.lengthSq() > 1e-6) fwd.normalize();
      if (right.lengthSq() > 1e-6) right.normalize();
    }
    const step = new THREE.Vector3()
      .addScaledVector(fwd, f)
      .addScaledVector(right, r)
      .add(new THREE.Vector3(0, u, 0));
    if (step.lengthSq() < 1e-8) return;
    subj.position.addScaledVector(step.normalize(), speed * dt);
    subj.position.y = Math.max(subj.minY, subj.position.y);
    subj.commit();
  };

  private applyLook(): void {
    const subj = this.subj;
    if (!subj) return;
    subj.setYawPitch(this.yaw, this.pitch);
    subj.commit();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.subj || isTyping(e)) return;
    if (!MOVE_CODES.has(e.code)) return;
    if (e.code === "Space") e.preventDefault(); // 别滚页面
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private clearKeys = (): void => {
    this.keys.clear();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.subj || (e.button !== 0 && e.button !== 2)) return;
    this.dragging = true;
    this.dragged = 0;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    try { this.dom.setPointerCapture(e.pointerId); } catch { /* 合成事件没有真实指针 */ }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.subj || !this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.dragged += Math.abs(dx) + Math.abs(dy);
    if (this.dragged < 3) return; // 小抖动不算拖动
    this.yaw -= dx * LOOK_SPEED;
    if (this.subj.allowPitch) {
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
    }
    this.applyLook();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.subj) return;
    const wasDrag = this.dragged >= 3;
    this.dragging = false;
    try {
      if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
    } catch { /* 同上 */ }
    if (!wasDrag && e.button === 0) this.onClick?.(e);
    this.onRelease?.();
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.subj) e.preventDefault(); // 右键环视时别弹菜单
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.subj) return;
    e.preventDefault();
    const next = this.speed * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
    this.speed = THREE.MathUtils.clamp(next, 0.3, 40);
    this.subj.commit();
  };
}
