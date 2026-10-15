// P3：gaze（SPEC §5.6）——由目标方向反算 head turn/nod，超出部分的一半分给 neck。
import * as THREE from "three";
import type { ResolvedPose } from "./rig";

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const clamp = THREE.MathUtils.clamp;

const HEAD_TURN_MAX = 80;
const HEAD_NOD_MAX = 40;
const NECK_TURN_MAX = 80;
const NECK_NOD_MAX = 60;

/**
 * @param headWorld 头部世界坐标（近似即可）
 * @param targetWorld 要看的目标（相机或另一人物）
 * @param facingDeg 人物朝向（度）
 */
export function applyGaze(
  pose: ResolvedPose,
  headWorld: THREE.Vector3,
  targetWorld: THREE.Vector3,
  facingDeg: number,
): void {
  const dir = targetWorld.clone().sub(headWorld);
  // 转到人物局部：facing 绕 Y
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad(-facingDeg));
  const horiz = Math.hypot(dir.x, dir.z);
  const rawTurn = -deg(Math.atan2(dir.x, dir.z)); // turn+ = 向自己右看（-X）
  const rawNod = deg(Math.atan2(-dir.y, horiz)); // nod+ = 低头
  const turn = clamp(rawTurn, -HEAD_TURN_MAX, HEAD_TURN_MAX);
  const nod = clamp(rawNod, -HEAD_NOD_MAX, HEAD_NOD_MAX);
  pose.head.turn = Math.round(turn);
  pose.head.nod = Math.round(nod);
  pose.neck.turn = Math.round(clamp((rawTurn - turn) / 2, -NECK_TURN_MAX, NECK_TURN_MAX));
  pose.neck.nod = Math.round(clamp((rawNod - nod) / 2, -NECK_NOD_MAX, NECK_NOD_MAX));
}
