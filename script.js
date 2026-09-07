function updateClock() {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(now).toUpperCase();
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(now).toUpperCase();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const blinkingTime = time.replace(/:/g, '<span class="colon">:</span>');
  document.getElementById("clock").innerHTML = `<span class="clock-date">${day} ${date}</span> ${blinkingTime}`;
}

updateClock();
setInterval(updateClock, 1000);

(function pageNumberEntry() {
  const plainEl = document.getElementById("page-number-plain");
  if (!plainEl) return;
  const plainDefaultValue = plainEl.dataset.default;
  const map = window.PAGE_MAP || {};
  let buffer = "";

  function render() {
    if (plainEl) plainEl.textContent = buffer || plainDefaultValue;
  }

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (/^[0-9]$/.test(e.key)) {
      if (buffer.length < 3) buffer += e.key;
      render();
      return;
    }

    if (e.key === "Backspace") {
      buffer = buffer.slice(0, -1);
      render();
      return;
    }

    if (e.key === "Escape") {
      buffer = "";
      render();
      return;
    }

    if (e.key === "Enter" && buffer) {
      const url = map[buffer];
      if (url) {
        window.location.href = url;
      } else {
        window.location.href = "/404/?p=" + buffer;
      }
    }
  });
})();

(function notFoundNumber() {
  const target = document.getElementById("not-found-code");
  if (!target) return;
  const params = new URLSearchParams(window.location.search);
  const p = params.get("p");
  if (p) target.textContent = "PAGE " + p + " NOT FOUND";
})();
