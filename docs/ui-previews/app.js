(() => {
  // Small, deterministic SVG details keep the scene editable and entirely local.
  function drawShoreline() {
    const layer = document.querySelector('[data-scene-detail="shoreline"]');
    if (!layer) return;
    const svgNamespace = "http://www.w3.org/2000/svg";
    let seed = 47;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const colors = ["#789294", "#97aaac", "#bac9cc", "#68828a"];
    for (let index = 0; index < 110; index += 1) {
      const x = 294 + random() * 150;
      const y = 200 + random() * 13;
      const radius = 1.5 + random() * 4;
      const crown = document.createElementNS(svgNamespace, "path");
      crown.setAttribute("d", `M${x - radius} ${y + radius}q${-radius / 2} ${-radius} ${radius / 2} ${-radius * 1.5}q${radius / 3} ${-radius * 1.8} ${radius} ${-radius}q${radius * 1.5} ${-radius / 2} ${radius * 1.7} ${radius * 2.5}Z`);
      crown.setAttribute("fill", colors[index % colors.length]);
      crown.setAttribute("opacity", String(.18 + random() * .35));
      layer.appendChild(crown);
    }
  }

  drawShoreline();
  const validRoutes = new Set(["home", "thinking", "persona", "unread"]);
  const screens = [...document.querySelectorAll("[data-screen]")];
  const toast = document.querySelector(".toast");
  const scrollPositions = new Map();
  let currentRoute = "home";
  let toastTimer;

  function routeFromHash() {
    const route = window.location.hash.slice(1);
    return validRoutes.has(route) ? route : "home";
  }

  function showRoute(route) {
    scrollPositions.set(currentRoute, window.scrollY);
    currentRoute = route;

    screens.forEach((screen) => {
      const isActive = screen.dataset.screen === route;
      screen.classList.toggle("is-active", isActive);
      screen.setAttribute("aria-hidden", String(!isActive));
    });

    document.title = route === "home" ? "NINA · 探索原型" : `NINA · ${document.querySelector(`[data-screen="${route}"] h1`).textContent}`;

    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPositions.get(route) ?? 0, behavior: "instant" });
      document.querySelector(`[data-screen="${route}"]`)?.focus({ preventScroll: true });
    });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function handleExpandableEvidence(button) {
    const panel = document.querySelector(`#evidence-${button.dataset.expand}`);
    if (!panel) return;

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    button.classList.toggle("is-open", willOpen);
    button.childNodes[0].nodeValue = willOpen ? "收起证据 " : "查看更多证据 ";
    showToast(willOpen ? "已展开更多阅读证据" : "已收起阅读证据");
  }

  function selectFeedback(button) {
    const group = button.closest("[data-feedback-group]");
    if (!group) return;

    group.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    showToast(`已记录：${button.dataset.value}`);
  }

  function openRealm(card) {
    document.querySelectorAll(".realm-card").forEach((item) => {
      const isTarget = item === card;
      item.classList.toggle("is-open", isTarget);
      item.querySelector(".realm-summary")?.setAttribute("aria-expanded", String(isTarget));
      const details = item.querySelector(".realm-details");
      if (details) details.hidden = !isTarget;
    });
  }

  document.addEventListener("click", (event) => {
    const toastTrigger = event.target.closest("[data-toast]");
    if (toastTrigger) showToast(toastTrigger.dataset.toast);

    const expandButton = event.target.closest("[data-expand]");
    if (expandButton) handleExpandableEvidence(expandButton);

    const feedbackButton = event.target.closest("[data-feedback-group] button[data-value]");
    if (feedbackButton) selectFeedback(feedbackButton);

    const realmSummary = event.target.closest(".realm-summary");
    if (realmSummary) openRealm(realmSummary.closest(".realm-card"));
  });

  window.addEventListener("hashchange", () => showRoute(routeFromHash()));

  if (!window.location.hash) {
    window.history.replaceState(null, "", "#home");
  }
  showRoute(routeFromHash());
})();
