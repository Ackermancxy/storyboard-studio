#!/usr/bin/env node
// 打小红书 SkillHub 引导包：skills/storyboard-hub/ → ~/Downloads/storyboard-<version>.zip
// 包里只有引导器 SKILL.md；完整代码在 GitHub，由它指引 agent clone + install。
// SkillHub 包规则不允许 .mjs 等进包，但打包脚本本身留在仓库里没有限制。
// 用法：node scripts/pack-hub.mjs [输出路径]
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { deflateRawSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repo, "skills", "storyboard-hub");

const md = readFileSync(join(srcDir, "SKILL.md"), "utf8");
const version = (/^version:\s*(\S+)/m.exec(md) || [])[1];
if (!version) {
  console.error("SKILL.md frontmatter 里找不到 version。");
  process.exit(1);
}
const out = resolve(process.argv[2] || join(homedir(), "Downloads", `storyboard-${version}.zip`));

/* 零依赖 zip（deflate） */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
};

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time & 0xffff, date & 0xffff];
}

function zipFiles(files) {
  const [time, date] = dosDateTime(new Date());
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    h.writeUInt16LE(8, 8); // deflate
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(deflated.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    local.push(h, nameBuf, deflated);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(deflated.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(0, 38); // 外部属性
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, eocd]);
}

const files = [{ name: "SKILL.md", data: readFileSync(join(srcDir, "SKILL.md")) }];
const zip = zipFiles(files);
writeFileSync(out, zip);

const sha = await (async () => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(zip).digest("hex");
})();
console.log(`打包完成 → ${out}`);
console.log(`  版本: ${version}  大小: ${zip.length} bytes  SHA-256: ${sha}`);
