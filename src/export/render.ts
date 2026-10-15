// P5：离屏高分辨率渲染器（单镜 PNG / 分镜表共用）。
import * as THREE from "three";
import type { Project, Shot } from "../types";
import type { SceneManager } from "../scene/SceneManager";
import { FILM_GAUGE } from "../scene/camera";

export class OffscreenRenderer {
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });

  constructor(
    private scene: THREE.Scene,
    private sm: SceneManager,
  ) {}

  /** 渲染第 index 镜 → dataURL。用该镜的求解机位，宽高比严格 = w/h */
  renderShot(project: Project, index: number, w: number, h: number): string {
    const shot = project.shots[index];
    this.sm.sync(project, index);
    this.renderer.setSize(w, h, false);
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.02, 800);
    cam.filmGauge = FILM_GAUGE;
    const cs = this.sm.cameraState;
    if (cs) {
      cam.position.copy(cs.position);
      cam.up.copy(cs.up);
      cam.lookAt(cs.target);
      cam.setFocalLength((shot as Shot).camera.focalLength ?? 50);
      cam.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, cam);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /** 全部完成后恢复当前镜头的场景 */
  restore(store: { project: Project; shotIndex: number }): void {
    this.sm.sync(store.project, store.shotIndex);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function aspectDims(aspect: number, longEdge: number): { w: number; h: number } {
  return aspect >= 1
    ? { w: longEdge, h: Math.round(longEdge / aspect) }
    : { w: Math.round(longEdge * aspect), h: longEdge };
}
