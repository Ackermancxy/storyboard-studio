// Minimal PMX 2.0 reader: bones + weighted vertices. No textures/faces needed.
import { readFileSync } from "node:fs";

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8() { return this.b.readUInt8(this.o++); }
  i8() { return this.b.readInt8(this.o++); }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return v; }
  vec2() { return [this.f32(), this.f32()]; }
  vec3() { return [this.f32(), this.f32(), this.f32()]; }
  bytes(n) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
  text(enc, n) { return new TextDecoder(enc).decode(this.bytes(n)); }
  index(size) {
    // PMX index sizes: 1 = unsigned, 2 = unsigned, 4 = signed
    if (size === 1) return this.u8();
    if (size === 2) return this.u16();
    return this.i32();
  }
  vertexIndex(g) {
    const v = this.index(g.vertexIndexSize);
    return v < 0 ? -1 : v;
  }
  boneIndex(g) {
    const v = this.index(g.boneIndexSize);
    return v < 0 ? -1 : v;
  }
}

export function readPmx(path) {
  const r = new Reader(readFileSync(path));
  if (r.text("ascii", 4) !== "PMX ") throw new Error("not a PMX file");
  const version = r.f32();
  const headerSize = r.u8();
  const globals = r.bytes(headerSize);
  const enc = globals[0] === 0 ? "utf-8" : "utf-16le";
  const g = {
    additionalUv: globals[1],
    vertexIndexSize: globals[2],
    textureIndexSize: globals[3],
    materialIndexSize: globals[4],
    boneIndexSize: globals[5],
    morphIndexSize: globals[6],
    rigidBodyIndexSize: globals[7],
  };
  const modelNameJp = r.text(enc, r.i32());
  const modelNameEn = r.text(enc, r.i32());
  const commentJp = r.text(enc, r.i32());
  const commentEn = r.text(enc, r.i32());

  // vertices
  const vertexCount = r.i32();
  const vertices = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const pos = r.vec3();
    const normal = r.vec3();
    const uv = r.vec2();
    if (g.additionalUv) for (let k = 0; k < g.additionalUv; k++) r.bytes(16);
    const type = r.u8();
    let weights;
    let sdef;
    if (type === 0) weights = [[r.boneIndex(g), 1]];
    else if (type === 1) {
      const a = r.boneIndex(g), b = r.boneIndex(g), w = r.f32();
      weights = [[a, w], [b, 1 - w]];
    } else if (type === 2) {
      weights = [[r.boneIndex(g), r.f32()], [r.boneIndex(g), r.f32()], [r.boneIndex(g), r.f32()], [r.boneIndex(g), r.f32()]];
    } else if (type === 3) {
      const a = r.boneIndex(g), b = r.boneIndex(g), w = r.f32();
      const c = r.vec3(), r0 = r.vec3(), r1 = r.vec3();
      weights = [[a, w], [b, 1 - w]];
      sdef = { c, r0, r1 };
    } else if (type === 4) {
      weights = [[r.boneIndex(g), r.f32()], [r.boneIndex(g), r.f32()], [r.boneIndex(g), r.f32()], [r.boneIndex(g), r.f32()]];
    } else throw new Error("bad weight type " + type);
    const edgeScale = r.f32();
    vertices[i] = { pos, normal, uv, weights, edgeScale };
  }
  const faceCount = r.i32();
  for (let i = 0; i < faceCount * 3; i++) r.vertexIndex(g);

  // textures
  const textureCount = r.i32();
  const textures = [];
  for (let i = 0; i < textureCount; i++) textures.push(r.text(enc, r.i32()));

  // materials
  const materialCount = r.i32();
  for (let i = 0; i < materialCount; i++) {
    r.text(enc, r.i32()); r.text(enc, r.i32());
    r.bytes(16); // diffuse
    r.bytes(12); // specular
    r.f32(); // specular strength
    r.bytes(12); // ambient
    const flag = r.u8();
    r.bytes(16); // edge color
    r.f32(); // edge size
    r.index(g.textureIndexSize); // texture
    r.index(g.textureIndexSize); // sphere texture
    r.u8(); // sphere mode
    const toonFlag = r.u8();
    r.index(toonFlag === 0 ? g.textureIndexSize : 1);
    r.text(enc, r.i32()); // memo
    r.i32(); // face count
  }

  // bones
  const boneCount = r.i32();
  const bones = new Array(boneCount);
  for (let i = 0; i < boneCount; i++) {
    const nameJp = r.text(enc, r.i32());
    const nameEn = r.text(enc, r.i32());
    const pos = r.vec3();
    const parent = r.boneIndex(g);
    const layer = r.i32();
    const flags = r.u16();
    let tail;
    if (flags & 0x0001) tail = { bone: r.boneIndex(g) };
    else tail = { offset: r.vec3() };
    let grant = null;
    if (flags & 0x0100) grant = { parent: r.boneIndex(g), ratio: r.f32(), rotation: !!(r.u8()), translation: !!(r.u8()) };
    let axis = null;
    if (flags & 0x0200) axis = r.vec3();
    let localAxis = null;
    if (flags & 0x0400) localAxis = { x: r.vec3(), z: r.vec3() };
    let externalParent = null;
    if (flags & 0x1000) externalParent = r.i32();
    let ik = null;
    if (flags & 0x0020) {
      const target = r.boneIndex(g), loop = r.i32(), limit = r.f32();
      const linkCount = r.i32();
      const links = [];
      for (let k = 0; k < linkCount; k++) {
        const bone = r.boneIndex(g);
        const hasLimit = !!r.u8();
        links.push({ bone, hasLimit, min: hasLimit ? r.vec3() : null, max: hasLimit ? r.vec3() : null });
      }
      ik = { target, loop, limit, links };
    }
    bones[i] = { index: i, nameJp, nameEn, pos, parent, layer, flags, tail, grant, axis, localAxis, ik };
  }
  return { version, modelNameJp, modelNameEn, commentJp, g, vertices, bones, textures };
}
