const socket = io();
const $ = (selector) => document.querySelector(selector);
const form = $("#scanForm");
const settingsForm = $("#settingsForm");
let state = { settings: { minProfitPct: 1, bankroll: 1000 }, opportunities: [] };
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#installBtn").hidden = false;
});
$("#installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#installBtn").hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function money(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(value) {
  return `${Number(value).toFixed(2)}%`;
}
function setMessage(selector, message, type = "") {
  const el = $(selector);
  el.textContent = message;
  el.className = `form-message ${type}`;
}

function render() {
  const items = state.opportunities || [];
  const qualified = items.filter((item) => item.qualifies);
  const best = items.filter((item) => item.calculation.isArbitrage)
    .reduce((max, item) => Math.max(max, item.calculation.profitPct), -Infinity);
  $("#statTotal").textContent = items.length;
  $("#statQualified").textContent = qualified.length;
  $("#statBest").textContent = Number.isFinite(best) ? pct(best) : "—";
  $("#statThreshold").textContent = pct(state.settings.minProfitPct);
  $("#minProfitPct").value = state.settings.minProfitPct;
  $("#bankroll").value = state.settings.bankroll;
  $("#emptyState").classList.toggle("hidden", items.length > 0);
  $("#opportunityList").innerHTML = items.map((item) => {
    const c = item.calculation;
    const status = item.qualifies
      ? '<span class="pill qualified">✓ THRESHOLD MET</span>'
      : c.isArbitrage
        ? '<span class="pill noarb">BELOW THRESHOLD</span>'
        : '<span class="pill noarb">NO ARBITRAGE</span>';
    const sourceLabel = item.source === "live" ? "LIVE FEED" : "SIMULATED / MANUAL";
    return `<article class="opportunity">
      <div class="opportunity-top"><div><h3 class="match-title">${esc(item.fixture)}</h3><div class="meta">Goals O/U ${Number(item.line).toFixed(1)} · ${esc(item.overBookmaker)} / ${esc(item.underBookmaker)}<br>Scanned ${new Date(item.createdAt).toLocaleString()}</div></div><div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end">${status}<span class="pill simulated">${sourceLabel}</span></div></div>
      <div class="odds-grid">
        <div class="odds-cell"><span>OVER ${Number(item.line).toFixed(1)} · ${esc(item.overBookmaker)}</span><strong>${Number(item.overOdds).toFixed(2)}</strong><small>Suggested stake: ${money(c.overStake)}</small></div>
        <div class="odds-cell"><span>UNDER ${Number(item.line).toFixed(1)} · ${esc(item.underBookmaker)}</span><strong>${Number(item.underOdds).toFixed(2)}</strong><small>Suggested stake: ${money(c.underStake)}</small></div>
      </div>
      <div class="opportunity-bottom">
        <div class="metric"><span>IMPLIED SUM</span><strong>${(c.inverseSum * 100).toFixed(2)}%</strong></div>
        <div class="metric"><span>THEORETICAL PROFIT</span><strong class="${c.isArbitrage ? "green" : ""}">${c.isArbitrage ? "+" : ""}${pct(c.profitPct)}</strong></div>
        <div class="metric"><span>EST. PROFIT ON ${money(c.totalStake)} POOL</span><strong class="${c.isArbitrage ? "green" : ""}">${c.isArbitrage ? "+" : ""}${money(c.profitAmount)}</strong></div>
      </div>
      <div class="card-foot"><span>Equalized return: ${money(c.equalizedPayout)} · ${item.source === "live" ? "Live source not verified by this MVP" : "Manually entered odds"}</span><button class="remove-btn" data-remove="${esc(item.id)}">Remove</button></div>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetch(`/api/opportunities/${encodeURIComponent(button.dataset.remove)}`, { method: "DELETE" });
    });
  });
}

socket.on("connect", () => {
  const chip = document.querySelector(".live-chip");
  if (chip) chip.innerHTML = '<span class="status-dot"></span> SOCKET CONNECTED';
});
socket.on("disconnect", () => {
  const chip = document.querySelector(".live-chip");
  if (chip) chip.textContent = "RECONNECTING…";
});
socket.on("state:update", (incoming) => {
  state = incoming;
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("#formMessage", "Checking odds…");
  const data = Object.fromEntries(new FormData(form).entries());
  data.source = "manual";
  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Scan failed.");
    const c = result.item.calculation;
    setMessage("#formMessage", c.isArbitrage
      ? `Potential arbitrage calculated: ${pct(c.profitPct)} before execution risks.`
      : `No arbitrage: implied probability sum is ${(c.inverseSum * 100).toFixed(2)}%.`, c.isArbitrage ? "success" : "");
  } catch (error) {
    setMessage("#formMessage", error.message, "error");
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("#settingsMessage", "Saving…");
  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minProfitPct: Number($("#minProfitPct").value),
        bankroll: Number($("#bankroll").value)
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save settings.");
    setMessage("#settingsMessage", "Settings saved.", "success");
  } catch (error) {
    setMessage("#settingsMessage", error.message, "error");
  }
});

$("#clearBtn").addEventListener("click", async () => {
  await fetch("/api/opportunities", { method: "DELETE" });
});
$("#demoBtn").addEventListener("click", () => {
  form.elements.fixture.value = "Example Match (SIMULATED)";
  form.elements.line.value = "2.5";
  form.elements.overBookmaker.value = "Example Bookmaker A";
  form.elements.overOdds.value = "1.76";
  form.elements.underBookmaker.value = "Example Bookmaker B";
  form.elements.underOdds.value = "3.66";
  setMessage("#formMessage", "Example values loaded. These are simulated and are not current bookmaker odds.");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
});
form.elements.line.addEventListener("change", (event) => {
  $("#overLineLabel").textContent = event.target.value;
  $("#underLineLabel").textContent = event.target.value;
});
