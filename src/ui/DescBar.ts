// P2：底部「本镜描述 / 备注」栏，绑定当前镜头。相机行信息在 P3 加到 HUD。
import type { Store } from "../state/store";

export function initDescBar(store: Store): { update: () => void } {
  const name = document.getElementById("shot-name") as HTMLInputElement;
  const duration = document.getElementById("shot-duration") as HTMLInputElement;
  const desc = document.getElementById("shot-desc") as HTMLTextAreaElement;
  const notes = document.getElementById("shot-notes") as HTMLTextAreaElement;

  function commit(fn: (s: Store["shot"]) => void): void {
    store.transact(() => fn(store.shot));
  }

  name.addEventListener("change", () => commit((s) => { s.name = name.value; }));
  duration.addEventListener("change", () => {
    const v = parseFloat(duration.value);
    if (Number.isFinite(v) && v > 0) commit((s) => { s.duration = Math.round(v * 10) / 10; });
  });
  desc.addEventListener("change", () => commit((s) => { s.description = desc.value; }));
  notes.addEventListener("change", () => commit((s) => { s.notes = notes.value; }));

  function update(): void {
    const shot = store.shot;
    // 正在输入的框不覆盖
    if (document.activeElement !== name) name.value = shot.name;
    if (document.activeElement !== duration) duration.value = String(shot.duration ?? "");
    if (document.activeElement !== desc) desc.value = shot.description ?? "";
    if (document.activeElement !== notes) notes.value = shot.notes ?? "";
  }

  update();
  return { update };
}
