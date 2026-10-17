// 回归测试：MMD 换装层隐藏 / 材质换色 / 释放。三个都出过真实 bug：
// 1) 换装层只按贴图名匹配 → 加载时贴图还没填 image，隐藏全部落空，内衣穿模出彩点
// 2) setRigColor 把带贴图的材质也染了 → 整张贴图被乘成单色，且模板共享材质会串色
// 3) disposeMannequin 假设单个材质 → GLTF/MMD 网格是材质数组，切模型时抛异常
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { mmdHideTextures } from "../src/scene/assets";
import { buildMannequin, disposeMannequin, setRigColor } from "../src/scene/mannequin";
import type { Rig } from "../src/scene/rig";

/** 造一个「像 SkinnedMesh」的容器：mmdHideTextures 只认 isSkinnedMesh + material */
function skinnedStub(material: THREE.Material | THREE.Material[]): THREE.Object3D {
  const o = new THREE.Group();
  (o as unknown as { isSkinnedMesh: boolean }).isSkinnedMesh = true;
  (o as unknown as { material: THREE.Material | THREE.Material[] }).material = material;
  return o;
}

/** 模拟贴图：只关心 map.source.data.src（真实加载完成前这里是空的） */
function tex(src: string): THREE.Texture {
  const t = new THREE.Texture();
  t.source.data = { src } as unknown as HTMLImageElement;
  return t;
}

function namedMaterial(name: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.name = name;
  return m;
}

describe("mmdHideTextures（换装层隐藏）", () => {
  it("按 PMX 材质名隐藏——贴图没到也要生效", () => {
    const mats = ["制服", "下着", "水着", "スク水"].map(namedMaterial);
    const root = new THREE.Group();
    root.add(skinnedStub(mats));

    mmdHideTextures(root, ["下着", "水着", "スク水"]);

    expect(mats.map((m) => m.visible)).toEqual([true, false, false, false]);
  });

  it("贴图名兜底：材质无名时按贴图文件名匹配（含百分号编码）", () => {
    const dress = new THREE.MeshStandardMaterial({ map: tex("http://x/tex/%E6%9C%8D.png") });
    const swim = new THREE.MeshStandardMaterial({ map: tex("http://x/tex/%E6%B0%B4%E7%9D%80.png") });
    const root = new THREE.Group();
    root.add(skinnedStub([dress, swim]));

    mmdHideTextures(root, ["水着"]);

    expect(dress.visible).toBe(true);
    expect(swim.visible).toBe(false);
  });

  it("贴图还没加载（src 为空）且材质无名时不动手，不误伤", () => {
    const pending = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const root = new THREE.Group();
    root.add(skinnedStub(pending));

    mmdHideTextures(root, ["下着"]);

    expect(pending.visible).toBe(true);
  });

  it("单材质（非数组）同样处理", () => {
    const only = namedMaterial("下着");
    const root = new THREE.Group();
    root.add(skinnedStub(only));

    mmdHideTextures(root, ["下着"]);

    expect(only.visible).toBe(false);
  });
});

describe("setRigColor（人物换色）", () => {
  it("跳过带贴图的材质，只染单色材质", () => {
    const plain = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mapped = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex("http://x/body.png") });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), plain));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mapped));

    setRigColor({ root } as unknown as Rig, "#ff0000");

    expect(plain.color.getHexString()).toBe("ff0000");
    expect(mapped.color.getHexString()).toBe("ffffff");
  });

  it("木头人（无贴图）照旧整体换色", () => {
    const rig = buildMannequin({ build: "male", height: 1.78 });

    setRigColor(rig, "#ff0000");

    let tinted = 0;
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if ((mat as THREE.MeshStandardMaterial).color?.getHexString() === "ff0000") tinted++;
      }
    });
    expect(tinted).toBeGreaterThan(0);
  });
});

describe("disposeMannequin（释放）", () => {
  it("材质是数组也不抛，且逐个释放（GLTF/MMD 每个材质组一个材质）", () => {
    const mats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const spies = mats.map((m) => vi.spyOn(m, "dispose"));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mats));

    expect(() => disposeMannequin({ root } as unknown as Rig)).not.toThrow();
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});
