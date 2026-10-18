// 轻量三维数学（与 three.js 相同的四元数约定，零依赖）
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export function norm(a) {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/* ── 四元数 [x,y,z,w] ── */
export const QI = [0, 0, 0, 1];
export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function qAxis(axis, angle) {
  const a = norm(axis);
  const h = angle / 2;
  const s = Math.sin(h);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(h)];
}
/** THREE.Quaternion.setFromEuler(order='XYZ') 的等价实现 */
export function qEulerXYZ(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}
/** THREE.Quaternion.setFromUnitVectors 的等价实现 */
export function qFromTo(from, to) {
  let r = dot(from, to) + 1;
  let q;
  if (r < 1e-8) {
    // 反向：绕任意正交轴转 180°
    if (Math.abs(from[0]) > Math.abs(from[2])) q = [-from[1], from[0], 0, 0];
    else q = [0, -from[2], from[1], 0];
  } else {
    const c = cross(from, to);
    q = [c[0], c[1], c[2], r];
  }
  return qnorm(q);
}
export function qRot(q, v) {
  // v' = v + 2*q.xyz×(q.xyz×v + q.w*v)
  const t = cross([q[0], q[1], q[2]], add(cross([q[0], q[1], q[2]], v), mul(v, q[3])));
  const t2 = mul(t, 2);
  return add(v, t2);
}
export const axisAngleY = (deg) => qAxis([0, 1, 0], (deg * Math.PI) / 180);
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

/** 点到线段最近点参数 t ∈ [0,1] */
export function pointSegT(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return 0;
  return Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
}
export function pointSegDist(p, a, b) {
  const t = pointSegT(p, a, b);
  return dist(p, add(a, mul(sub(b, a), t)));
}

/** 两线段最近距离与最近点 */
export function segSegDist(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) return { d: dist(p1, p2), s: 0, t: 0 };
  if (a <= EPS) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const c1 = add(p1, mul(d1, s));
  const c2 = add(p2, mul(d2, t));
  return { d: dist(c1, c2), s, t, c1, c2 };
}

/** 2D 凸包（Andrew monotone chain），输入 [[x,z],…] */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 点到凸多边形边界的有符号距离（内部为正） */
export function polygonMargin(p, poly) {
  if (!poly || poly.length === 0) return -Infinity;
  if (poly.length === 1) return 0.04 - Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]);
  if (poly.length === 2) {
    const a = poly[0], b = poly[1];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
    const q = [a[0] + abx * t, a[1] + abz * t];
    return 0.02 - Math.hypot(p[0] - q[0], p[1] - q[1]);
  }
  let inside = true;
  let minEdge = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const px = p[0] - a[0], pz = p[1] - a[1];
    const c = ex * pz - ez * px;
    if (c < 0) inside = false;
    const l = Math.hypot(ex, ez) || 1e-9;
    minEdge = Math.min(minEdge, Math.abs(c) / l);
  }
  return inside ? minEdge : -minEdge;
}
