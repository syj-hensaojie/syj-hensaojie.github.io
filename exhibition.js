(() => {
  "use strict";

  function startGallery() {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const nav = [...document.querySelectorAll("nav a")];
    const offlineBlock = document.querySelector("#embedded-models");
    const embedded = offlineBlock ? JSON.parse(offlineBlock.textContent) : null;
    const entries = [...document.querySelectorAll(".exhibit")].map(section => ({
      section,
      stage: section.querySelector(".stage"),
      viewer: section.querySelector("model-viewer"),
      hint: section.querySelector(".stage-hint"),
      photograph: section.querySelector(".original"),
      reset: section.querySelector(".reset"),
      download: section.querySelector("a[download]"),
      mode: "color",
      manuallyPositioned: false,
      yaw: Number(section.dataset.yaw),
      lastYaw: null
    }));

    function ensureModel(entry) {
      const key = entry.viewer.dataset.modelId;
      if (!embedded || !key || entry.viewer.hasAttribute("src")) return;
      const binary = atob(embedded[key]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], {type: "model/gltf-binary"}));
      entry.download.href = url;
      entry.viewer.setAttribute("src", url);
      delete embedded[key];
    }

    function describe(entry) {
      if (entry.failed) return "此浏览器未能显示三维模型，可查看原照或下载模型。";
      if (entry.mode === "photo") return "原始参考照片";
      if (entry.stage.dataset.ready !== "true") return "正在载入模型…";
      return matchMedia("(pointer: coarse)").matches
        ? "横向拖动旋转 · 双指缩放" : "拖动旋转 · 滚轮缩放";
    }

    function setView(entry, mode) {
      entry.mode = mode;
      entry.stage.dataset.view = mode;
      if (mode !== "photo") ensureModel(entry);
      if (mode === "clay") entry.viewer.setAttribute("variant-name", "素模");
      else entry.viewer.removeAttribute("variant-name");
      entry.viewer.inert = mode === "photo";
      entry.photograph.setAttribute("aria-hidden", String(mode !== "photo" && entry.stage.dataset.ready === "true"));
      for (const button of entry.stage.querySelectorAll("[data-mode]")) {
        button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
      }
      entry.hint.textContent = describe(entry);
    }

    function resetCamera(entry) {
      entry.manuallyPositioned = false;
      entry.lastYaw = null;
      entry.viewer.setAttribute("camera-target", "auto auto auto");
      entry.viewer.setAttribute("camera-orbit", entry.yaw + "deg 84deg 87%");
      entry.viewer.setAttribute("field-of-view", "32deg");
      if (reducedMotion.matches) entry.viewer.jumpCameraToGoal?.();
    }

    function focusDetail(entry) {
      if (entry.failed) return;
      if (entry.mode === "photo") setView(entry, "color");
      ensureModel(entry);
      entry.manuallyPositioned = true;
      entry.viewer.setAttribute("camera-target", entry.section.dataset.focus);
      entry.viewer.setAttribute("camera-orbit", (entry.yaw * .65) + "deg 84deg 63%");
      entry.viewer.setAttribute("field-of-view", "24deg");
      if (reducedMotion.matches) entry.viewer.jumpCameraToGoal?.();
    }

    function failed(entry) {
      entry.failed = true;
      setView(entry, "photo");
      entry.stage.querySelectorAll('[data-mode]:not([data-mode="photo"])').forEach(button => {button.disabled = true;});
      const detailButton = entry.section.querySelector(".detail-action");
      if (detailButton) detailButton.disabled = true;
    }

    const preferClay = new URLSearchParams(location.search).get("view") === "clay";
    const observer = embedded ? new IntersectionObserver(changes => {
      for (const change of changes) {
        if (!change.isIntersecting) continue;
        const entry = entries.find(item => item.stage === change.target);
        ensureModel(entry);
        observer.unobserve(change.target);
      }
    }, {rootMargin: "50% 0px"}) : null;

    entries.forEach(entry => {
      const ready = () => {
        entry.stage.dataset.ready = "true";
        entry.failed = false;
        setView(entry, entry.mode);
      };
      entry.viewer.addEventListener("load", ready);
      entry.viewer.addEventListener("error", () => failed(entry));
      entry.viewer.addEventListener("camera-change", event => {
        if (event.detail?.source === "user-interaction") entry.manuallyPositioned = true;
      });
      entry.viewer.addEventListener("pointerdown", () => {entry.manuallyPositioned = true;}, {passive:true});
      entry.viewer.addEventListener("wheel", () => {entry.manuallyPositioned = true;}, {passive:true});
      entry.stage.querySelectorAll("[data-mode]").forEach(button => {
        button.addEventListener("click", () => setView(entry, button.dataset.mode));
      });
      entry.reset.addEventListener("click", () => resetCamera(entry));
      entry.section.querySelector(".detail-action")?.addEventListener("click", () => focusDetail(entry));
      entry.download.addEventListener("click", () => ensureModel(entry));
      if (observer) observer.observe(entry.stage);
      if (entry.viewer.loaded) ready();
      if (preferClay) setView(entry, "clay");
    });

    let scheduled = false;
    function updatePage() {
      scheduled = false;
      let current = 0;
      document.documentElement.style.setProperty("--reading", Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
      const middle = innerHeight * .52;
      entries.forEach((entry, index) => {
        const box = entry.section.getBoundingClientRect();
        if (box.top <= middle) current = index;
        const arrive = reducedMotion.matches ? 0 : Math.max(0, Math.min(1, (box.top - innerHeight * .16) / (innerHeight * .84)));
        const depart = reducedMotion.matches ? 0 : Math.max(0, Math.min(1, (-box.top - box.height * .28) / (box.height * .72)));
        entry.section.style.setProperty("--arrive", arrive.toFixed(3));
        entry.section.style.setProperty("--depart", depart.toFixed(3));
        if (entry.manuallyPositioned || reducedMotion.matches || entry.mode === "photo" ||
            box.bottom < 0 || box.top > innerHeight) return;
        const progress = Math.max(-1, Math.min(1, (middle - box.top - box.height * .5) / box.height));
        const yaw = Math.round((entry.yaw + progress * 15) * 2) / 2;
        if (yaw !== entry.lastYaw) {
          entry.lastYaw = yaw;
          entry.viewer.setAttribute("camera-orbit", yaw + "deg 84deg 87%");
        }
      });
      nav.forEach((link, index) => {
        if (index === current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }
    function scheduleUpdate() {
      if (!scheduled) {scheduled = true; requestAnimationFrame(updatePage);}
    }
    addEventListener("scroll", scheduleUpdate, {passive:true});
    addEventListener("resize", scheduleUpdate);
    updatePage();
    setTimeout(() => {
      if (!customElements.get("model-viewer")) entries.forEach(failed);
    }, 15000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startGallery, {once:true});
  } else startGallery();
})();


