const CSV_FILE = "FAC1 - Business Name - Overview.csv";

// CSV filenames such as "cafe.jpg" and "m1.jpg" are loaded from Images/.
const IMAGE_FOLDER = "Images/";
const DEFAULT_BG_IMAGE = "Images/BG Image.jpg";
const DEFAULT_AVATAR_IMAGE = "Images/Character Avatar 03.png";

const state = { businesses: [], selectedIndex: -1 };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== '\r') field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim())).map(r =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()]))
  );
}

async function loadBusinesses() {
  const response = await fetch(CSV_FILE, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${CSV_FILE}`);
  state.businesses = parseCSV(await response.text());
  updateStatus(`${state.businesses.length} business profiles available`);
}

function normalise(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchBusinesses(query) {
  const q = normalise(query);
  if (!q) return state.businesses.slice(0, 8);
  return state.businesses
    .map(business => {
      const name = normalise(business["Business Name"]);
      const industry = normalise(business["Business Industry"]);
      const description = normalise(business["Business Description"]);
      const keywords = normalise(business.Keywords);
      let score = 0;
      if (name === q) score += 100;
      if (name.startsWith(q)) score += 60;
      if (name.includes(q)) score += 35;
      if (industry.includes(q)) score += 15;
      if (description.includes(q)) score += 10;
      if (keywords.includes(q)) score += 8;
      q.split(" ").forEach(word => {
        if (name.includes(word)) score += 8;
        if (keywords.includes(word)) score += 3;
      });
      return { business, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.business["Business Name"].localeCompare(b.business["Business Name"]))
    .slice(0, 8)
    .map(item => item.business);
}

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderSuggestions(input, box) {
  const results = searchBusinesses(input.value);
  state.selectedIndex = -1;
  if (!input.value.trim()) { box.hidden = true; box.innerHTML = ""; return; }
  if (!results.length) {
    box.innerHTML = '<div class="suggestion-empty">No matching business found</div>';
    box.hidden = false;
    return;
  }
  box.innerHTML = results.map((business, index) => `
    <button class="suggestion-item" type="button" data-index="${index}" data-name="${escapeHTML(business["Business Name"])}">
      <span class="suggestion-icon">⌕</span>
      <span class="suggestion-copy">
        <strong>${escapeHTML(business["Business Name"])}</strong>
        <small>${escapeHTML(business["Business Industry"])} · ${escapeHTML(business["Business Description"])}</small>
      </span>
    </button>`).join("");
  box.hidden = false;
  $$(".suggestion-item").forEach(button => button.addEventListener("click", () => openProfileByName(button.dataset.name)));
}

function setupSearch(inputSelector, boxSelector, buttonSelector) {
  const input = $(inputSelector), box = $(boxSelector), button = $(buttonSelector);
  input.addEventListener("input", () => renderSuggestions(input, box));
  input.addEventListener("focus", () => { if (input.value.trim()) renderSuggestions(input, box); });
  input.addEventListener("keydown", event => {
    const items = [...box.querySelectorAll(".suggestion-item")];
    if (event.key === "ArrowDown" && items.length) { event.preventDefault(); state.selectedIndex = (state.selectedIndex + 1) % items.length; }
    else if (event.key === "ArrowUp" && items.length) { event.preventDefault(); state.selectedIndex = (state.selectedIndex - 1 + items.length) % items.length; }
    else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = items[state.selectedIndex];
      if (chosen) openProfileByName(chosen.dataset.name);
      else submitSearch(input.value);
      return;
    } else if (event.key === "Escape") { box.hidden = true; return; }
    items.forEach((item, i) => item.classList.toggle("is-selected", i === state.selectedIndex));
    items[state.selectedIndex]?.scrollIntoView({ block: "nearest" });
  });
  button.addEventListener("click", () => submitSearch(input.value));
}

function submitSearch(value) {
  const match = searchBusinesses(value)[0];
  if (match) openProfile(match);
}

function openProfileByName(name) {
  const business = state.businesses.find(item => item["Business Name"] === name);
  if (business) openProfile(business);
}

function setText(selector, value) { const el = $(selector); if (el) el.textContent = value || "—"; }

function resolveImagePath(value, fallback) {
  const image = String(value || "").trim();
  if (!image) return fallback;

  if (/^(?:https?:|data:|blob:|\/|\.{1,2}\/)/i.test(image)) return image;
  if (image.toLowerCase().startsWith(IMAGE_FOLDER.toLowerCase())) return image;

  return `${IMAGE_FOLDER}${image}`;
}

function resetProfileView() {
  $$(".story-card").forEach(card => {
    card.open = false;
    card.removeAttribute("open");
    card.classList.remove("open");
  });

  const content = $(".information-panel__content");
  if (content) content.scrollTop = 0;

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function updateProfileImages(business) {
  const background = $("#profileBackground");
  const avatar = $("#clientAvatarImage");

  const backgroundPath = resolveImagePath(
    business["BG Image"],
    DEFAULT_BG_IMAGE
  );

  const avatarPath = resolveImagePath(
    business["Avatar Image"],
    DEFAULT_AVATAR_IMAGE
  );

  if (background) {
    background.style.backgroundImage =
      `url("${backgroundPath.replace(/"/g, '\\"')}")`;

    const backgroundLoader = new Image();
    backgroundLoader.onerror = () => {
      background.style.backgroundImage = `url("${DEFAULT_BG_IMAGE}")`;
    };
    backgroundLoader.src = backgroundPath;
  }

  if (avatar) {
    avatar.onerror = () => {
      avatar.onerror = null;
      avatar.src = DEFAULT_AVATAR_IMAGE;
    };
    avatar.src = avatarPath;
    avatar.alt = `${business.Client || "Client"} character portrait`;
  }
}

