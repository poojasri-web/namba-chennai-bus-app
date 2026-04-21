/*Chennai Smart Bus App — Main Script */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const searchForm = $("searchForm");
  const searchInput = $("searchInput");
  const clearBtn = $("clearBtn");
  const results = $("results");
  const loader = $("loader");
  const popularChips = $("popularChips");
  const recentChips = $("recentChips");
  const recentSection = $("recentSection");
  const clearRecent = $("clearRecent");
  const themeToggle = $("themeToggle");
  const locateBtn = $("locateBtn");
  const mapHint = $("mapHint");

  const RECENT_KEY = "cs_bus_recent_v1";
  const THEME_KEY = "cs_bus_theme_v1";
  const MAX_RECENT = 6;

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  /* ---------- Leaflet Map ---------- */
  const CHENNAI_CENTER = [13.0827, 80.2707];
  const map = L.map("map", { zoomControl: true, scrollWheelZoom: false })
    .setView(CHENNAI_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  let routeLayer = null;
  let markersLayer = null;
  let userMarker = null;

  function clearMap() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (markersLayer) { map.removeLayer(markersLayer); markersLayer = null; }
  }

  function makeStopIcon(index, isEndpoint) {
    const size = isEndpoint ? 30 : 22;
    const bg = isEndpoint ? "linear-gradient(135deg,#ff5a1f,#ffb703)" : "#ffffff";
    const color = isEndpoint ? "#fff" : "#ff5a1f";
    const border = isEndpoint ? "none" : "3px solid #ff5a1f";
    return L.divIcon({
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${border};display:grid;place-items:center;color:${color};font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;box-shadow:0 6px 14px -4px rgba(255,90,31,0.6);">${index}</div>`,
    });
  }

  function drawRoute(bus) {
    clearMap();
    const coords = bus.stops.map((s) => [s.lat, s.lng]);
    markersLayer = L.layerGroup().addTo(map);

    bus.stops.forEach((s, i) => {
      const isEndpoint = i === 0 || i === bus.stops.length - 1;
      const marker = L.marker([s.lat, s.lng], { icon: makeStopIcon(i + 1, isEndpoint) })
        .bindPopup(
          `<div class="popup-title">${s.name}</div>
           <div class="popup-sub">Stop ${i + 1} · Bus ${bus.number}</div>`
        );
      markersLayer.addLayer(marker);
    });

    routeLayer = L.polyline(coords, {
      color: "#ff5a1f",
      weight: 5,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
    mapHint.textContent = `Bus ${bus.number} · ${bus.stops.length} stops`;
  }

  /* ---------- Recent searches ---------- */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch { return []; }
  }
  function addRecent(busNo) {
    const r = getRecent().filter((x) => x !== busNo);
    r.unshift(busNo);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, MAX_RECENT)));
    renderRecent();
  }
  function renderRecent() {
    const r = getRecent();
    if (!r.length) { recentSection.hidden = true; return; }
    recentSection.hidden = false;
    recentChips.innerHTML = "";
    r.forEach((n) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = n;
      b.addEventListener("click", () => { searchInput.value = n; doSearch(n); });
      recentChips.appendChild(b);
    });
  }
  clearRecent.addEventListener("click", () => {
    localStorage.removeItem(RECENT_KEY);
    renderRecent();
  });

  /* ---------- Popular ---------- */
  function renderPopular() {
    popularChips.innerHTML = "";
    POPULAR_BUSES.forEach((n) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = n;
      b.addEventListener("click", () => { searchInput.value = n; doSearch(n); });
      popularChips.appendChild(b);
    });
  }

  /* ---------- Rendering results ---------- */
  function metaPill(svg, text) {
    return `<span class="meta-pill">${svg}<span>${text}</span></span>`;
  }
  const iconClock = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`;
  const iconRupee = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 8h12M6 13c3 0 5-2 5-5M6 21l9-8"></path></svg>`;
  const iconStops = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8z"></path></svg>`;

  function renderBus(bus, nearestIdx) {
    const card = document.createElement("article");
    card.className = "result-card";

    const stopsHtml = bus.stops
      .map((s, i) => {
        const nearest = i === nearestIdx ? " nearest" : "";
        return `<li class="stop-item${nearest}" data-lat="${s.lat}" data-lng="${s.lng}" data-name="${s.name}" style="animation-delay:${i * 55}ms;">
          <span class="stop-dot"></span>
          <span class="stop-name">${s.name}</span>
          <span class="stop-idx">STOP ${String(i + 1).padStart(2, "0")}</span>
        </li>`;
      })
      .join("");

    card.innerHTML = `
      <div class="rc-top">
        <div>
          <div class="rc-bus-no">${bus.number}</div>
          <div class="rc-route"><b>${bus.route.start}</b><span class="rc-arrow">→</span><b>${bus.route.end}</b></div>
        </div>
        <div class="rc-meta">
          ${metaPill(iconClock, bus.frequency)}
          ${metaPill(iconRupee, bus.fare)}
          ${metaPill(iconStops, bus.stops.length + " stops")}
        </div>
      </div>
      <div class="rc-stops-head">Stops along the route</div>
      <ul class="stops-list">${stopsHtml}</ul>
    `;

    card.querySelectorAll(".stop-item").forEach((el) => {
      el.addEventListener("click", () => {
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        map.flyTo([lat, lng], 15, { duration: 0.8 });
        if (markersLayer) {
          markersLayer.eachLayer((m) => {
            const ll = m.getLatLng();
            if (Math.abs(ll.lat - lat) < 1e-6 && Math.abs(ll.lng - lng) < 1e-6) {
              m.openPopup();
            }
          });
        }
        document.querySelector(".map-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    results.appendChild(card);
  }

  function renderNotFound(q) {
    results.innerHTML = `
      <div class="not-found">
        <div class="emoji">🚏</div>
        <h3>Bus "${q}" not found</h3>
        <p>Try one of the popular buses below, or check the number and try again.</p>
      </div>`;
    clearMap();
    mapHint.textContent = "Search a bus to draw its route";
  }

  /* ---------- Search flow ---------- */
  function doSearch(raw) {
    const q = (raw || "").trim().toUpperCase();
    results.innerHTML = "";
    if (!q) return;

    loader.hidden = false;
    setTimeout(() => {
      loader.hidden = true;
      const bus = BUS_DATA[q];
      if (!bus) { renderNotFound(q); return; }
      renderBus(bus);
      drawRoute(bus);
      addRecent(q);
    }, 550);
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    doSearch(searchInput.value);
  });

  searchInput.addEventListener("input", () => {
    clearBtn.classList.toggle("show", !!searchInput.value);
  });
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.classList.remove("show");
    searchInput.focus();
  });

  /* ---------- Geolocation: find nearest stop ---------- */
  function haversine(a, b) {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function findNearest(lat, lng) {
    let best = null;
    Object.values(BUS_DATA).forEach((bus) => {
      bus.stops.forEach((s, idx) => {
        const d = haversine([lat, lng], [s.lat, s.lng]);
        if (!best || d < best.distance) {
          best = { bus, stop: s, stopIndex: idx, distance: d };
        }
      });
    });
    return best;
  }

  function renderNearestCard(best) {
    const card = document.createElement("div");
    card.className = "nearest-card";
    card.innerHTML = `
      <div class="pin">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="10" r="3"></circle>
          <path d="M12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8z"></path>
        </svg>
      </div>
      <div style="flex:1;">
        <h4>Nearest bus stop</h4>
        <p>${best.stop.name}</p>
        <span>${best.distance.toFixed(2)} km away · served by Bus ${best.bus.number}</span>
      </div>
    `;
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      searchInput.value = best.bus.number;
      doSearch(best.bus.number);
    });
    results.prepend(card);
  }

  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation isn't supported by your browser.");
      return;
    }
    locateBtn.disabled = true;
    locateBtn.textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        locateBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg> Use my location · find nearest stop`;
        const { latitude, longitude } = pos.coords;
        const best = findNearest(latitude, longitude);
        if (!best) return;

        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([latitude, longitude], {
          radius: 8, color: "#0ea5a4", fillColor: "#0ea5a4", fillOpacity: 0.9, weight: 3,
        }).addTo(map).bindPopup("You are here").openPopup();

        results.innerHTML = "";
        renderBus(best.bus, best.stopIndex);
        drawRoute(best.bus);
        renderNearestCard(best);
        document.querySelector(".map-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
      },
      (err) => {
        locateBtn.disabled = false;
        locateBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg> Use my location · find nearest stop`;
        alert("Could not get your location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  /* ---------- Init ---------- */
  renderPopular();
  renderRecent();

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.style.opacity = "1";
        e.target.style.transform = "translateY(0)";
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(".map-wrap, .chip-section").forEach((el) => io.observe(el));
})();