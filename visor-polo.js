const poloViews = [...document.querySelectorAll("[data-polo-view]")];
const poloZoom = document.querySelector("#poloZoom");
const viewNames = ["Frente", "Manga", "Espalda"];
let currentPoloView = 0;
let pointerStart;
let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const poloPlayback = document.querySelector("#poloPlayback");

function setPoloPaused(value) {
  paused = value;
  poloPlayback.textContent = paused ? "Reproducir" : "Pausar";
}

poloPlayback.addEventListener("click", () => setPoloPaused(!paused));
setPoloPaused(paused);
const viewFiles = ["frente-volumen", "manga", "espalda-cherry-club"];

function showPoloView(index) {
  currentPoloView = (index + viewNames.length) % viewNames.length;
  const source = new URL(
    `./assets/polo-cerezas-${viewFiles[currentPoloView]}.webp?v=9`,
    document.baseURI,
  ).href;
  for (const view of poloViews) {
    const image = view.querySelector("img");
    if (image && image.src !== source) image.src = source;
    view.setAttribute("aria-label", `Polo MODAC · ${viewNames[currentPoloView]}`);
  }
  document.querySelectorAll(".polo-carousel-dots").forEach((dots) => {
    [...dots.children].forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === currentPoloView);
    });
  });
}

document.querySelectorAll("[data-polo-step]").forEach((button) => {
  button.addEventListener("click", () => {
    showPoloView(currentPoloView + Number(button.dataset.poloStep));
    setPoloPaused(true);
  });
});

for (const view of poloViews) {
  view.addEventListener("pointerdown", (event) => {
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    view.setPointerCapture?.(event.pointerId);
  });
  view.addEventListener("pointerup", (event) => {
    if (pointerStart?.id !== event.pointerId) return;
    const horizontal = event.clientX - pointerStart.x;
    const vertical = event.clientY - pointerStart.y;
    pointerStart = undefined;
    if (
      Math.abs(horizontal) > 28 &&
      Math.abs(horizontal) > Math.abs(vertical)
    ) {
      showPoloView(currentPoloView + (horizontal < 0 ? 1 : -1));
      setPoloPaused(true);
    } else if (Math.hypot(horizontal, vertical) < 8) {
      setPoloPaused(!paused);
    }
  });
  view.addEventListener("lostpointercapture", () => {
    pointerStart = undefined;
  });
  view.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPoloPaused(!paused);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      showPoloView(currentPoloView + (event.key === "ArrowRight" ? 1 : -1));
      setPoloPaused(true);
    }
  });
}

document
  .querySelector("#openPoloZoom")
  .addEventListener("click", () => poloZoom.showModal());
document
  .querySelector("#closePoloZoom")
  .addEventListener("click", () => poloZoom.close());

window.setInterval(() => {
    if (!document.hidden && !paused)
      showPoloView(currentPoloView + 1);
}, 2500);

showPoloView(0);