function openProfile(business, updateHistory = true) {
  resetProfileView();

  $("#homePage").hidden = true;
  $("#profilePage").hidden = false;
  document.body.classList.add("profile-active");

  setText("#heroBusinessName", business["Business Name"]);
  setText("#profileBusinessName", business["Business Name"]);
  setText("#mobileBusinessName", business["Business Name"]);
  setText("#businessDescription", business["Business Description"]);
  setText("#industryValue", business["Business Industry"]);
  setText("#locationValue", business.Location);
  setText("#clientValue", business.Client);
  setText("#clientName", business.Client);
  setText("#clientInitials", initials(business.Client));
  setText("#businessOverview", business["Business Overview"]);
  setText("#howStarted", business["How It All Started"]);
  setText("#typicalDay", business["A Typical Day"]);
  setText("#needHelp", business["Why I Need Your Help"]);
  setText("#clientVision", business["Client Vision"]);
  setText("#visualQuoteText", business["Keywords"]);
  updateProfileImages(business);

  $("#profileSearchInput").value = business["Business Name"];
  $("#profileSuggestions").hidden = true;
  document.title = `${business["Business Name"]} | FAC Business Portfolio`;

  if (updateHistory) history.pushState({ business: business["Business Name"] }, "", `#business=${encodeURIComponent(business["Business Name"])}`);
}

function showHome(updateHistory = true) {
  resetProfileView();

  $("#profilePage").hidden = true;
  $("#homePage").hidden = false;
  document.body.classList.remove("profile-active");
  $("#homeSearchInput").value = "";
  $("#homeSuggestions").hidden = true;
  $("#profileSearchInput").value = "";
  $("#profileSuggestions").hidden = true;
  document.title = "Facgle Search | Business Portfolio";
  if (updateHistory) history.pushState({}, "", location.pathname);
  setTimeout(() => $("#homeSearchInput").focus(), 0);
}

function updateStatus(message, isError = false) {
  const status = $("#dataStatus");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setupGlobalEvents() {
  setupSearch("#homeSearchInput", "#homeSuggestions", "#homeSearchButton");
  setupSearch("#profileSearchInput", "#profileSuggestions", "#profileSearchButton");
  document.addEventListener("click", event => {
    $$(".search-shell").forEach(shell => {
      if (!shell.contains(event.target)) shell.querySelector(".suggestions").hidden = true;
    });
  });
  window.addEventListener("popstate", event => {
    if (event.state?.business) openProfileByName(event.state.business);
    else showHome(false);
  });
}

async function init() {
  setupGlobalEvents();
  try {
    await loadBusinesses();
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const requested = params.get("business");
    if (requested) {
      const business = state.businesses.find(item => normalise(item["Business Name"]) === normalise(requested));
      if (business) openProfile(business, false);
    }
  } catch (error) {
    console.error(error);
    updateStatus("CSV could not be loaded. Open the folder using a local web server such as VS Code Live Server.", true);
  }
}

document.addEventListener("DOMContentLoaded", init);
