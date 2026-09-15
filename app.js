const API_KEY = "jO1pS3yOqaEaPL7KBOFghwmff66C6ehe";
const iqAirKey = '57810971-c634-4d89-a7cb-4cf2ae9d2b2b';
const XWEATHER_CLIENT_ID = "GbEsRskEOmMmQQSgKnkPZ";
const XWEATHER_CLIENT_SECRET = "MntyE09HUSdwNQLpUOS3ROW6mJyIqnW76fDVjTiB";

function fetchWithTimeout(url, options = {}, timeout = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

let cities = [
  { name: "Siem Reap", country: "Cambodia", lat: 13.3671, lon: 103.8448, timezone: "Asia/Bangkok", isCurrent: true, baselineAvg: 32 },
  { name: "Phnom Penh", country: "Cambodia", lat: 11.5564, lon: 104.9282, timezone: "Asia/Bangkok", isCurrent: false, baselineAvg: 33 },
  { name: "Bangkok", country: "Thailand", lat: 13.7563, lon: 100.5018, timezone: "Asia/Bangkok", isCurrent: false, baselineAvg: 33 },
  { name: "Brisbane", country: "Australia", lat: -27.4698, lon: 153.0251, timezone: "Australia/Brisbane", isCurrent: false, baselineAvg: 26 },
  { name: "Ho Chi Minh City", country: "Vietnam", lat: 10.8231, lon: 106.6297, timezone: "Asia/Ho_Chi_Minh", isCurrent: false, baselineAvg: 32 },
  { name: "Hanoi", country: "Vietnam", lat: 21.0285, lon: 105.8542, timezone: "Asia/Bangkok", isCurrent: false, baselineAvg: 28 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198, timezone: "Asia/Singapore", isCurrent: false, baselineAvg: 31 },
  { name: "Vientiane", country: "Laos", lat: 17.9757, lon: 102.6331, timezone: "Asia/Vientiane", isCurrent: false, baselineAvg: 31 },
  { name: "Kuala Lumpur", country: "Malaysia", lat: 3.1390, lon: 101.6869, timezone: "Asia/Kuala_Lumpur", isCurrent: false, baselineAvg: 32 },
  { name: "Manila", country: "Philippines", lat: 14.5995, lon: 120.9842, timezone: "Asia/Manila", isCurrent: false, baselineAvg: 31 },
  { name: "Shenzhen", country: "China", lat: 22.5431, lon: 114.0579, timezone: "Asia/Shanghai", isCurrent: false, baselineAvg: 28 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, timezone: "Asia/Tokyo", isCurrent: false, baselineAvg: 20 },
  { name: "Seoul", country: "South Korea", lat: 37.5665, lon: 126.9780, timezone: "Asia/Seoul", isCurrent: false, baselineAvg: 18 }
];

let currentCityIndex = 0;
let hourlyChartInstance = null;
let dailyChartInstance = null;
let cachedHourly = [];
let cachedDaily = [];
let fullHourlyTimeline = [];
let currentHourlyView = 'temp';
let currentDailyView = 'temp';
let currentCloudCover = 30;
let leafletMap = null;
let allEarthquakes = [];

let transitSunriseDate = null;
let transitSunsetDate = null;
let transitNextSunriseDate = null;

let currentHumidity = 56;
let currentDewPoint = 23;
let currentTempC = 28;
let currentCapeValue = 0;
let latestPm10 = "0.0";
let latestSo2 = "0.0";

let hourlyPm10Map = {};
let hourlySo2Map = {};

let mapLocationMarker = null;
let baseRadarFrames = [];
let radarTimelineSteps = [];
let radarTileLayers = [];
let currentRadarStepIndex = 0;
let isRadarPlaying = true;
let radarPlayInterval = null;
let velocityWindLayer = null;
let hudDebounceTimeout = null;

const globalStorms = [
  { name: "Tropical Storm Norbert", basin: "Eastern Pacific", type: "Tropical Storm", winds: "85 km/h", movement: "W @ 16 km/h", lat: 19.4, lon: -145.2 },
  { name: "Post-Tropical Cyclone Lowell", basin: "Central Pacific", type: "Post-Tropical", winds: "80 km/h", movement: "W @ 18 km/h", lat: 29.0, lon: -169.9 },
  { name: "Invest 97E", basin: "Eastern Pacific", type: "Disturbance", winds: "40 km/h", movement: "N/A", lat: 16.3, lon: -114.5 }
];

function calculateStormDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function renderStormTrackerWidget(focusStorm = null) {
  const container = document.getElementById('stormListContainer');
  if (!container) return;
  container.innerHTML = '';

  const active = getActiveCity();
  const curLat = active.lat;
  const curLon = active.lon;

  let targetLat = curLat;
  let targetLon = curLon;
  let targetZoom = 5;

  if (focusStorm) {
    let lon1 = curLon;
    let lon2 = focusStorm.lon;

    if (Math.abs(lon1 - lon2) > 180) {
      if (lon1 < lon2) lon1 += 360;
      else lon2 += 360;
    }

    targetLat = (curLat + focusStorm.lat) / 2;
    targetLon = (lon2 + lon1) / 2;
    if (targetLon > 180) targetLon -= 360;
    if (targetLon < -180) targetLon += 360;

    const distanceSpan = calculateStormDistance(curLat, curLon, focusStorm.lat, focusStorm.lon);

    if (distanceSpan > 10000) targetZoom = 2;
    else if (distanceSpan > 5000) targetZoom = 3;
    else if (distanceSpan > 2000) targetZoom = 4;
    else if (distanceSpan > 800) targetZoom = 5;
    else targetZoom = 6;
  }

  globalStorms.forEach(storm => {
    const distKm = calculateStormDistance(curLat, curLon, storm.lat, storm.lon);

    let effectColor = "var(--warning)";
    let effectBg = "rgba(245, 158, 11, 0.05)";
    let effectBorder = "var(--warning)";
    let badgeClass = "";
    let effectText = `Moderate distance; minimal direct interference with ${active.name}.`;

    if (distKm < 500) {
      effectText = `High Alert: Direct proximity zone to ${active.name}!`;
      effectColor = "var(--danger)";
      effectBg = "rgba(239, 68, 68, 0.05)";
      effectBorder = "var(--danger)";
      badgeClass = "badge-danger";
    } else if (distKm > 6000) {
      effectText = `Distant system (${Math.round(distKm).toLocaleString()} km away).`;
      effectColor = "var(--safe)";
      effectBg = "rgba(16, 185, 129, 0.05)";
      effectBorder = "var(--safe)";
      badgeClass = "badge-safe";
    }

    const card = document.createElement('div');
    card.className = 'storm-card';
    card.innerHTML = `
      <div class="storm-info-top">
        <div class="storm-name-box">
          <span class="storm-name">${storm.name}</span>
          <span class="storm-basin">${storm.basin}</span>
        </div>
        <span class="strength-badge ${badgeClass}">${storm.type}</span>
      </div>
      <div class="storm-metrics">
        <div>Max Winds: <strong>${storm.winds}</strong></div>
        <div>Movement: <strong>${storm.movement}</strong></div>
        <div>Distance: <strong>~${distKm.toLocaleString()} km</strong></div>
      </div>
      <div class="local-effect-note" style="color: ${effectColor}; background: ${effectBg}; border-left-color: ${effectBorder};">
        <span>⚠️ ${effectText}</span>
        <span class="click-hint">Center Map ↗</span>
      </div>
    `;

    card.addEventListener('click', () => {
      renderStormTrackerWidget(storm);
    });

    container.appendChild(card);
  });

  const iframe = document.getElementById('stormWindyFrame');
  if (iframe) {
    iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=${targetZoom}&overlay=gustAccu&product=ecmwf&level=surface&lat=${targetLat.toFixed(3)}&lon=${targetLon.toFixed(3)}`;
  }
}

function showLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    if (show) overlay.classList.add("visible");
    else overlay.classList.remove("visible");
  }
}

function calculateSkinBurnTimeMinutes(uvIndex) {
  const uv = Math.max(0, uvIndex);
  if (uv <= 0.5) return null;
  const minutes = Math.round(100 / (uv * 0.9));
  return Math.max(5, minutes);
}

let pullStartY = 0;
let pullCurrentY = 0;
let isPulling = false;
let isRefreshing = false;
const PULL_THRESHOLD = 75;

function initPullToRefresh() {
  const indicator = document.getElementById("pullDownIndicator");
  const text = document.getElementById("pullDownText");

  window.addEventListener("touchstart", (e) => {
    if (window.scrollY <= 2 && !isRefreshing) {
      pullStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!isPulling || isRefreshing) return;
    pullCurrentY = e.touches[0].clientY;
    const diff = pullCurrentY - pullStartY;

    if (diff > 0 && window.scrollY <= 2) {
      const clamped = Math.min(diff * 0.45, 90);
      indicator.style.opacity = `${Math.min(1, clamped / 40)}`;
      indicator.style.transform = `translate(-50%, ${clamped}px)`;

      if (clamped >= PULL_THRESHOLD * 0.45) {
        indicator.classList.add("pulling-ready");
        text.innerText = "Release to Reload";
      } else {
        indicator.classList.remove("pulling-ready");
        text.innerText = "Pull to Refresh";
      }
    }
  }, { passive: true });

  window.addEventListener("touchend", () => {
    if (!isPulling || isRefreshing) return;
    isPulling = false;
    const diff = pullCurrentY - pullStartY;

    if (diff * 0.45 >= PULL_THRESHOLD * 0.45 && window.scrollY <= 5) {
      isRefreshing = true;
      indicator.classList.remove("pulling-ready");
      indicator.classList.add("refreshing");
      text.innerText = "Reloading...";
      indicator.style.transform = `translate(-50%, 75px)`;

      if (navigator.vibrate) {
        navigator.vibrate(20);
      }

      setTimeout(() => {
        window.location.reload();
      }, 350);
    } else {
      indicator.style.opacity = "0";
      indicator.style.transform = "translate(-50%, 0px)";
      indicator.classList.remove("pulling-ready");
    }
  });
}

function isNightTime() {
  const active = getActiveCity();
  const now = new Date();

  if (typeof SunCalc !== "undefined" && active.lat && active.lon) {
    const times = SunCalc.getTimes(now, active.lat, active.lon);
    if (times && times.sunrise && times.sunset) {
      return now < times.sunrise || now >= times.sunset;
    }
  }

  try {
    const localParts = new Intl.DateTimeFormat('en-US', {
      timeZone: active.timezone || "Asia/Bangkok",
      hour: 'numeric',
      hour12: false
    }).format(now);
    const hour = parseInt(localParts, 10);
    return hour < 6 || hour >= 18;
  } catch (e) {
    const h = now.getHours();
    return h < 6 || h >= 18;
  }
}

async function fetchHistoricalBaselineAvg(lat, lon, timezone = "auto") {
  const today = new Date();
  const targetMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startYear = today.getFullYear() - 15;
  const endYear = today.getFullYear() - 1;

  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_mean&timezone=${encodeURIComponent(timezone)}`;

  try {
    const res = await fetchWithTimeout(archiveUrl, {}, 2000);
    if (!res.ok) throw new Error(`Archive API status ${res.status}`);
    const data = await res.json();

    if (data.daily && data.daily.time && data.daily.temperature_2m_mean) {
      const { time, temperature_2m_mean } = data.daily;
      const matchingTemps = time.reduce((acc, date, i) => {
        if (date.endsWith(`-${targetMonthDay}`) && temperature_2m_mean[i] !== null) {
          acc.push(temperature_2m_mean[i]);
        }
        return acc;
      }, []);

      if (matchingTemps.length > 0) {
        const mean = matchingTemps.reduce((a, b) => a + b, 0) / matchingTemps.length;
        return Math.round(mean);
      }
    }
  } catch (err) {
    console.warn("Historical baseline fetch error / timeout (2s), fallback used:", err);
  }

  const absLat = Math.abs(lat);
  const currentMonth = today.getMonth() + 1;
  const isSummer = currentMonth >= 5 && currentMonth <= 9;
  if (absLat <= 15) return currentMonth >= 3 && currentMonth <= 5 ? 29 : 27;
  if (absLat <= 30) return isSummer ? 27 : 17;
  if (absLat <= 45) return currentMonth === 9 ? 20 : (isSummer ? 24 : 7);
  return isSummer ? 15 : -2;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function syncTopActiveAlerts() {
  const card = document.getElementById("topHazardAlertCard");
  const list = document.getElementById("topHazardAlertList");
  if (!card || !list) return;

  const itemsToScan = [
    { name: "Mosquito Breeding", valId: "mosquitoVal", subId: "mosquitoSub" },
    { name: "Humidex / Discomfort", valId: "humidexVal", subId: "humidexSub" },
    { name: "Pollen & Allergens", valId: "pollenVal", subId: "pollenSub" },
    { name: "Wildfires & Hotspots", valId: "fireVal", subId: "fireSub" },
    { name: "Volcanic Plume", valId: "volcanoVal", subId: "volcanoSub" },
    { name: "Tectonic Activity", valId: "quakeVal", subId: "quakeSub" },
    { name: "Tsunami Alerts", valId: "tsunamiVal", subId: "tsunamiSub" },
    { name: "Flood Stage & Basins", valId: "floodStageVal", subId: "floodStageSub" },
    { name: "Flood Risk", valId: "floodVal", subId: "floodSub" },
    { name: "Tropical Systems", valId: "stormVal", subId: "stormSub" },
    { name: "Lightning Activity", valId: "lightningVal", subId: "lightningSub" }
  ];

  function isAlertColor(colorStr) {
    if (!colorStr) return false;
    const s = colorStr.toLowerCase();
    return (
      s.includes("244, 63, 94") ||
      s.includes("239, 68, 68") ||
      s.includes("251, 146, 60") ||
      s.includes("249, 115, 22") ||
      s.includes("f43f5e") ||
      s.includes("ef4444") ||
      s.includes("fb923c") ||
      s.includes("f97316") ||
      s.includes("orange") ||
      s.includes("red")
    );
  }

  list.innerHTML = "";
  let foundCount = 0;

  itemsToScan.forEach(item => {
    const valEl = document.getElementById(item.valId);
    const subEl = document.getElementById(item.subId);
    if (!valEl) return;

    const styleColor = valEl.style.color || window.getComputedStyle(valEl).color;
    if (isAlertColor(styleColor)) {
      foundCount++;
      const alertItem = document.createElement("div");
      alertItem.className = "top-hazard-item";
      alertItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: rgba(255,255,255,0.7);">${item.name}</span>
          <span style="font-size: 0.82rem; font-weight: 700; color: ${styleColor};">${valEl.innerText}</span>
        </div>
        <div style="font-size: 0.72rem; color: rgba(255,255,255,0.85); line-height: 1.3;">${subEl ? subEl.innerText : ''}</div>
      `;
      list.appendChild(alertItem);
    }
  });

  card.style.display = foundCount > 0 ? "flex" : "none";
}

function calculateHumidex(tempC, humidityPct) {
  const e = (6.112 * Math.pow(10, (7.5 * tempC / (237.7 + tempC)))) * (humidityPct / 100);
  return Math.round(tempC + (5 / 9) * (e - 10));
}

function calculateDewPoint(tempC, humidityPct) {
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(Math.max(1, humidityPct) / 100);
  return (b * alpha) / (a - alpha);
}

function updateHumidityDisplay(humidityPct, dewPointC) {
  currentHumidity = humidityPct;
  if (dewPointC !== undefined && dewPointC !== null) {
    currentDewPoint = dewPointC;
  } else {
    currentDewPoint = calculateDewPoint(currentTempC, currentHumidity);
  }

  let humidCategory = "Comfortable";
  let humidColor = "#38bdf8";
  if (currentHumidity > 78) { humidCategory = "Very Humid"; humidColor = "#a855f7"; }
  else if (currentHumidity > 62) { humidCategory = "Humid"; humidColor = "#22d3ee"; }
  else if (currentHumidity < 35) { humidCategory = "Dry"; humidColor = "#fbbf24"; }

  const dot = document.getElementById("dot-humidity");
  const lbl = document.getElementById("label-humidity");
  const val = document.getElementById("metric-humidity");
  const bar = document.getElementById("bar-humidity");

  if (dot) dot.style.background = humidColor;
  if (lbl) lbl.innerText = `Humidity: ${humidCategory}`;
  if (val) val.innerText = `${Math.round(currentHumidity)}% · Dew ${Math.round(currentDewPoint)}°C`;
  if (bar) {
    bar.style.background = humidColor;
    bar.style.width = `${Math.max(8, currentHumidity)}%`;
  }

  processBioclimaticMetrics(Math.round(currentTempC), Math.round(currentHumidity));
}

function updateCapeDisplay(capeVal) {
  currentCapeValue = Math.round(capeVal || 0);

  let label = "Instability: Stable";
  let color = "#34d399";

  if (currentCapeValue > 2500) {
    label = "Instability: Extreme";
    color = "#f43f5e";
  } else if (currentCapeValue > 1500) {
    label = "Instability: High";
    color = "#fb923c";
  } else if (currentCapeValue > 500) {
    label = "Instability: Moderate";
    color = "#fbbf24";
  }

  const percentage = Math.min(100, Math.max(4, Math.round((currentCapeValue / 4000) * 100)));

  const dot = document.getElementById("dot-cape");
  const lbl = document.getElementById("label-cape");
  const val = document.getElementById("metric-cape");
  const bar = document.getElementById("bar-cape");

  if (dot) dot.style.background = color;
  if (lbl) lbl.innerText = label;
  if (val) val.innerText = `CAPE ${currentCapeValue.toLocaleString()} J/kg`;
  if (bar) {
    bar.style.background = color;
    bar.style.width = `${percentage}%`;
  }
}

function updatePm10Display(pm10Val) {
  const num = parseFloat(pm10Val) || 0;
  let label = "Good";
  let color = "#34d399";

  if (num > 150) {
    label = "Hazardous";
    color = "#a855f7";
  } else if (num > 100) {
    label = "Unhealthy";
    color = "#f43f5e";
  } else if (num > 50) {
    label = "Moderate";
    color = "#fbbf24";
  }

  const dot = document.getElementById("dot-pm10");
  const lbl = document.getElementById("label-pm10");
  const val = document.getElementById("metric-pm10");
  const bar = document.getElementById("bar-pm10");

  if (dot) dot.style.background = color;
  if (lbl) lbl.innerText = `PM10: ${label}`;
  if (val) val.innerText = `PM10: ${num.toFixed(1)} µg/m³`;
  if (bar) {
    bar.style.background = color;
    bar.style.width = `${Math.min(100, Math.max(8, (num / 150) * 100))}%`;
  }
}

function updateSo2Display(so2Val) {
  const num = parseFloat(so2Val) || 0;
  let label = "Low";
  let color = "#34d399";

  if (num > 80) {
    label = "Hazardous";
    color = "#a855f7";
  } else if (num > 40) {
    label = "Elevated";
    color = "#f43f5e";
  } else if (num > 20) {
    label = "Moderate";
    color = "#fbbf24";
  }

  const dot = document.getElementById("dot-so2");
  const lbl = document.getElementById("label-so2");
  const val = document.getElementById("metric-so2");
  const bar = document.getElementById("bar-so2");

  if (dot) dot.style.background = color;
  if (lbl) lbl.innerText = `Sulphur Dioxide: ${label}`;
  if (val) val.innerText = `SO₂: ${num.toFixed(1)} µg/m³`;
  if (bar) {
    bar.style.background = color;
    bar.style.width = `${Math.min(100, Math.max(8, (num / 100) * 100))}%`;
  }
}

function processBioclimaticMetrics(temp, humidity) {
  const mosquitoVal = document.getElementById("mosquitoVal");
  const mosquitoBar = document.getElementById("mosquitoBar");
  const mosquitoSub = document.getElementById("mosquitoSub");

  if (temp >= 24 && temp <= 33 && humidity >= 65) {
    mosquitoVal.textContent = "High Breeding Risk";
    mosquitoVal.style.color = "#f43f5e";
    mosquitoBar.style.width = "85%";
    mosquitoBar.style.background = "#f43f5e";
    mosquitoSub.textContent = `Optimal vector proliferation (${temp}°C, ${humidity}% RH). Standing water accelerates reproduction.`;
  } else if (temp >= 20 && humidity >= 50) {
    mosquitoVal.textContent = "Moderate Risk";
    mosquitoVal.style.color = "#facc15";
    mosquitoBar.style.width = "50%";
    mosquitoBar.style.background = "#facc15";
    mosquitoSub.textContent = `Conditions viable for vector activity (${temp}°C, ${humidity}% RH). Peak biting around dawn/dusk.`;
  } else {
    mosquitoVal.textContent = "Low / Suppressed";
    mosquitoVal.style.color = "#34d399";
    mosquitoBar.style.width = "18%";
    mosquitoBar.style.background = "#34d399";
    mosquitoSub.textContent = `Sub-optimal reproductive conditions (${temp}°C, ${humidity}% RH). Larval development constrained.`;
  }

  const humidex = calculateHumidex(temp, humidity);
  const humidexVal = document.getElementById("humidexVal");
  const humidexBar = document.getElementById("humidexBar");
  const humidexSub = document.getElementById("humidexSub");

  if (humidex >= 45) {
    humidexVal.textContent = `${humidex} · Dangerous`;
    humidexVal.style.color = "#f43f5e";
    humidexBar.style.width = "95%";
    humidexBar.style.background = "#f43f5e";
    humidexSub.textContent = "Extreme physiological heat load. Evaporative cooling failing. Heat stroke hazard during exertion.";
  } else if (humidex >= 40) {
    humidexVal.textContent = `${humidex} · Great Discomfort`;
    humidexVal.style.color = "#fb923c";
    humidexBar.style.width = "75%";
    humidexBar.style.background = "#fb923c";
    humidexSub.textContent = "Pronounced thermal fatigue and discomfort. Avoid sustained physical labor outdoors.";
  } else if (humidex >= 30) {
    humidexVal.textContent = `${humidex} · Moderate Discomfort`;
    humidexVal.style.color = "#facc15";
    humidexBar.style.width = "45%";
    humidexBar.style.background = "#facc15";
    humidexSub.textContent = "Noticeable heat index and vapor load. Stay hydrated during prolonged sunlight exposure.";
  } else {
    humidexVal.textContent = `${humidex} · Comfortable`;
    humidexVal.style.color = "#34d399";
    humidexBar.style.width = "20%";
    humidexBar.style.background = "#34d399";
    humidexSub.textContent = "Thermal equilibrium within comfortable human metabolic baseline range.";
  }

  syncTopActiveAlerts();
}

async function loadPollenAndAllergens(lat, lon) {
  const pVal = document.getElementById("pollenVal");
  const pBar = document.getElementById("pollenBar");
  const pSub = document.getElementById("pollenSub");

  try {
    const pollenUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto`;
    const res = await fetchWithTimeout(pollenUrl, {}, 2000);
    if (!res.ok) throw new Error("Pollen API failed");
    const data = await res.json();

    if (data && data.current) {
      const grass = data.current.grass_pollen || 0;
      const birch = data.current.birch_pollen || 0;
      const ragweed = data.current.ragweed_pollen || 0;
      const olive = data.current.olive_pollen || 0;
      const alder = data.current.alder_pollen || 0;

      const maxPollen = Math.max(grass, birch, ragweed, olive, alder);

      if (maxPollen >= 50) {
        pVal.textContent = "High / Severe Alert";
        pVal.style.color = "var(--accent-red)";
        pBar.style.width = "85%";
        pBar.style.background = "var(--accent-red)";
        pSub.textContent = `Elevated airborne allergens (${Math.round(maxPollen)} grains/m³). High susceptibility for allergic rhinitis and asthma.`;
      } else if (maxPollen >= 15) {
        pVal.textContent = "Moderate Exposure";
        pVal.style.color = "var(--accent-orange)";
        pBar.style.width = "50%";
        pBar.style.background = "var(--accent-orange)";
        pSub.textContent = `Moderate atmospheric pollen levels (${Math.round(maxPollen)} grains/m³). Sensitive individuals should take precautions.`;
      } else {
        pVal.textContent = "Low / Clear";
        pVal.style.color = "var(--accent-green)";
        pBar.style.width = "18%";
        pBar.style.background = "var(--accent-green)";
        pSub.textContent = "Atmospheric bio-particulate load minimal (<15 grains/m³). Favorable for outdoor respiratory comfort.";
      }
    } else {
      throw new Error("No pollen data");
    }
  } catch (err) {
    const absLat = Math.abs(lat);
    if (absLat < 20) {
      pVal.textContent = "Low (Tropical Vegetative)";
      pVal.style.color = "var(--accent-green)";
      pBar.style.width = "20%";
      pBar.style.background = "var(--accent-green)";
      pSub.textContent = "Tropical bio-aerosols suppressed by ambient humidity. Moderate spore activity possible after rainfall.";
    } else {
      pVal.textContent = "Low / Baseline";
      pVal.style.color = "var(--accent-green)";
      pBar.style.width = "15%";
      pBar.style.background = "var(--accent-green)";
      pSub.textContent = "Regional pollen counts within low seasonal thresholds.";
    }
  }

  syncTopActiveAlerts();
}

const ACTIVE_VOLCANO_CATALOG = [
  { name: "Phnom Kulen Basalts", lat: 13.6, lon: 104.1, color: "GREEN" },
  { name: "Toroeng Prong", lat: 12.8, lon: 107.2, color: "GREEN" },
  { name: "Krakatau", lat: -6.102, lon: 105.423, color: "ORANGE" },
  { name: "Merapi", lat: -7.54, lon: 110.446, color: "ORANGE" },
  { name: "Taal", lat: 14.002, lon: 120.993, color: "YELLOW" },
  { name: "Sakurajima", lat: 31.585, lon: 130.657, color: "ORANGE" },
  { name: "Mount Fuji", lat: 35.3606, lon: 138.7274, color: "GREEN" },
  { name: "Mount Etna", lat: 37.751, lon: 14.993, color: "YELLOW" },
  { name: "Popocatépetl", lat: 19.023, lon: -98.622, color: "YELLOW" }
];

function checkVolcanoHazards(lat, lon) {
  let nearest = null;
  let minDis = Infinity;

  ACTIVE_VOLCANO_CATALOG.forEach(v => {
    const d = calculateDistanceKm(lat, lon, v.lat, v.lon);
    if (d < minDis) { minDis = d; nearest = { ...v, distance: d }; }
  });

  const valEl = document.getElementById("volcanoVal");
  const barEl = document.getElementById("volcanoBar");
  const subEl = document.getElementById("volcanoSub");

  if (nearest) {
    if (nearest.distance < 150 && (nearest.color === "RED" || nearest.color === "ORANGE")) {
      valEl.textContent = `Warning: ${nearest.name} (${nearest.distance} km)`;
      valEl.style.color = "var(--accent-red)";
      barEl.style.width = "90%";
      barEl.style.background = "var(--accent-red)";
      subEl.textContent = `Active eruptive venting reported. VONA: ${nearest.color}. Airborne ash risk within 150 km.`;
    } else if (nearest.distance < 400 && nearest.color !== "GREEN") {
      valEl.textContent = `Watch: ${nearest.name} (${nearest.distance} km)`;
      valEl.style.color = "var(--accent-orange)";
      barEl.style.width = "50%";
      barEl.style.background = "var(--accent-orange)";
      subEl.textContent = `Magmatic unrest documented (VONA: ${nearest.color}). No immediate heavy fallout.`;
    } else {
      valEl.textContent = `Quiet (${nearest.name}, ${nearest.distance.toLocaleString()} km)`;
      valEl.style.color = "var(--accent-green)";
      barEl.style.width = "15%";
      barEl.style.background = "var(--accent-green)";
      subEl.textContent = `Nearest active vent is quiescent (VONA: ${nearest.color}). No ash plume hazard.`;
    }
  }

  syncTopActiveAlerts();
}

async function checkSeismicAndTsunami(lat, lon) {
  const quakeVal = document.getElementById("quakeVal");
  const quakeBar = document.getElementById("quakeBar");
  const quakeSub = document.getElementById("quakeSub");

  const tsunamiVal = document.getElementById("tsunamiVal");
  const tsunamiBar = document.getElementById("tsunamiBar");
  const tsunamiSub = document.getElementById("tsunamiSub");

  try {
    const res = await fetchWithTimeout("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson", {}, 2000);
    const data = await res.json();

    if (data && data.features && data.features.length > 0) {
      let nearest = null;
      let minDistance = Infinity;

      data.features.forEach(f => {
        const qLon = f.geometry.coordinates[0];
        const qLat = f.geometry.coordinates[1];
        const dist = calculateDistanceKm(lat, lon, qLat, qLon);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = { ...f, distance: dist };
        }
      });

      if (nearest) {
        const props = nearest.properties;
        const mag = props.mag ? props.mag.toFixed(1) : "N/A";
        const depthKm = nearest.geometry.coordinates[2] || 10;
        const tsunamiFlag = props.tsunami === 1;

        if (nearest.distance < 400 && props.mag >= 6.0) {
          quakeVal.textContent = `Severe M${mag} (${nearest.distance} km)`;
          quakeVal.style.color = "var(--accent-red)";
          quakeBar.style.width = "90%";
          quakeBar.style.background = "var(--accent-red)";
          quakeSub.textContent = `Significant rupture: ${props.place}. Depth: ${depthKm} km.`;
        } else if (nearest.distance < 800 && props.mag >= 5.2) {
          quakeVal.textContent = `Moderate M${mag} (${nearest.distance} km)`;
          quakeVal.style.color = "var(--accent-orange)";
          quakeBar.style.width = "55%";
          quakeBar.style.background = "var(--accent-orange)";
          quakeSub.textContent = `Regional tremor registered: ${props.place}. Depth: ${depthKm} km.`;
        } else {
          quakeVal.textContent = `M${mag} – ${props.place.split(',').pop().trim()} (${nearest.distance.toLocaleString()} km)`;
          quakeVal.style.color = "var(--accent-green)";
          quakeBar.style.width = "18%";
          quakeBar.style.background = "var(--accent-green)";
          quakeSub.textContent = `Nearest event: ${props.place}. Stable cratonic baseline.`;
        }

        const isOffshore = depthKm < 65 && nearest.distance < 1200;
        if (tsunamiFlag || (props.mag >= 7.0 && isOffshore)) {
          tsunamiVal.textContent = "ACTIVE TSUNAMI WARNING";
          tsunamiVal.style.color = "var(--accent-red)";
          tsunamiBar.style.width = "95%";
          tsunamiBar.style.background = "var(--accent-red)";
          tsunamiSub.textContent = `Tsunami wave generation possible from M${mag} rupture (${nearest.distance} km away).`;
        } else if (props.mag >= 6.2 && isOffshore) {
          tsunamiVal.textContent = "Informational Tsunami Advisory";
          tsunamiVal.style.color = "var(--accent-yellow)";
          tsunamiBar.style.width = "45%";
          tsunamiBar.style.background = "var(--accent-yellow)";
          tsunamiSub.textContent = `Marine displacement evaluated. Strong rip currents possible along exposed coastlines.`;
        } else {
          tsunamiVal.textContent = "No Threat / Inactive";
          tsunamiVal.style.color = "var(--accent-green)";
          tsunamiBar.style.width = "10%";
          tsunamiBar.style.background = "var(--accent-green)";
          tsunamiSub.textContent = "No marine tsunamigenic triggers detected.";
        }
      }
    }
  } catch (e) {
    quakeVal.textContent = "USGS Stream Standby";
    tsunamiVal.textContent = "No Threat Detected";
  }

  syncTopActiveAlerts();
}

async function checkFireHazards(lat, lon, temp, humidity, windSpeed, rainMm) {
  const fireVal = document.getElementById("fireVal");
  const fireBar = document.getElementById("fireBar");
  const fireSub = document.getElementById("fireSub");

  let pm25 = 10;
  let carbonMonoxide = 200;

  try {
    const airRes = await fetchWithTimeout(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,carbon_monoxide&timezone=auto`, {}, 2000);
    if (airRes.ok) {
      const airData = await airRes.json();
      if (airData && airData.current) {
        pm25 = airData.current.pm2_5 || 10;
        carbonMonoxide = airData.current.carbon_monoxide || 200;
      }
    }
  } catch (e) {
    console.warn("Fire aerosol telemetry fallback / timeout:", e);
  }

  const dryFactor = Math.max(0, (100 - humidity) / 10);
  const windFactor = Math.max(1, windSpeed / 10);
  const tempFactor = Math.max(0, (temp - 20) / 5);
  const fireWeatherIndex = Math.round((dryFactor * 1.5 + tempFactor * 2.0) * windFactor);

  const smokeElevated = pm25 > 50 && carbonMonoxide > 450;
  const smokeSevere = pm25 > 90 || (pm25 > 60 && carbonMonoxide > 700);

  if (smokeSevere || (fireWeatherIndex >= 35 && rainMm < 0.2)) {
    fireVal.textContent = smokeSevere ? "Active Fire Plume / Smoke Alert" : "Extreme Wildfire Threat";
    fireVal.style.color = "var(--accent-red)";
    fireBar.style.width = "92%";
    fireBar.style.background = "var(--accent-red)";
    fireSub.textContent = smokeSevere 
      ? `Thermal plume detected in local buffer (PM2.5: ${Math.round(pm25)} µg/m³, CO: ${Math.round(carbonMonoxide)} µg/m³). Avoid outdoor exposure.`
      : `Dangerous fire weather index (${fireWeatherIndex}). Critical fuel dryness (${humidity}% RH) with ${Math.round(windSpeed)} km/h winds.`;
  } else if (smokeElevated || (fireWeatherIndex >= 20 && rainMm < 1.0)) {
    fireVal.textContent = smokeElevated ? "Agricultural Burning / Haze" : "Elevated Fire Danger";
    fireVal.style.color = "var(--accent-orange)";
    fireBar.style.width = "60%";
    fireBar.style.background = "var(--accent-orange)";
    fireSub.textContent = smokeElevated 
      ? `Biomass burning or localized scrub fires detected nearby (PM2.5: ${Math.round(pm25)} µg/m³). Plume dispersion active.`
      : `Moderate fire weather index (${fireWeatherIndex}). Dry vegetation fuels present. Outdoor burning restrictions advised.`;
  } else {
    fireVal.textContent = "Low / Controlled";
    fireVal.style.color = "var(--accent-green)";
    fireBar.style.width = "15%";
    fireBar.style.background = "var(--accent-green)";
    if (fireSub) fireSub.textContent = `No active wildfire hotspots in immediate 50 km zone. Ambient relative humidity (${humidity}%) prevents spontaneous flare-ups.`;
  }

  updateAsmcHazeWidget(lat, lon, pm25, humidity, rainMm);
  syncTopActiveAlerts();
}

function updateAsmcHazeWidget(lat, lon, currentPm25, humidity, rainMm) {
  const card = document.getElementById("asmcWidgetCard");
  if (!card) return;

  const now = new Date();
  const month = now.getMonth() + 1;

  const isMekongRegion = lat >= 8 && lat <= 26 && lon >= 92 && lon <= 110;
  const isDryBurningSeason = (month >= 1 && month <= 5);

  if (!isMekongRegion) {
    card.style.display = "none";
    return;
  }

  card.style.display = "flex";

  const badge = document.getElementById("asmcLevelBadge");
  const phase = document.getElementById("asmcSeasonPhase");
  const title = document.getElementById("asmcAlertTitle");
  const desc = document.getElementById("asmcAlertDesc");
  const regime = document.getElementById("asmcRegimeVal");
  const groundPm = document.getElementById("asmcGroundPmVal");
  const cap = document.getElementById("asmcCapVal");
  const hotspot = document.getElementById("asmcHotspotVal");

  if (isDryBurningSeason && (currentPm25 >= 75 || humidity < 50)) {
    card.classList.remove("standdown");
    if (badge) {
      badge.style.background = "#ea580c";
      badge.style.color = "#000";
      badge.innerText = "Level 2: Escalating Risk";
    }
    if (phase) phase.innerText = "Dry Season Burning Peak";
    if (title) title.innerText = "Active Transboundary Smoke Alert";
    if (desc) desc.innerText = "Dominant Subtropical Ridge causes strong sinking air and calm surface winds. Agricultural burns in the Shan Hills and northern border valleys are capped under nocturnal inversions.";
    if (regime) regime.innerText = "Subtropical High / 850hPa Jet";
    if (groundPm) groundPm.innerText = `${Math.round(currentPm25)} µg/m³ (Elevated)`;
    if (cap) cap.innerText = "Trapped (< 500m Inversion Cap)";
    if (hotspot) hotspot.innerText = "High to Extreme (Active Fires)";
  } else if (isDryBurningSeason) {
    card.classList.remove("standdown");
    if (badge) {
      badge.style.background = "#facc15";
      badge.style.color = "#000";
      badge.innerText = "Level 1: Seasonal Advisory";
    }
    if (phase) phase.innerText = "Dry Transition Phase";
    if (title) title.innerText = "Mekong Basin Fire Risk Advisory";
    if (desc) desc.innerText = "Dry air settling over Mekong basin. Sporadic biomass clearing detected with moderate nocturnal smoke retention.";
    if (regime) regime.innerText = "Northeast Monsoon Flow";
    if (groundPm) groundPm.innerText = `${Math.round(currentPm25)} µg/m³ (Moderate)`;
    if (cap) cap.innerText = "Moderate (600m - 900m Cap)";
    if (hotspot) hotspot.innerText = "Moderate Clearing Clusters";
  } else {
    card.classList.add("standdown");
    if (badge) {
      badge.style.background = "#10b981";
      badge.style.color = "#000";
      badge.innerText = "Level 0: Stand Down";
    }
    if (phase) phase.innerText = "Southwest Monsoon / Wet Season";
    if (title) title.innerText = "Mekong Basin Clean Air Baseline";
    if (desc) desc.innerText = "Southwest Monsoon active. Regional rainfall, atmospheric scrubbing, and buoyant convective mixing keep transboundary haze suppressed.";
    if (regime) regime.innerText = "Southwest Monsoon Flow";
    if (groundPm) groundPm.innerText = `${Math.round(currentPm25)} µg/m³ (Clean)`;
    if (cap) cap.innerText = "Uncapped / Convective Mixing";
    if (hotspot) hotspot.innerText = "Suppressed by Rainfall";
  }
}

async function loadAtmosphericHazards(lat, lon) {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&models=ecmwf_ifs025&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,surface_pressure&hourly=cape&daily=precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=2`;

  try {
    const res = await fetchWithTimeout(weatherUrl, {}, 2000);
    if (!res.ok) throw new Error("Open-Meteo hazards failed");
    const data = await res.json();

    if (data && data.current) {
      const temp = data.current.temperature_2m || 28;
      const humidity = currentHumidity || data.current.relative_humidity_2m || 65;
      const weatherCode = data.current.weather_code || 0;
      const rainMm = data.current.precipitation || 0;
      const dailyRain = data.daily && data.daily.precipitation_sum ? data.daily.precipitation_sum[0] : 0;
      const windSpd = data.current.wind_speed_10m || 10;
      const windGust = data.current.wind_gusts_10m || (windSpd * 1.35);
      const pressure = data.current.surface_pressure || 1010;

      await checkFireHazards(lat, lon, temp, humidity, windSpd, rainMm);

      const stageVal = document.getElementById("floodStageVal");
      const stageBar = document.getElementById("floodStageBar");
      const stageSub = document.getElementById("floodStageSub");

      if (dailyRain >= 70 || rainMm >= 10.0) {
        stageVal.textContent = "Major Flood Stage (Warning)";
        stageVal.style.color = "var(--accent-red)";
        stageBar.style.width = "92%";
        stageBar.style.background = "var(--accent-red)";
        stageSub.textContent = `River basin near or exceeding bankfull capacity (~${dailyRain.toFixed(1)} mm antecedent total). Low-lying floodplains inundated.`;
      } else if (dailyRain >= 30 || rainMm >= 4.0) {
        stageVal.textContent = "Action / Moderate Stage (Advisory)";
        stageVal.style.color = "var(--accent-orange)";
        stageBar.style.width = "60%";
        stageBar.style.background = "var(--accent-orange)";
        stageSub.textContent = `Tributaries cresting into active runoff stage (~${dailyRain.toFixed(1)} mm basin inflow). Channel velocity high.`;
      } else if (dailyRain >= 10 || rainMm >= 1.0) {
        stageVal.textContent = "Rising Flow / Controlled";
        stageVal.style.color = "var(--accent-yellow)";
        stageBar.style.width = "35%";
        stageBar.style.background = "var(--accent-yellow)";
        stageSub.textContent = `Moderate volume increase in catchment basins. Within structural levee and canal capacities.`;
      } else {
        stageVal.textContent = "Normal Baseline Flow";
        stageVal.style.color = "var(--accent-green)";
        stageBar.style.width = "15%";
        stageBar.style.background = "var(--accent-green)";
        stageSub.textContent = "Catchment and water basin discharge stable. Hydrological gauges well below flood crest levels.";
      }

      const floodVal = document.getElementById("floodVal");
      const floodBar = document.getElementById("floodBar");
      const floodSub = document.getElementById("floodSub");

      if (rainMm >= 8.0 || dailyRain >= 60) {
        floodVal.textContent = "High / Inundation Alert";
        floodVal.style.color = "var(--accent-red)";
        floodBar.style.width = "90%";
        floodBar.style.background = "var(--accent-red)";
        floodSub.textContent = `Severe ground saturation (~${rainMm.toFixed(1)} mm/h). High stream discharge and floodplain overflow expected in low basins.`;
      } else if (rainMm >= 2.0 || dailyRain >= 20) {
        floodVal.textContent = "Moderate Watch";
        floodVal.style.color = "var(--accent-orange)";
        floodBar.style.width = "50%";
        floodBar.style.background = "var(--accent-orange)";
        stageSub.textContent = `Elevated tributary runoff (~${dailyRain.toFixed(1)} mm today). Urban ponding and localized drainage backflow likely.`;
      } else {
        floodVal.textContent = "Minimal / Normal";
        floodVal.style.color = "var(--accent-green)";
        floodBar.style.width = "15%";
        floodBar.style.background = "var(--accent-green)";
        floodSub.textContent = "Runoff within normal channel capacities. No widespread flash flood or riverbank breaching detected.";
      }

      const stormVal = document.getElementById("stormVal");
      const stormBar = document.getElementById("stormBar");
      const stormSub = document.getElementById("stormSub");

      if (windGust >= 75 || (windSpd >= 50 && pressure < 1000)) {
        stormVal.textContent = "Severe Tropical Storm / Typhoon";
        stormVal.style.color = "var(--accent-red)";
        stormBar.style.width = "95%";
        stormBar.style.background = "var(--accent-red)";
        stormSub.textContent = `Deep pressure depression (${pressure} hPa) with severe gale gusts (peak ${windGust} km/h). Structural hazard alert.`;
      } else if (windGust >= 45 || pressure < 1004) {
        stormVal.textContent = "Depression / Squall Watch";
        stormVal.style.color = "var(--accent-orange)";
        stormBar.style.width = "55%";
        stormBar.style.background = "var(--accent-orange)";
        stormSub.textContent = `Active convective wind shear detected (gusts up to ${windGust} km/h). Squall fronts passing overhead.`;
      } else {
        stormVal.textContent = "Quiescent / No Threat";
        stormVal.style.color = "var(--accent-green)";
        stormBar.style.width = "18%";
        stormBar.style.background = "var(--accent-green)";
        stormSub.textContent = `Normal gradient flow (${windSpd} km/h, ${pressure} hPa). No cyclonic vortex or organized tropical depression nearby.`;
      }

      const curHour = new Date().getHours();
      const cape = data.hourly && data.hourly.cape ? Math.round(data.hourly.cape[curHour] || 0) : 0;
      updateCapeDisplay(cape);

      const isThunder = [95, 96, 99].includes(weatherCode);

      let strikes = 0;
      if (isThunder) {
        strikes = Math.max(14, Math.round(cape / 80));
      } else if (cape > 1400) {
        strikes = Math.round(cape / 280);
      }

      const lightningVal = document.getElementById("lightningVal");
      const lightningBar = document.getElementById("lightningBar");
      const lightningSub = document.getElementById("lightningSub");

      lightningVal.textContent = `${strikes} / hr`;

      if (strikes >= 10 || isThunder) {
        lightningVal.style.color = "var(--accent-red)";
        lightningBar.style.width = "90%";
        lightningBar.style.background = "var(--accent-red)";
        lightningSub.textContent = `Severe convective storm active. CAPE index high (${cape} J/kg). Cloud-to-ground strikes likely.`;
      } else if (strikes > 0 || cape > 900) {
        lightningVal.style.color = "var(--accent-orange)";
        lightningBar.style.width = "45%";
        lightningBar.style.background = "var(--accent-orange)";
        lightningSub.textContent = `Atmospheric instability present (CAPE: ${cape} J/kg). Convective squall cells possible.`;
      } else {
        lightningVal.style.color = "var(--accent-green)";
        lightningBar.style.width = "8%";
        lightningBar.style.background = "var(--accent-green)";
        lightningSub.textContent = `Stable boundary layer (CAPE: ${cape} J/kg). Lightning threat suppressed.`;
      }
    }
  } catch (err) {
    console.warn("Atmospheric hazards error / timeout (2s):", err);
  }

  syncTopActiveAlerts();
}

const PHASE_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"
];

const textureCanvas = document.createElement('canvas');
textureCanvas.width = 150;
textureCanvas.height = 150;

(function initTexture() {
  const ctx = textureCanvas.getContext('2d');
  const r = 75;

  const bg = ctx.createRadialGradient(r - 18, r - 18, 8, r, r, r);
  bg.addColorStop(0, '#f1f5f9');
  bg.addColorStop(0.7, '#cbd5e1');
  bg.addColorStop(1, '#94a3b8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 150, 150);

  const maria = [
    { x: 57, y: 57, r: 21 }, { x: 78, y: 48, r: 16 }, { x: 93, y: 64, r: 13 },
    { x: 53, y: 93, r: 25 }, { x: 97, y: 88, r: 18 }, { x: 72, y: 102, r: 19 },
    { x: 40, y: 69, r: 12 }
  ];
  ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
  maria.forEach(m => {
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.filter = 'blur(5px)';
    ctx.fill();
  });
  ctx.filter = 'none';
})();

function drawObserverMoon(fraction, phase, brightLimbAngle) {
  const canvas = document.getElementById('moon-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const r = w / 2;

  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(brightLimbAngle);
  ctx.translate(-r, -r);

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(textureCanvas, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = 'rgba(11, 15, 25, 0.96)';

  const isCrescent = fraction < 0.5;
  const b = Math.abs(r * (1 - 2 * fraction));

  ctx.beginPath();
  ctx.arc(r, r, r, Math.PI / 2, (3 * Math.PI) / 2, false);

  if (isCrescent) {
    ctx.ellipse(r, r, b, r, 0, (3 * Math.PI) / 2, Math.PI / 2, false);
  } else {
    ctx.ellipse(r, r, b, r, 0, (3 * Math.PI) / 2, Math.PI / 2, true);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  const rim = ctx.createRadialGradient(r, r, r * 0.82, r, r, r);
  rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  rim.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = rim;
  ctx.fill();

  ctx.restore();
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  return {
    year: parseInt(map.year),
    month: parseInt(map.month) - 1,
    day: parseInt(map.day),
    hour: parseInt(map.hour === '24' ? '0' : map.hour),
    minute: parseInt(map.minute),
    second: parseInt(map.second)
  };
}

function getZonedMidnight(now, timeZone) {
  const parts = getZonedParts(now, timeZone);
  let estimate = new Date(Date.UTC(parts.year, parts.month, parts.day, 0, 0, 0));
  const check = getZonedParts(estimate, timeZone);
  const diffMs = ((check.hour * 60 + check.minute) * 60 + check.second) * 1000;
  return new Date(estimate.getTime() - diffMs);
}

function findNextPhaseDate(now, targetPhase) {
  let t = now.getTime();
  const step = 6 * 3600 * 1000;
  const end = t + 35 * 86400 * 1000;

  function getDiff(time) {
    let p = SunCalc.getMoonIllumination(new Date(time)).phase;
    let d = p - targetPhase;
    if (d < -0.5) d += 1.0;
    if (d > 0.5) d -= 1.0;
    return d;
  }

  let d1 = getDiff(t);
  t += step;

  while (t < end) {
    let d2 = getDiff(t);
    if (d1 < 0 && d2 >= 0) {
      let left = t - step;
      let right = t;
      for (let i = 0; i < 20; i++) {
        let mid = (left + right) / 2;
        if (getDiff(mid) < 0) left = mid;
        else right = mid;
      }
      return new Date(right);
    }
    d1 = d2;
    t += step;
  }
  return null;
}

function getTargetDayRiseSet(now, lat, lon, timeZone) {
  const startOfDay = getZonedMidnight(now, timeZone);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000 - 1);

  let rise = null;
  let set = null;

  for (let offset = -1; offset <= 1; offset++) {
    const sampleDate = new Date(startOfDay.getTime() + offset * 86400000 + 43200000);
    const times = SunCalc.getMoonTimes(sampleDate, lat, lon, true);

    if (times.rise && times.rise >= startOfDay && times.rise <= endOfDay) {
      rise = times.rise;
    }
    if (times.set && times.set >= startOfDay && times.set <= endOfDay) {
      set = times.set;
    }
  }

  const statusTimes = SunCalc.getMoonTimes(now, lat, lon, true);
  return {
    rise,
    set,
    alwaysUp: statusTimes.alwaysUp,
    alwaysDown: statusTimes.alwaysDown
  };
}

function calculateLunarInfo(lat, lon, timeZone) {
  const now = new Date();
  const ill = SunCalc.getMoonIllumination(now);
  const pos = SunCalc.getMoonPosition(now, lat, lon);

  const brightLimbAngle = (ill.angle - pos.parallacticAngle) - Math.PI / 2;
  const fraction = ill.fraction;
  const phaseIdx = Math.floor((ill.phase + 0.0625) * 8) % 8;

  const riseSet = getTargetDayRiseSet(now, lat, lon, timeZone);
  const nextFullDate = findNextPhaseDate(now, 0.5);
  const nextNewDate = findNextPhaseDate(now, 0.0);

  const msPerDay = 86400000;
  const daysToFull = nextFullDate ? Math.max(0, Math.ceil((nextFullDate - now) / msPerDay)) : 0;
  const daysToNew = nextNewDate ? Math.max(0, Math.ceil((nextNewDate - now) / msPerDay)) : 0;
  const altitudeDeg = Math.round(pos.altitude * (180 / Math.PI));

  return {
    timeZone,
    phaseName: PHASE_NAMES[phaseIdx],
    fraction: fraction,
    phase: ill.phase,
    brightLimbAngle: brightLimbAngle,
    altitudeDeg: altitudeDeg,
    moonrise: riseSet.rise,
    moonset: riseSet.set,
    alwaysUp: riseSet.alwaysUp,
    alwaysDown: riseSet.alwaysDown,
    nextFull: nextFullDate,
    daysToFull: daysToFull,
    nextNew: nextNewDate,
    daysToNew: daysToNew
  };
}

function formatTimeMoon(d, timeZone) {
  if (!d) return "--:--";
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });
}

function formatDateMoon(d, timeZone) {
  if (!d) return "--";
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone });
}

function updateMoonWidget() {
  const active = getActiveCity();
  const tz = active.timezone || "Asia/Bangkok";
  const data = calculateLunarInfo(active.lat, active.lon, tz);

  drawObserverMoon(data.fraction, data.phase, data.brightLimbAngle);

  document.getElementById('phase-name').textContent = data.phaseName;
  document.getElementById('illumination-val').textContent = `${Math.round(data.fraction * 100)}% Illuminated`;

  const skyEl = document.getElementById('sky-status');
  if (data.altitudeDeg > 0) {
    skyEl.textContent = `▲ In Sky (${data.altitudeDeg}°)`;
    skyEl.style.color = '#38bdf8';
  } else {
    skyEl.textContent = `▼ Below Horizon`;
    skyEl.style.color = '#94a3b8';
  }

  if (data.alwaysUp) {
    document.getElementById('moonrise-time').textContent = "All Day";
    document.getElementById('moonrise-sub').textContent = "Above horizon";
  } else if (data.alwaysDown) {
    document.getElementById('moonrise-time').textContent = "None";
    document.getElementById('moonrise-sub').textContent = "Below horizon";
  } else {
    document.getElementById('moonrise-time').textContent = formatTimeMoon(data.moonrise, data.timeZone);
    document.getElementById('moonrise-sub').textContent = data.moonrise ? "Local time" : "No rise today";
  }

  if (data.alwaysUp || data.alwaysDown) {
    document.getElementById('moonset-time').textContent = "--";
    document.getElementById('moonset-sub').textContent = "--";
  } else {
    document.getElementById('moonset-time').textContent = formatTimeMoon(data.moonset, data.timeZone);
    document.getElementById('moonset-sub').textContent = data.moonset ? "Local time" : "No set today";
  }

  document.getElementById('next-full-date').textContent = formatDateMoon(data.nextFull, data.timeZone);
  document.getElementById('full-days-away').textContent = `in ${data.daysToFull} day${data.daysToFull === 1 ? '' : 's'}`;

  document.getElementById('next-new-date').textContent = formatDateMoon(data.nextNew, data.timeZone);
  document.getElementById('new-days-away').textContent = `in ${data.daysToNew} day${data.daysToNew === 1 ? '' : 's'}`;
}

function updateWindyWidget(lat, lon) {
  const iframe = document.getElementById("windyTempIframe");
  const externalLink = document.getElementById("windyExternalLink");

  const roundedLat = Number(lat).toFixed(3);
  const roundedLon = Number(lon).toFixed(3);

  if (iframe) {
    const newSrc = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km%2Fh&zoom=4&overlay=efiTemp&product=efi&level=surface&lat=${roundedLat}&lon=${roundedLon}&pressure=true&message=true`;
    if (iframe.src !== newSrc) {
      iframe.src = newSrc;
    }
  }

  if (externalLink) {
    externalLink.href = `https://www.windy.com/?${roundedLat},${roundedLon},4`;
  }
}

const stored = localStorage.getItem("ios_weather_cities");
if (stored) {
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) cities = parsed;
  } catch (e) {
    console.warn("Error parsing saved cities", e);
  }
}

function saveCitiesState() {
  localStorage.setItem("ios_weather_cities", JSON.stringify(cities));
}

function getActiveCity() {
  return cities[currentCityIndex] || cities[0];
}

function getAqiColor(aqi) {
  if (aqi <= 50) return '#A8E05F'; 
  if (aqi <= 100) return '#FDD64B'; 
  if (aqi <= 150) return '#FF9B57'; 
  if (aqi <= 200) return '#FE6A69'; 
  if (aqi <= 300) return '#A97ABC'; 
  return '#A87383';                 
}

function calculatePM25FromAQI(aqi) {
  if (aqi <= 50) return (aqi * (12.0 / 50)).toFixed(1);
  if (aqi <= 100) return (12.1 + ((aqi - 51) * (35.4 - 12.1) / 49)).toFixed(1);
  if (aqi <= 150) return (35.5 + ((aqi - 101) * (55.4 - 35.5) / 49)).toFixed(1);
  if (aqi <= 200) return (55.5 + ((aqi - 151) * (150.4 - 55.5) / 49)).toFixed(1);
  if (aqi <= 300) return (150.5 + ((aqi - 201) * (250.4 - 150.5) / 99)).toFixed(1);
  return (250.5 + ((aqi - 301) * (350.4 - 250.5) / 99)).toFixed(1);
}

async function updateIQAirWidget(lat, lon) {
  try {
    const response = await fetchWithTimeout(`https://api.airvisual.com/v2/nearest_city?lat=${lat}&lon=${lon}&key=${iqAirKey}`, {}, 2000);
    const result = await response.json();

    if (result.status === 'success') {
      const data = result.data;
      const pollution = data.current.pollution;
      const weather = data.current.weather;
      const aqi = pollution.aqius;

      let pm25Text = '';
      if (pollution.p2 && pollution.p2.conc !== undefined) {
        pm25Text = `${pollution.p2.conc} µg/m³`;
      } else if (pollution.mainus === 'p2') {
        pm25Text = `~${calculatePM25FromAQI(aqi)} µg/m³`;
      } else {
        pm25Text = '--';
      }

      let statusText = "Good";
      if (aqi > 50) statusText = "Moderate";
      if (aqi > 100) statusText = "Unhealthy (SG)";
      if (aqi > 150) statusText = "Unhealthy";
      if (aqi > 200) statusText = "Very Unhealthy";
      if (aqi > 300) statusText = "Hazardous";

      const color = getAqiColor(aqi);
      const dot = document.getElementById('dot-aqi');
      const lbl = document.getElementById('label-aqi');
      const val = document.getElementById('metric-aqi');
      const bar = document.getElementById('bar-aqi');

      if (dot) dot.style.background = color;
      if (lbl) lbl.innerText = `Air Quality: ${statusText}`;
      if (val) val.innerText = `AQI ${aqi} · PM2.5: ${pm25Text}`;
      if (bar) {
        bar.style.width = `${Math.min(100, Math.max(8, (aqi / 300) * 100))}%`;
        bar.style.background = color;
      }

      if (weather && weather.hu !== undefined) {
        updateHumidityDisplay(weather.hu);
      }
    }
  } catch (error) {
    console.warn('IQAir fetch error or timeout (2s), skipping:', error);
  }
}

function renderClimate3DIcon(weatherCode, rainMm) {
  const box = document.getElementById("climate-3d-icon-box");
  if (!box) return;
  const isThunder = weatherCode === 8000 || [95, 96, 99].includes(weatherCode);
  const isRain = rainMm > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 4000, 4001, 4200, 4201].includes(weatherCode);
  const isCloudy = [1, 2, 3, 45, 48, 1001, 1100, 1101, 1102].includes(weatherCode);
  const isNight = isNightTime();

  if (isThunder) {
    box.innerHTML = `
      <div class="cloud-3d cloud-storm"></div>
      <div class="lightning-3d"></div>
      <div class="rain-drop r1"></div>
      <div class="rain-drop r3"></div>
    `;
  } else if (isRain) {
    box.innerHTML = `
      <div class="cloud-3d"></div>
      <div class="rain-drop r1"></div>
      <div class="rain-drop r2"></div>
      <div class="rain-drop r3"></div>
    `;
  } else if (isNight) {
    if (isCloudy) {
      box.innerHTML = `
        <div class="moon-3d" style="top: 2px; right: 6px; width: 20px; height: 20px;"></div>
        <div class="cloud-3d"></div>
      `;
    } else {
      box.innerHTML = `
        <div class="moon-stars-bg">
          <span class="moon-star s1"></span>
          <span class="moon-star s2"></span>
          <span class="moon-star s3"></span>
        </div>
        <div class="moon-3d" style="top: 8px; right: 14px; width: 26px; height: 26px;"></div>
      `;
    }
  } else {
    if (isCloudy) {
      box.innerHTML = `
        <div class="sun-3d"></div>
        <div class="cloud-3d"></div>
      `;
    } else {
      box.innerHTML = `
        <div class="sun-3d" style="top: 8px; right: 14px; width: 26px; height: 26px;"></div>
      `;
    }
  }
}

function formatZoomDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())},${pad(d.getHours())}:${pad(d.getMinutes())},+7`;
}

function updateZoomEarthLink(unixSeconds) {
  const active = getActiveCity();
  const dateParam = unixSeconds ? `/date=${formatZoomDate(unixSeconds)}` : '';
  const extLink = document.getElementById("zoomEarthExternalLink");
  if (extLink) {
    extLink.href = `https://zoom.earth/maps/satellite/#view=${active.lat.toFixed(4)},${active.lon.toFixed(4)},6z${dateParam}/overlays=radar,wind,temperatures`;
  }
}

function showRadarStep(index) {
  const step = radarTimelineSteps[index];
  if (!step) return;

  radarTileLayers.forEach(layer => layer.setOpacity(0));

  if (radarTileLayers[step.layerIndex]) {
    radarTileLayers[step.layerIndex].setOpacity(step.opacity);
  }
  if (step.blendIndex !== undefined && radarTileLayers[step.blendIndex]) {
    radarTileLayers[step.blendIndex].setOpacity(step.opacity * 0.85);
  }

  const d = new Date(step.time * 1000);
  const timeLabel = document.getElementById("radarTimeLabel");
  const slider = document.getElementById("radarTimeSlider");
  if (timeLabel) timeLabel.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (slider) slider.value = index;

  updateZoomEarthLink(step.time);
}

function toggleRadarPlay() {
  isRadarPlaying = !isRadarPlaying;
  const playBtn = document.getElementById("radarPlayBtn");
  if (playBtn) playBtn.textContent = isRadarPlaying ? "❚❚" : "▶";
  if (isRadarPlaying) startRadarLoop();
  else clearInterval(radarPlayInterval);
}

function startRadarLoop() {
  clearInterval(radarPlayInterval);
  radarPlayInterval = setInterval(() => {
    if (radarTimelineSteps.length === 0) return;
    currentRadarStepIndex = (currentRadarStepIndex + 1) % radarTimelineSteps.length;
    showRadarStep(currentRadarStepIndex);
  }, 450);
}

function onRadarSliderMove(val) {
  currentRadarStepIndex = parseInt(val, 10);
  showRadarStep(currentRadarStepIndex);
  if (isRadarPlaying) {
    clearInterval(radarPlayInterval);
    startRadarLoop();
  }
}

function initOrUpdateSatelliteMap(lat, lon) {
  updateZoomEarthLink(radarTimelineSteps[currentRadarStepIndex] ? radarTimelineSteps[currentRadarStepIndex].time : null);

  if (!leafletMap) {
    leafletMap = L.map('satelliteMap', {
      zoomControl: true,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 9
    }).setView([lat, lon], 6);

    leafletMap.createPane('labelsPane');
    leafletMap.getPane('labelsPane').classList.add('leaflet-labels-pane');

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 9,
      detectRetina: true,
      zIndex: 1
    }).addTo(leafletMap);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 9,
      pane: 'labelsPane'
    }).addTo(leafletMap);

    const locationIcon = L.divIcon({
      className: 'loc-pulse-marker',
      html: '<div class="loc-pulse-ring"></div><div class="loc-pulse-dot"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    mapLocationMarker = L.marker([lat, lon], { icon: locationIcon, zIndexOffset: 1000 }).addTo(leafletMap);

    fetchWithTimeout('https://raw.githubusercontent.com/danwild/leaflet-velocity/master/demo/wind-gfs.json', {}, 3000)
      .then(res => res.json())
      .then(windData => {
        velocityWindLayer = L.velocityLayer({
          displayValues: true,
          displayOptions: {
            velocityType: 'Global Wind',
            position: 'bottomleft',
            emptyString: 'No wind data',
            angleConvention: 'bearingCW',
            showCardinal: true,
            speedUnit: 'k/h'
          },
          data: windData,
          maxVelocity: 15,
          velocityScale: 0.005,
          particleAge: 90,
          particleMultiplier: 1 / 300,
          lineWidth: 1.5,
          frameRate: 15,
          colorScale: [
            "rgba(255, 255, 255, 0.2)",
            "rgba(56, 189, 248, 0.5)",
            "rgba(34, 211, 238, 0.7)",
            "rgba(52, 211, 153, 0.9)",
            "rgba(251, 191, 36, 1)",
            "rgba(244, 63, 94, 1)"
          ]
        }).addTo(leafletMap);
      })
      .catch(err => console.warn("Wind streamlines load skipped or failed:", err));

    fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json', {}, 2500)
      .then(res => res.json())
      .then(data => {
        if (!data || !data.radar) return;
        baseRadarFrames = [...(data.radar.past || []), ...(data.radar.nowcast || [])];
        if (baseRadarFrames.length === 0) return;

        radarTileLayers = baseRadarFrames.map(frame => {
          return L.tileLayer(`https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
            opacity: 0,
            zIndex: 10
          }).addTo(leafletMap);
        });

        radarTimelineSteps = [];
        for (let i = 0; i < baseRadarFrames.length; i++) {
          const currentFrame = baseRadarFrames[i];
          const nextFrame = baseRadarFrames[i + 1];

          radarTimelineSteps.push({
            time: currentFrame.time,
            layerIndex: i,
            opacity: 0.68
          });

          if (nextFrame) {
            const gapSeconds = nextFrame.time - currentFrame.time;
            if (gapSeconds >= 480) {
              radarTimelineSteps.push({
                time: currentFrame.time + Math.round(gapSeconds / 2),
                layerIndex: i,
                blendIndex: i + 1,
                opacity: 0.45
              });
            }
          }
        }

        const slider = document.getElementById("radarTimeSlider");
        if (slider) {
          slider.max = radarTimelineSteps.length - 1;
          slider.value = radarTimelineSteps.length - 1;
        }
        currentRadarStepIndex = radarTimelineSteps.length - 1;

        showRadarStep(currentRadarStepIndex);
        startRadarLoop();
      })
      .catch(err => console.warn("RainViewer timeline radar fetch failed:", err));

    const hudBox = document.getElementById('cursorInfoBox');
    const hudTemp = document.getElementById('hudTemp');
    const hudWind = document.getElementById('hudWind');
    const hudPrecip = document.getElementById('hudPrecip');
    const hudCoords = document.getElementById('hudCoords');
    const mapWrapper = document.getElementById('mapWrapper');

    leafletMap.on('mousemove', (e) => {
      if (!hudBox || !mapWrapper) return;
      hudBox.style.display = 'flex';

      const rect = mapWrapper.getBoundingClientRect();
      const x = e.containerPoint.x;
      const y = e.containerPoint.y;

      const offsetX = x + 150 > rect.width ? x - 135 : x + 14;
      const offsetY = y + 90 > rect.height ? y - 80 : y + 14;

      hudBox.style.left = `${offsetX}px`;
      hudBox.style.top = `${offsetY}px`;

      const hoverLat = e.latlng.lat;
      const hoverLon = e.latlng.lng;
      if (hudCoords) hudCoords.textContent = `${hoverLat.toFixed(2)}°, ${hoverLon.toFixed(2)}°`;

      clearTimeout(hudDebounceTimeout);
      hudDebounceTimeout = setTimeout(() => {
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${hoverLat.toFixed(2)}&longitude=${hoverLon.toFixed(2)}&current=temperature_2m,wind_speed_10m,precipitation&timezone=auto`)
          .then(res => res.json())
          .then(data => {
            if (data && data.current) {
              if (hudTemp) hudTemp.textContent = `${Math.round(data.current.temperature_2m)}°C`;
              if (hudWind) hudWind.textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;
              if (hudPrecip) hudPrecip.textContent = `${(data.current.precipitation || 0).toFixed(1)} mm/h`;
            }
          })
          .catch(() => {
            if (hudTemp) hudTemp.textContent = '--';
            if (hudWind) hudWind.textContent = '--';
            if (hudPrecip) hudPrecip.textContent = '--';
          });
      }, 350);
    });

    leafletMap.on('mouseout', () => {
      if (hudBox) hudBox.style.display = 'none';
      clearTimeout(hudDebounceTimeout);
    });

  } else {
    leafletMap.setView([lat, lon], 6);
    if (mapLocationMarker) {
      mapLocationMarker.setLatLng([lat, lon]);
    }
  }
}

function renderPagination() {
  const container = document.getElementById("dockPagination");
  if (!container) return;
  container.innerHTML = "";

  cities.forEach((city, index) => {
    const item = document.createElement("div");
    item.className = `dock-bullet-item ${index === currentCityIndex ? 'active' : ''}`;
    item.title = `${city.name}`;
    item.id = `dock-item-${index}`;
    item.onclick = () => goToCity(index);

    if (index === 0 && city.isCurrent) {
      item.innerHTML = `
        <svg class="dock-location-arrow" viewBox="0 0 24 24">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
        </svg>
      `;
    } else {
      item.innerHTML = `<div class="dock-dot"></div>`;
    }
    container.appendChild(item);
  });

  const activeEl = document.getElementById(`dock-item-${currentCityIndex}`);
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

function goToCity(newIndex, direction = null) {
  if (newIndex < 0 || newIndex >= cities.length || newIndex === currentCityIndex) return;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  const shell = document.getElementById("weatherShell");
  const dir = direction || (newIndex > currentCityIndex ? "left" : "right");

  shell.classList.add(dir === "left" ? "sliding-out-left" : "sliding-out-right");

  setTimeout(() => {
    currentCityIndex = newIndex;
    renderPagination();
    updateCityView();
    
    shell.classList.remove("sliding-out-left", "sliding-out-right");
    shell.classList.add(dir === "left" ? "sliding-in-left" : "sliding-in-right");

    setTimeout(() => {
      shell.classList.remove("sliding-in-left", "sliding-in-right");
    }, 220);
  }, 200);
}

function getTimeDiffString(targetTimezone) {
  try {
    const now = new Date();
    const targetFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTimezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
    });
    const tParts = targetFmt.formatToParts(now).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    const targetUtc = Date.UTC(tParts.year, tParts.month - 1, tParts.day, tParts.hour, tParts.minute, tParts.second);
    const localUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());

    const diffHours = Math.round((targetUtc - localUtc) / (1000 * 60 * 60));
    if (diffHours === 0) return "";
    return `${diffHours > 0 ? '+' : ''}${diffHours}`;
  } catch (e) {
    return "";
  }
}

function updateClock() {
  const active = getActiveCity();
  const tz = active.timezone || "Asia/Bangkok";
  const now = new Date();

  try {
    const timeStr = now.toLocaleTimeString("en-GB", {
      hour12: false, hour: "2-digit", minute: "2-digit", timeZone: tz
    });
    const dateStr = now.toLocaleDateString("en-US", {
      weekday: "long", month: "short", day: "numeric", timeZone: tz
    });
    const offsetStr = getTimeDiffString(tz);
    
    document.getElementById("live-clock-time").innerText = timeStr;
    document.getElementById("live-clock-diff").innerText = offsetStr ? `(${offsetStr})` : "";
    document.getElementById("live-date").innerText = dateStr;
  } catch (e) {
    document.getElementById("live-clock-time").innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("live-date").innerText = now.toLocaleDateString();
  }

  updateTransitEphemerisDisplay();
  updateMoonWidget();
}
setInterval(updateClock, 1000);

function computeSolarTimes(targetDate) {
  const active = getActiveCity();
  const d = targetDate || new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 0);
  const diff = d - startOfYear;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180)) * (Math.PI / 180);
  const latRad = active.lat * (Math.PI / 180);
  const cosH = (Math.sin(-0.83 * Math.PI / 180) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) * (180 / Math.PI);

  const B = (360 / 365) * (dayOfYear - 81) * (Math.PI / 180);
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  const solarNoonMinutes = 720 - (4 * (active.lon - 105)) - EoT;
  const sunriseMinutes = solarNoonMinutes - (H * 4);
  const sunsetMinutes = solarNoonMinutes + (H * 4);

  const sunrise = new Date(d);
  sunrise.setHours(Math.floor(sunriseMinutes / 60), Math.floor(sunriseMinutes % 60), 0, 0);

  const sunset = new Date(d);
  sunset.setHours(Math.floor(sunsetMinutes / 60), Math.floor(sunsetMinutes % 60), 0, 0);

  return { sunrise, sunset };
}

function estimateSolarOutput600W(dateObj, cloudPct) {
  const { sunrise, sunset } = computeSolarTimes(dateObj);
  if (dateObj < sunrise || dateObj >= sunset) {
    return { watts: 0, ghi: 0, effPct: 0 };
  }

  const totalDaylight = sunset - sunrise;
  const progress = (dateObj - sunrise) / totalDaylight;
  const sinSolarAltitude = Math.sin(progress * Math.PI);

  const clearSkyGHI = Math.max(0, sinSolarAltitude * 1020);
  const cloudFactor = 1 - (Math.pow(cloudPct / 100, 1.85) * 0.76);
  const actualGHI = Math.max(0, clearSkyGHI * cloudFactor);

  const panelRatedWatts = 600;
  const deratingFactor = 0.84;
  const actualWatts = Math.min(panelRatedWatts, (panelRatedWatts * (actualGHI / 1000) * deratingFactor));
  const effPct = Math.round((actualWatts / panelRatedWatts) * 100);

  return {
    watts: Math.max(0, actualWatts),
    ghi: Math.round(actualGHI),
    effPct: effPct
  };
}

function getQuadraticBezierPoint(t, p0, p1, p2) {
  const oneMinusT = 1 - t;
  const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
  const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;
  return { x, y };
}

function formatTimeTZ(dateObj, tz) {
  return dateObj.toLocaleTimeString("en-US", {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz
  });
}

async function fetchSolarEphemeris(lat, lon) {
  try {
    const sunUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=UTC&forecast_days=3`;
    const res = await fetchWithTimeout(sunUrl, {}, 2000);
    const data = await res.json();

    if (data.daily && data.daily.sunrise && data.daily.sunset) {
      transitSunriseDate = new Date(data.daily.sunrise[0] + ":00Z");
      transitSunsetDate = new Date(data.daily.sunset[0] + ":00Z");
      transitNextSunriseDate = new Date(data.daily.sunrise[1] + ":00Z");

      const now = new Date();
      if (now > transitSunsetDate && data.daily.sunrise[2]) {
        if (now > transitNextSunriseDate) {
          transitSunriseDate = new Date(data.daily.sunrise[1] + ":00Z");
          transitSunsetDate = new Date(data.daily.sunset[1] + ":00Z");
          transitNextSunriseDate = new Date(data.daily.sunrise[2] + ":00Z");
        }
      }
    }
  } catch (err) {
    console.warn("Error fetching solar ephemeris / timeout (2s):", err);
    const fb = computeSolarTimes(new Date());
    transitSunriseDate = fb.sunrise;
    transitSunsetDate = fb.sunset;
    transitNextSunriseDate = new Date(fb.sunrise.getTime() + 24 * 60 * 60 * 1000);
  }
  updateTransitEphemerisDisplay();
}

function updateTransitEphemerisDisplay() {
  const now = new Date();

  const solarCurrent = estimateSolarOutput600W(now, currentCloudCover);
  document.getElementById("solar-current-w").innerText = `${Math.round(solarCurrent.watts)} W`;
  document.getElementById("solar-badge").innerText = `${solarCurrent.effPct}% of 600W`;
  document.getElementById("solar-bar").style.width = `${Math.min(100, solarCurrent.effPct)}%`;

  const estDailyWh = Math.round(2700 * (1 - (currentCloudCover / 100) * 0.52));
  document.getElementById("solar-est-daily").innerText = `Est. Today: ~${estDailyWh} Wh · GHI: ${solarCurrent.ghi} W/m²`;

  if (!transitSunriseDate || !transitSunsetDate) return;
  const active = getActiveCity();
  const currentTz = active.timezone || "Asia/Bangkok";

  const isDay = now >= transitSunriseDate && now < transitSunsetDate;
  const orb = document.getElementById("celestialOrb");
  const p0 = { x: 25, y: 125 };
  const p1 = { x: 160, y: 15 };
  const p2 = { x: 295, y: 125 };

  let t = 0;

  if (isDay) {
    const totalDaylight = transitSunsetDate.getTime() - transitSunriseDate.getTime();
    const elapsed = now.getTime() - transitSunriseDate.getTime();
    t = Math.max(0, Math.min(1, elapsed / totalDaylight));

    orb.setAttribute("fill", "#fbbf24");
    document.getElementById("sunTransitHeaderTitle").innerText = "SOLAR TRANSIT";
    document.getElementById("startTag").innerText = "Sunrise";
    document.getElementById("startTimeVal").innerText = formatTimeTZ(transitSunriseDate, currentTz);
    document.getElementById("endTag").innerText = "Sunset";
    document.getElementById("endTimeVal").innerText = formatTimeTZ(transitSunsetDate, currentTz);
    document.getElementById("statusDesc").innerText = `Daylight active · Sun at ${Math.round(t * 100)}% of arc`;
  } else {
    let totalNight, elapsed;
    if (now >= transitSunsetDate) {
      totalNight = (transitNextSunriseDate ? transitNextSunriseDate.getTime() : transitSunsetDate.getTime() + 12 * 3600000) - transitSunsetDate.getTime();
      elapsed = now.getTime() - transitSunsetDate.getTime();
    } else {
      const prevSunset = new Date(transitSunsetDate.getTime() - 24 * 60 * 60 * 1000);
      totalNight = transitSunriseDate.getTime() - prevSunset.getTime();
      elapsed = now.getTime() - prevSunset.getTime();
    }

    t = Math.max(0, Math.min(1, elapsed / (totalNight || 1)));

    orb.setAttribute("fill", "#93c5fd");
    document.getElementById("sunTransitHeaderTitle").innerText = "LUNAR TRANSIT";
    document.getElementById("startTag").innerText = "Sunset";
    document.getElementById("startTimeVal").innerText = formatTimeTZ(transitSunsetDate, currentTz);
    document.getElementById("endTag").innerText = "Sunrise";
    document.getElementById("endTimeVal").innerText = formatTimeTZ(transitNextSunriseDate || transitSunriseDate, currentTz);
    document.getElementById("statusDesc").innerText = `Nighttime · Moon at ${Math.round(t * 100)}% of transit`;
  }

  const point = getQuadraticBezierPoint(t, p0, p1, p2);
  orb.setAttribute("cx", point.x);
  orb.setAttribute("cy", point.y);
}

function renderPressureDial(pressureHpa, prevPressureHpa = 1008) {
  const g = document.getElementById("pressureTicksGroup");
  g.innerHTML = "";

  const cx = 67.5;
  const cy = 60;
  const radius = 46;
  const totalTicks = 26;
  const startAngle = 145 * (Math.PI / 180);
  const endAngle = 395 * (Math.PI / 180);
  const angleStep = (endAngle - startAngle) / (totalTicks - 1);

  const minP = 970;
  const maxP = 1040;
  const clampedP = Math.max(minP, Math.min(maxP, pressureHpa));
  const ratio = (clampedP - minP) / (maxP - minP);
  const activeTickIdx = Math.round(ratio * (totalTicks - 1));

  for (let i = 0; i < totalTicks; i++) {
    const theta = startAngle + i * angleStep;
    const isCurrent = i === activeTickIdx;
    const tickLength = isCurrent ? 12 : 7;
    const x1 = cx + (radius - tickLength) * Math.cos(theta);
    const y1 = cy + (radius - tickLength) * Math.sin(theta);
    const x2 = cx + radius * Math.cos(theta);
    const y2 = cy + radius * Math.sin(theta);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", isCurrent ? "#ffffff" : "rgba(255, 255, 255, 0.28)");
    line.setAttribute("stroke-width", isCurrent ? "3" : "1.8");
    line.setAttribute("stroke-linecap", "round");
    if (isCurrent) line.setAttribute("filter", "drop-shadow(0 0 4px #ffffff)");
    g.appendChild(line);
  }

  document.getElementById("pressureMainVal").innerText = Number(pressureHpa).toLocaleString("en-US");
  document.getElementById("pressureTrendArrow").innerText = pressureHpa <= prevPressureHpa ? "↓" : "↑";
}

function updateClimateWidget(curTemp, feelsTemp, conditionText, highTemp, lowTemp, avgBaseline, aqi, pm25, uv, humidity, rainProb, dewPoint, windSpeedKmh, weatherCode, rainMm, dailyPrecipMm = 0, cape = 0, pm10 = 0, so2 = 0) {
  const roundCur = Math.round(curTemp);
  const roundFeels = Math.round(feelsTemp);
  const roundHigh = Math.round(highTemp);
  const roundLow = Math.round(lowTemp);
  const diff = roundHigh - avgBaseline;

  currentTempC = curTemp;

  document.getElementById("unified-cur-temp").innerText = `${roundCur}°`;
  document.getElementById("unified-feels").innerText = `${roundFeels}°`;
  document.getElementById("unified-condition").innerText = conditionText;
  document.getElementById("unified-day-high").innerText = `H: ${roundHigh}°`;
  document.getElementById("unified-day-low").innerText = `L: ${roundLow}°`;

  const tempGap = roundFeels - roundCur;
  if (tempGap >= 3) {
    document.getElementById("unified-humidity-impact").innerText = `Feels ${tempGap}° warmer due to tropical humidity.`;
  } else if (tempGap <= -2) {
    document.getElementById("unified-humidity-impact").innerText = `Wind makes it feel ${Math.abs(tempGap)}° cooler.`;
  } else {
    document.getElementById("unified-humidity-impact").innerText = "Similar to the actual temperature.";
  }

  const badge = document.getElementById("unified-avg-badge");
  badge.innerText = `${diff >= 0 ? '+' : ''}${diff}°`;
  badge.style.background = diff > 0 ? "rgba(251, 146, 60, 0.25)" : (diff < 0 ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.15)");
  badge.style.color = diff > 0 ? "#fb923c" : (diff < 0 ? "#38bdf8" : "#ffffff");
  
  document.getElementById("historicalContextTitle").innerText = "Historical Mean For Today";
  document.getElementById("unified-avg-baseline").innerHTML = `avg ${avgBaseline}°`;

  const roundWind = Math.round(windSpeedKmh);
  const windPct = Math.min(100, Math.max(8, Math.round((roundWind / 50) * 100)));
  document.getElementById("metric-wind").innerText = `${roundWind} km/h`;
  document.getElementById("bar-wind").style.width = `${windPct}%`;

  let uvCategory = "Low";
  let uvColor = "#34d399";
  if (uv > 10) { uvCategory = "Extreme"; uvColor = "#c084fc"; }
  else if (uv > 7) { uvCategory = "Very High"; uvColor = "#f87171"; }
  else if (uv > 5) { uvCategory = "High"; uvColor = "#fb923c"; }
  else if (uv > 2) { uvCategory = "Moderate"; uvColor = "#fbbf24"; }

  const uvPct = Math.min(100, Math.round((uv / 11) * 100));
  document.getElementById("dot-uv").style.background = uvColor;
  document.getElementById("label-uv").innerText = `UV Index: ${uvCategory}`;
  
  const burnMinutes = calculateSkinBurnTimeMinutes(uv);
  const burnText = burnMinutes !== null ? `Skin burn ${burnMinutes} min` : "Low burn risk";
  document.getElementById("metric-uv").innerText = `UV ${uv} · ${burnText}`;
  
  document.getElementById("bar-uv").style.background = uvColor;
  document.getElementById("bar-uv").style.width = `${Math.max(8, uvPct)}%`;

  updateHumidityDisplay(humidity, dewPoint);
  updateCapeDisplay(cape);
  updatePm10Display(pm10 || latestPm10);
  updateSo2Display(so2 || latestSo2);

  let probCategory = "Minimal";
  let probColor = "#38bdf8";
  if (rainProb > 70) { probCategory = "Very Likely"; probColor = "#6366f1"; }
  else if (rainProb > 40) { probCategory = "Showers Likely"; probColor = "#38bdf8"; }
  else if (rainProb > 15) { probCategory = "Isolated"; probColor = "#22d3ee"; }

  document.getElementById("dot-prob").style.background = probColor;
  document.getElementById("label-prob").innerText = `Rain Risk: ${probCategory}`;
  document.getElementById("metric-prob").innerText = `${Math.round(rainProb)}% chance next 60m`;
  document.getElementById("bar-prob").style.background = probColor;
  document.getElementById("bar-prob").style.width = `${Math.max(rainProb > 0 ? 8 : 2, rainProb)}%`;

  const precipVal = parseFloat(dailyPrecipMm) || 0;
  const precipPct = Math.min(100, Math.max(precipVal > 0 ? 8 : 2, Math.round((precipVal / 30) * 100)));
  const precipColor = precipVal >= 25 ? "#f43f5e" : (precipVal >= 10 ? "#38bdf8" : "#0284c7");
  
  const dotPrecip = document.getElementById("dot-precip");
  const lblPrecip = document.getElementById("label-precip");
  const metPrecip = document.getElementById("metric-precip");
  const barPrecip = document.getElementById("bar-precip");

  if (dotPrecip) dotPrecip.style.background = precipColor;
  if (lblPrecip) lblPrecip.innerText = `Precipitation Today`;
  if (metPrecip) metPrecip.innerText = `${precipVal.toFixed(1)} mm total`;
  if (barPrecip) {
    barPrecip.style.background = precipColor;
    barPrecip.style.width = `${precipPct}%`;
  }

  renderClimate3DIcon(weatherCode, rainMm);
}

const weatherCodeMap = {
  0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing Fog", 51: "Light Drizzle", 53: "Drizzle",
  55: "Dense Drizzle", 61: "Slight Rain", 63: "Moderate Rain", 65: "Heavy Rain",
  80: "Rain Showers", 81: "Heavy Showers", 82: "Violent Showers",
  95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
  1000: "Clear", 1100: "Mostly Clear", 1101: "Partly Cloudy", 1102: "Mostly Cloudy",
  1001: "Cloudy", 2000: "Fog", 2100: "Light Fog", 4000: "Drizzle",
  4001: "Rain", 4200: "Light Rain", 4201: "Heavy Rain", 8000: "Thunderstorm"
};

function parseWeatherCode(code) {
  return weatherCodeMap[code] || "Cloudy";
}

function getDegreesToCardinal(deg) {
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  return cardinals[Math.round((deg % 360) / 45)];
}

let latestAqi = 30;
let latestPm25 = "3.0";
let hourlyPm25Map = {};

async function loadAirQuality() {
  const active = getActiveCity();
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${active.lat}&longitude=${active.lon}&current=us_aqi,pm2_5,pm10,sulphur_dioxide&hourly=pm2_5,pm10,sulphur_dioxide,us_aqi&forecast_days=7&timezone=auto`;
  try {
    const res = await fetchWithTimeout(url, {}, 2000);
    const data = await res.json();
    latestAqi = Math.round(data.current.us_aqi || 30);
    latestPm25 = (data.current.pm2_5 || 3.0).toFixed(1);
    latestPm10 = (data.current.pm10 || 0).toFixed(1);
    latestSo2 = (data.current.sulphur_dioxide || 0).toFixed(1);

    if (data.hourly && data.hourly.time) {
      data.hourly.time.forEach((t, i) => {
        hourlyPm25Map[t] = data.hourly.pm2_5[i] || 3.0;
        hourlyPm10Map[t] = data.hourly.pm10 ? (data.hourly.pm10[i] || 0) : 0;
        hourlySo2Map[t] = data.hourly.sulphur_dioxide ? (data.hourly.sulphur_dioxide[i] || 0) : 0;
      });
    }

    updatePm10Display(latestPm10);
    updateSo2Display(latestSo2);
  } catch (err) {
    console.warn("AQI / PM10 / SO2 data unreachable or timed out (2s):", err);
  }
}

function checkRainAlert(weatherCode, curRain, nextRain, nextProb) {
  const banner = document.getElementById("rainAlertBanner");
  const msg = document.getElementById("rainAlertMessage");
  const isThunder = weatherCode === 8000 || [95, 96, 99].includes(weatherCode);

  if (isThunder) {
    banner.style.display = "flex";
    msg.innerText = "Active Thunderstorm Warning: Expect lightning and tropical squalls.";
  } else if (curRain >= 2.5 || nextRain >= 2.5) {
    banner.style.display = "flex";
    msg.innerText = `Heavy Rain Alert: Intense precipitation rate (~${Math.max(curRain, nextRain).toFixed(1)} mm/h).`;
  } else if (nextProb >= 75 && nextRain > 1.0) {
    banner.style.display = "flex";
    msg.innerText = `Shower Warning: High chance (${nextProb}%) of rain in the next hour.`;
  } else {
    banner.style.display = "none";
  }
}

let activeXweatherController = null;

function parseXweatherError(errData) {
  if (!errData) return "Unknown error";
  if (typeof errData === 'string') return errData;
  if (typeof errData.detail === 'string') return errData.detail;
  if (Array.isArray(errData.detail)) {
    return errData.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
  }
  if (errData.error && typeof errData.error.description === 'string') {
    return errData.error.description;
  }
  return JSON.stringify(errData);
}

async function streamXweatherIntoElement(url, targetElement, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    throw new Error(errJson ? parseXweatherError(errJson) : `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let hasText = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      if (!hasText) {
        targetElement.innerText = '';
        hasText = true;
      }
      targetElement.innerText += chunk;
    }
  }

  return hasText;
}

async function loadXweatherSummaries(cityName, countryName, lat, lon) {
  if (activeXweatherController) {
    activeXweatherController.abort();
  }
  activeXweatherController = new AbortController();
  const signal = activeXweatherController.signal;

  const alertsEl = document.getElementById("alertsSummary");
  const conditionsEl = document.getElementById("conditionsSummary");

  if (alertsEl) alertsEl.innerText = "Checking active meteorological alerts...";
  if (conditionsEl) conditionsEl.innerText = "Latest weather update....";

  const countryCodeMap = {
    "Cambodia": "kh",
    "Thailand": "th",
    "Australia": "au",
    "Vietnam": "vn",
    "Singapore": "sg",
    "Laos": "la",
    "Malaysia": "my",
    "Philippines": "ph",
    "China": "cn",
    "Japan": "jp",
    "South Korea": "kr"
  };

  const code = countryCodeMap[countryName] || "";
  const candidates = [];
  if (code) candidates.push(`${cityName},${code}`);
  candidates.push(cityName);
  if (lat !== undefined && lon !== undefined) candidates.push(`${lat.toFixed(4)},${lon.toFixed(4)}`);

  let success = false;

  for (const locQuery of candidates) {
    if (signal.aborted) return;

    const alertsUrl = `https://phrases.api.xweather.com/alerts/${encodeURIComponent(locQuery)}?personality=meteorologist&stream=true&units=metric&client_id=${encodeURIComponent(XWEATHER_CLIENT_ID)}&client_secret=${encodeURIComponent(XWEATHER_CLIENT_SECRET)}`;
    const conditionsUrl = `https://phrases.api.xweather.com/conditions/${encodeURIComponent(locQuery)}?personality=meteorologist&stream=true&units=metric&forecast=true&client_id=${encodeURIComponent(XWEATHER_CLIENT_ID)}&client_secret=${encodeURIComponent(XWEATHER_CLIENT_SECRET)}`;

    try {
      if (alertsEl) {
        try {
          const gotAlerts = await streamXweatherIntoElement(alertsUrl, alertsEl, signal);
          if (!gotAlerts || !alertsEl.innerText.trim()) {
            alertsEl.innerText = "No active severe weather watches, warnings, or advisories for this area.";
          }
        } catch (alertErr) {
          if (signal.aborted) return;
          alertsEl.innerText = "No active severe weather watches, warnings, or advisories for this area.";
        }
      }

      if (conditionsEl) {
        await streamXweatherIntoElement(conditionsUrl, conditionsEl, signal);
      }

      success = true;
      break;
    } catch (err) {
      if (signal.aborted) return;
      console.warn(`Xweather meteorologist stream failed for "${locQuery}":`, err.message);
    }
  }

  if (!success && !signal.aborted) {
    if (alertsEl) alertsEl.innerText = "Weather alerts unavailable for this location.";
    if (conditionsEl) conditionsEl.innerText = "Current conditions and forecast stream unavailable for this location.";
  }
}

function renderTodayHourlySegments() {
  if (!fullHourlyTimeline || fullHourlyTimeline.length === 0) return;

  const now = new Date();
  const todayDateStr = now.toISOString().slice(0, 10);
  const todayHours = fullHourlyTimeline.filter(h => h.time.startsWith(todayDateStr));

  const getPeriodStats = (startH, endH, fallbackDefault) => {
    const slice = todayHours.filter(h => {
      const hr = new Date(h.time).getHours();
      return hr >= startH && hr < endH;
    });

    if (slice.length === 0) {
      return fallbackDefault;
    }

    const avg = key => slice.reduce((acc, c) => acc + (c[key] || 0), 0) / slice.length;
    const max = key => Math.max(...slice.map(c => c[key] || 0));
    const sum = key => slice.reduce((acc, c) => acc + (c[key] || 0), 0);

    return {
      temp: Math.round(avg('temp')),
      hum: Math.round(avg('humidity')),
      uv: Math.round(max('uv')),
      wind: Math.round(max('wind')),
      rain: sum('rain').toFixed(1)
    };
  };

  const pStats = [
    getPeriodStats(6, 12, { temp: 28, hum: 78, uv: 4, wind: 12, rain: "0.2" }),
    getPeriodStats(12, 18, { temp: 33, hum: 65, uv: 8, wind: 18, rain: "3.5" }),
    getPeriodStats(18, 24, { temp: 26, hum: 84, uv: 0, wind: 10, rain: "0.4" }),
    getPeriodStats(0, 6, { temp: 24, hum: 90, uv: 0, wind: 8, rain: "0.0" })
  ];

  const getPeriodIcon = (rainVal, isNight) => {
    if (parseFloat(rainVal) >= 4.0) {
      return `<div class="cloud-3d cloud-storm"></div><div class="lightning-3d"></div><div class="rain-drop r1"></div><div class="rain-drop r3"></div>`;
    } else if (parseFloat(rainVal) > 0.3) {
      return `<div class="cloud-3d"></div><div class="rain-drop r1"></div><div class="rain-drop r2"></div>`;
    } else if (isNight) {
      return `<div class="moon-3d"></div><div class="cloud-3d"></div>`;
    } else {
      return `<div class="sun-3d"></div><div class="cloud-3d"></div>`;
    }
  };

  for (let i = 0; i < 4; i++) {
    const s = pStats[i];
    const tEl = document.getElementById(`today-temp-${i}`);
    const hEl = document.getElementById(`today-hum-${i}`);
    const uEl = document.getElementById(`today-uv-${i}`);
    const wEl = document.getElementById(`today-wind-${i}`);
    const rEl = document.getElementById(`today-rain-${i}`);
    const iEl = document.getElementById(`today-icon-${i}`);

    if (tEl) tEl.innerText = `${s.temp}°`;
    if (hEl) hEl.innerText = `${s.hum}%`;
    if (uEl) uEl.innerText = `${s.uv}`;
    if (wEl) wEl.innerText = `${s.wind} K/H`;
    if (rEl) rEl.innerText = `${s.rain}mm`;
    if (iEl) iEl.innerHTML = getPeriodIcon(s.rain, i >= 2);
  }
}

function renderThreeDayProjectionWidget() {
  if (!cachedDaily || cachedDaily.length < 4) return;

  for (let i = 0; i < 3; i++) {
    const d = cachedDaily[i + 1];
    const dateObj = new Date(d.time);

    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const dateKey = d.time.slice(0, 10);

    const dayNameEl = document.getElementById(`tri-day-${i}`);
    const dateStrEl = document.getElementById(`tri-date-${i}`);
    if (dayNameEl) dayNameEl.innerText = i === 0 ? "Tomorrow" : dayName;
    if (dateStrEl) dateStrEl.innerText = dateStr;

    const dayHourly = fullHourlyTimeline.filter(h => h.time.startsWith(dateKey));
    const mHours = dayHourly.filter(h => { const hr = new Date(h.time).getHours(); return hr >= 6 && hr < 12; });
    const aHours = dayHourly.filter(h => { const hr = new Date(h.time).getHours(); return hr >= 12 && hr < 18; });
    const eHours = dayHourly.filter(h => { const hr = new Date(h.time).getHours(); return hr >= 18 && hr < 24; });
    const nHours = dayHourly.filter(h => { const hr = new Date(h.time).getHours(); return hr >= 0 && hr < 6; });

    const getPeriodStats = (arr, fallbackFactor) => {
      if (!arr || arr.length === 0) {
        const temp = Math.round(d.tempMin + (d.tempMax - d.tempMin) * fallbackFactor);
        const rain = (d.rainSum * fallbackFactor).toFixed(1);
        return { temp, rain };
      }
      const temp = Math.round(arr.reduce((acc, c) => acc + c.temp, 0) / arr.length);
      const rain = arr.reduce((acc, c) => acc + c.rain, 0).toFixed(1);
      return { temp, rain };
    };

    const mStats = getPeriodStats(mHours, 0.4);
    const aStats = getPeriodStats(aHours, 1.0);
    const eStats = getPeriodStats(eHours, 0.3);
    const nStats = getPeriodStats(nHours, 0.1);

    const tm = document.getElementById(`tri-temp-m-${i}`);
    const ta = document.getElementById(`tri-temp-a-${i}`);
    const te = document.getElementById(`tri-temp-e-${i}`);
    const tn = document.getElementById(`tri-temp-n-${i}`);
    if (tm) tm.innerText = `${mStats.temp}°`;
    if (ta) ta.innerText = `${aStats.temp}°`;
    if (te) te.innerText = `${eStats.temp}°`;
    if (tn) tn.innerText = `${nStats.temp}°`;

    const rm = document.getElementById(`tri-meta-m-${i}`);
    const ra = document.getElementById(`tri-meta-a-${i}`);
    const re = document.getElementById(`tri-meta-e-${i}`);
    const rn = document.getElementById(`tri-meta-n-${i}`);
    if (rm) rm.innerText = `💧 ${mStats.rain}mm`;
    if (ra) ra.innerText = `💧 ${aStats.rain}mm`;
    if (re) re.innerText = `💧 ${eStats.rain}mm`;
    if (rn) rn.innerText = `💧 ${nStats.rain}mm`;

    const getIconHtml = (rainVal, isNightPeriod) => {
      if (parseFloat(rainVal) >= 4.0) {
        return `<div class="cloud-3d cloud-storm"></div><div class="lightning-3d"></div><div class="rain-drop r1"></div><div class="rain-drop r3"></div>`;
      } else if (parseFloat(rainVal) > 0.4) {
        return `<div class="cloud-3d"></div><div class="rain-drop r1"></div><div class="rain-drop r2"></div>`;
      } else if (isNightPeriod) {
        return `<div class="moon-3d"></div><div class="cloud-3d"></div>`;
      } else {
        return `<div class="sun-3d"></div><div class="cloud-3d"></div>`;
      }
    };

    const im = document.getElementById(`tri-icon-m-${i}`);
    const ia = document.getElementById(`tri-icon-a-${i}`);
    const ie = document.getElementById(`tri-icon-e-${i}`);
    const inight = document.getElementById(`tri-icon-n-${i}`);
    if (im) im.innerHTML = getIconHtml(mStats.rain, false);
    if (ia) ia.innerHTML = getIconHtml(aStats.rain, false);
    if (ie) ie.innerHTML = getIconHtml(eStats.rain, true);
    if (inight) inight.innerHTML = getIconHtml(nStats.rain, true);
  }
}

async function loadWeatherData() {
  const active = getActiveCity();
  initOrUpdateSatelliteMap(active.lat, active.lon);

  loadXweatherSummaries(active.name, active.country, active.lat, active.lon);

  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${active.lat}&longitude=${active.lon}&models=ecmwf_ifs025&current=temperature_2m,relative_humidity_2m,apparent_temperature,rain,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,weather_code&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,rain,precipitation_probability,cloud_cover,surface_pressure,wind_speed_10m,wind_gusts_10m,uv_index,visibility,cape&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max&timezone=auto&forecast_days=7`;
  const tomorrowUrl = `https://api.tomorrow.io/v4/weather/forecast?location=${active.lat},${active.lon}&timesteps=1h,1d&units=metric&apikey=${API_KEY}`;

  let data = null;
  let isTomorrow = true;

  try {
    const res = await fetchWithTimeout(tomorrowUrl, {}, 2000);
    if (!res.ok) throw new Error(`Tomorrow.io HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    isTomorrow = false;
    try {
      const fallbackRes = await fetchWithTimeout(openMeteoUrl, {}, 2000);
      if (!fallbackRes.ok) throw new Error(`Open-Meteo HTTP ${fallbackRes.status}`);
      data = await fallbackRes.json();
    } catch (fbErr) {
      console.warn("Weather endpoints timed out or failed:", fbErr);
      return;
    }
  }

  if (isTomorrow) processTomorrowData(data);
  else processOpenMeteoData(data);
}

function processTomorrowData(data) {
  const active = getActiveCity();
  document.getElementById("city-name").innerText = active.name;
  document.getElementById("source-tag").innerText = active.isCurrent ? "MY LOCATION" : (active.country ? active.country.toUpperCase() : "CITY");

  const hourly = data.timelines.hourly;
  const daily = data.timelines.daily;

  fullHourlyTimeline = hourly.map(h => ({
    time: h.time,
    rain: h.values.rainIntensity || 0,
    temp: h.values.temperature,
    humidity: h.values.humidity || 60,
    wind: (h.values.windSpeed || 0) * 3.6,
    uv: h.values.uvIndex || 0
  }));

  cachedHourly = hourly.slice(0, 24).map(h => {
    const dObj = new Date(h.time);
    const cloud = h.values.cloudCover || 0;
    const solar = estimateSolarOutput600W(dObj, cloud);
    const timeKey = h.time.slice(0, 13) + ":00";
    const pmVal = hourlyPm25Map[timeKey] || parseFloat(latestPm25);
    const pm10Val = hourlyPm10Map[timeKey] !== undefined ? hourlyPm10Map[timeKey] : parseFloat(latestPm10);
    const so2Val = hourlySo2Map[timeKey] !== undefined ? hourlySo2Map[timeKey] : parseFloat(latestSo2);

    return {
      time: h.time,
      rain: h.values.rainIntensity || 0,
      cloud: cloud,
      temp: h.values.temperature,
      humidity: h.values.humidity || 60,
      pm25: pmVal,
      pm10: pm10Val,
      so2: so2Val,
      dew: h.values.dewPoint || h.values.temperature,
      wind: (h.values.windSpeed || 0) * 3.6,
      gust: (h.values.windGust || h.values.windSpeed || 0) * 3.6,
      uv: h.values.uvIndex || 0,
      pressure: h.values.pressureSurfaceLevel || 1006,
      solarWatts: solar.watts,
      solarGhi: solar.ghi
    };
  });

  cachedDaily = daily.slice(0, 7).map((d, idx) => {
    const estWh = Math.round(2700 * (1 - ((d.values.cloudCoverAvg || 35) / 100) * 0.52));
    return {
      time: d.time,
      tempMax: d.values.temperatureMax,
      tempMin: d.values.temperatureMin,
      humidityAvg: 65,
      rainSum: d.values.rainAccumulationSum || 0,
      windMax: (d.values.windSpeedMax || 4) * 3.6,
      uvMax: d.values.uvIndexMax || 6,
      solarWh: estWh,
      pm25: Math.max(2, parseFloat(latestPm25) + (idx % 2 === 0 ? 1.5 : -0.8)),
      pm10: Math.max(4, parseFloat(latestPm10) + (idx % 2 === 0 ? 2.5 : -1.2)),
      so2: Math.max(0.5, parseFloat(latestSo2) + (idx % 2 === 0 ? 0.8 : -0.4))
    };
  });

  const cur = hourly[0].values;
  const nextHour = hourly[1] ? hourly[1].values : cur;
  currentCloudCover = cur.cloudCover || 30;

  const currentTemp = Math.round(cur.temperature);
  const feelsTemp = Math.round(cur.temperatureApparent);
  const weatherLabel = parseWeatherCode(cur.weatherCode);

  checkRainAlert(cur.weatherCode, cur.rainIntensity || 0, nextHour.rainIntensity || 0, nextHour.precipitationProbability || 0);

  let todayHigh = currentTemp + 2;
  let todayLow = currentTemp - 4;
  let todayPrecip = 0;
  if (daily && daily.length > 0) {
    const d0 = daily[0].values;
    todayHigh = Math.round(d0.temperatureMax);
    todayLow = Math.round(d0.temperatureMin);
    todayPrecip = d0.rainAccumulationSum || 0;
  }

  const windKmh = (cur.windSpeed || 0) * 3.6;

  updateClimateWidget(
    currentTemp, feelsTemp, weatherLabel, todayHigh, todayLow, active.baselineAvg || 32,
    latestAqi, latestPm25, Math.round(cur.uvIndex || 0), cur.humidity || 56,
    cur.precipitationProbability || 0, cur.dewPoint || cur.temperature, windKmh, cur.weatherCode, cur.rainIntensity || 0,
    todayPrecip, currentCapeValue, latestPm10, latestSo2
  );

  const presVal = Math.round(cur.pressureSurfaceLevel || 1006);
  renderPressureDial(presVal, hourly[1] ? hourly[1].values.pressureSurfaceLevel : 1008);

  const rainVal = (cur.rainIntensity || 0).toFixed(1);
  document.getElementById("val-rain").innerText = `${rainVal} mm/h`;
  document.getElementById("rain-rate-sub").innerText = rainVal > 0 ? "Active precipitation rate." : `Total expected today: ${todayPrecip.toFixed(1)} mm`;

  const cloudPct = Math.round(cur.cloudCover || 0);
  document.getElementById("val-cloud").innerText = `${cloudPct}%`;
  document.getElementById("cloud-bar").style.width = `${cloudPct}%`;

  const dewVal = Math.round(cur.dewPoint || cur.temperature);
  document.getElementById("val-dewpoint").innerText = `${dewVal}°C`;

  const gustKmh = (cur.windGust || cur.windSpeed || 0) * 3.6;
  const windDirDeg = cur.windDirection || 0;
  const cardinal = getDegreesToCardinal(windDirDeg);

  document.getElementById("val-wind").innerText = `${windKmh.toFixed(1)} km/h`;
  document.getElementById("val-gusts").innerText = `${gustKmh.toFixed(1)} km/h`;
  document.getElementById("wind-dir-text").innerText = `${cardinal} (${Math.round(windDirDeg)}°)`;
  document.getElementById("compass-speed-num").innerText = `${Math.round(windKmh)}`;
  document.getElementById("compass-needle").style.transform = `rotate(${windDirDeg}deg)`;

  const visVal = (cur.visibility || 10).toFixed(1);
  document.getElementById("val-visibility").innerText = `${visVal} km`;

  initCanvasEngine(cur.weatherCode, cur.rainIntensity || 0, cur.cloudCover || 0, windKmh);
  updateTransitEphemerisDisplay();
  updateMoonWidget();
  renderActiveHourlyChart();
  renderActiveDailyChart();
  renderTodayHourlySegments();
  renderThreeDayProjectionWidget();
  renderStormTrackerWidget();
}

function processOpenMeteoData(data) {
  const active = getActiveCity();
  document.getElementById("city-name").innerText = active.name;
  document.getElementById("source-tag").innerText = active.isCurrent ? "MY LOCATION" : (active.country ? active.country.toUpperCase() : "CITY");

  const cur = data.current;
  const hourly = data.hourly;
  const daily = data.daily;

  const now = new Date();
  const currentHourStr = now.toISOString().slice(0, 13) + ":00";
  let startIdx = hourly.time.findIndex(t => t.startsWith(currentHourStr.slice(0, 13)));
  if (startIdx === -1) startIdx = 0;
  const nextIdx = Math.min(startIdx + 1, hourly.time.length - 1);
  currentCloudCover = cur.cloud_cover || 30;

  fullHourlyTimeline = [];
  for (let i = 0; i < hourly.time.length; i++) {
    fullHourlyTimeline.push({
      time: hourly.time[i],
      rain: hourly.rain[i] || 0,
      temp: hourly.temperature_2m[i],
      humidity: hourly.relative_humidity_2m[i] || 60,
      wind: hourly.wind_speed_10m[i] || 0,
      uv: hourly.uv_index ? hourly.uv_index[i] : 0
    });
  }

  cachedHourly = [];
  for (let i = startIdx; i < Math.min(startIdx + 24, hourly.time.length); i++) {
    const dObj = new Date(hourly.time[i]);
    const cloud = hourly.cloud_cover[i] || 0;
    const solar = estimateSolarOutput600W(dObj, cloud);
    const timeKey = hourly.time[i];
    const pmVal = hourlyPm25Map[timeKey] || parseFloat(latestPm25);
    const pm10Val = hourlyPm10Map[timeKey] !== undefined ? hourlyPm10Map[timeKey] : parseFloat(latestPm10);
    const so2Val = hourlySo2Map[timeKey] !== undefined ? hourlySo2Map[timeKey] : parseFloat(latestSo2);

    cachedHourly.push({
      time: hourly.time[i],
      rain: hourly.rain[i] || 0,
      cloud: cloud,
      temp: hourly.temperature_2m[i],
      humidity: hourly.relative_humidity_2m[i] || 60,
      pm25: pmVal,
      pm10: pm10Val,
      so2: so2Val,
      dew: hourly.dew_point_2m[i] || hourly.temperature_2m[i],
      wind: hourly.wind_speed_10m[i] || 0,
      gust: hourly.wind_gusts_10m[i] || hourly.wind_speed_10m[i] || 0,
      uv: hourly.uv_index ? hourly.uv_index[i] : 0,
      pressure: hourly.surface_pressure[i] || 1006,
      solarWatts: solar.watts,
      solarGhi: solar.ghi
    });
  }

  cachedDaily = [];
  for (let i = 0; i < Math.min(7, daily.time.length); i++) {
    const estWh = Math.round(2700 * (1 - 0.35 * 0.52));
    const dayPrecip = daily.precipitation_sum ? daily.precipitation_sum[i] : (daily.rain_sum ? daily.rain_sum[i] : 0);
    cachedDaily.push({
      time: daily.time[i],
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      humidityAvg: 65,
      rainSum: dayPrecip,
      windMax: daily.wind_speed_10m_max ? daily.wind_speed_10m_max[i] : 14,
      uvMax: daily.uv_index_max ? daily.uv_index_max[i] : 6,
      solarWh: estWh,
      pm25: Math.max(2, parseFloat(latestPm25) + (i % 2 === 0 ? 1.2 : -0.7)),
      pm10: Math.max(4, parseFloat(latestPm10) + (i % 2 === 0 ? 2.0 : -1.0)),
      so2: Math.max(0.5, parseFloat(latestSo2) + (i % 2 === 0 ? 0.6 : -0.3))
    });
  }

  const currentTemp = Math.round(cur.temperature_2m);
  const feelsTemp = Math.round(cur.apparent_temperature);
  const weatherLabel = parseWeatherCode(cur.weather_code);

  checkRainAlert(cur.weather_code, cur.rain, hourly.rain[nextIdx] || 0, hourly.precipitation_probability[nextIdx] || 0);

  const max0 = Math.round(daily.temperature_2m_max[0]);
  const min0 = Math.round(daily.temperature_2m_min[0]);
  const todayTotalPrecip = daily.precipitation_sum ? daily.precipitation_sum[0] : (daily.rain_sum ? daily.rain_sum[0] : 0);

  const windKmh = cur.wind_speed_10m || 0;
  const cape = hourly.cape ? Math.round(hourly.cape[startIdx] || 0) : currentCapeValue;

  updateClimateWidget(
    currentTemp, feelsTemp, weatherLabel, max0, min0, active.baselineAvg || 32,
    latestAqi, latestPm25, Math.round(hourly.uv_index ? hourly.uv_index[startIdx] : 0),
    cur.relative_humidity_2m || 56, hourly.precipitation_probability[startIdx] || 0,
    hourly.dew_point_2m[startIdx] || cur.temperature_2m, windKmh, cur.weather_code, cur.rain,
    todayTotalPrecip, cape, latestPm10, latestSo2
  );

  const presVal = Math.round(cur.surface_pressure || 1006);
  renderPressureDial(presVal, hourly.surface_pressure[nextIdx] || 1008);

  const rainVal = (cur.rain || 0).toFixed(1);
  document.getElementById("val-rain").innerText = `${rainVal} mm/h`;
  document.getElementById("rain-rate-sub").innerText = rainVal > 0 ? "Active precipitation rate." : `Total expected today: ${todayTotalPrecip.toFixed(1)} mm`;

  const cloudPct = Math.round(cur.cloud_cover || 0);
  document.getElementById("val-cloud").innerText = `${cloudPct}%`;
  document.getElementById("cloud-bar").style.width = `${cloudPct}%`;

  const dewVal = Math.round(hourly.dew_point_2m[startIdx] || cur.temperature_2m);
  document.getElementById("val-dewpoint").innerText = `${dewVal}°C`;

  const gustKmh = cur.wind_gusts_10m || cur.wind_speed_10m || 0;
  const windDirDeg = cur.wind_direction_10m || 0;
  const cardinal = getDegreesToCardinal(windDirDeg);

  document.getElementById("val-wind").innerText = `${windKmh.toFixed(1)} km/h`;
  document.getElementById("val-gusts").innerText = `${gustKmh.toFixed(1)} km/h`;
  document.getElementById("wind-dir-text").innerText = `${cardinal} (${Math.round(windDirDeg)}°)`;
  document.getElementById("compass-speed-num").innerText = `${Math.round(windKmh)}`;
  document.getElementById("compass-needle").style.transform = `rotate(${windDirDeg}deg)`;

  const visKm = hourly.visibility ? (hourly.visibility[startIdx] / 1000).toFixed(1) : "10.0";
  document.getElementById("val-visibility").innerText = `${visKm} km`;

  initCanvasEngine(cur.weather_code, cur.rain, cur.cloud_cover, cur.wind_speed_10m);
  updateTransitEphemerisDisplay();
  updateMoonWidget();
  renderActiveHourlyChart();
  renderActiveDailyChart();
  renderTodayHourlySegments();
  renderThreeDayProjectionWidget();
  renderStormTrackerWidget();
}

let animId = null;
function initCanvasEngine(weatherCode, rainMm, cloudCover, windSpeed) {
  if (animId) cancelAnimationFrame(animId);

  const canvas = document.getElementById("weatherCanvas");
  const ctx = canvas.getContext("2d");
  const flashEl = document.getElementById("lightningFlash");

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.onresize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };

  const isThunder = weatherCode === 8000 || [95, 96, 99].includes(weatherCode);
  const isRaining = rainMm > 0 || [4000, 4001, 4200, 4201, 51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode) || isThunder;

  const rainCount = isRaining ? Math.min(220, Math.max(40, Math.round(rainMm * 40 + 60))) : 0;
  const raindrops = [];
  for (let i = 0; i < rainCount; i++) {
    raindrops.push({
      x: Math.random() * width,
      y: Math.random() * height,
      length: Math.random() * 20 + 14,
      speed: Math.random() * 10 + 14,
      opacity: Math.random() * 0.35 + 0.15
    });
  }

  const cloudCount = Math.max(3, Math.round((cloudCover / 100) * 10));
  const clouds = [];
  for (let i = 0; i < cloudCount; i++) {
    clouds.push({
      x: Math.random() * width,
      y: Math.random() * (height * 0.65),
      radius: Math.random() * 150 + 100,
      speed: (Math.random() * 0.2 + 0.08) * (1 + windSpeed / 20),
      alpha: Math.min(0.16, Math.max(0.04, (cloudCover / 100) * 0.2))
    });
  }

  let lastFlash = Date.now();
  let nextFlashDelay = Math.random() * 6000 + 4000;

  function loop() {
    ctx.clearRect(0, 0, width, height);

    clouds.forEach(c => {
      c.x += c.speed;
      if (c.x - c.radius > width) c.x = -c.radius;
      const grad = ctx.createRadialGradient(c.x, c.y, c.radius * 0.1, c.x, c.y, c.radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${c.alpha})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    if (isRaining) {
      ctx.strokeStyle = "rgba(220, 235, 250, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      raindrops.forEach(r => {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - 1.5, r.y + r.length);
        r.y += r.speed;
        r.x -= 0.8;
        if (r.y > height) {
          r.y = -r.length;
          r.x = Math.random() * width;
        }
      });
      ctx.stroke();
    }

    if (isThunder && Date.now() - lastFlash > nextFlashDelay) {
      flashEl.style.opacity = "0.7";
      setTimeout(() => { flashEl.style.opacity = "0"; }, 80);
      lastFlash = Date.now();
      nextFlashDelay = Math.random() * 8000 + 3500;
    }

    animId = requestAnimationFrame(loop);
  }

  loop();
}

function switchHourlyView(view) {
  currentHourlyView = view;
  const parent = document.getElementById("hourlyForecastChart").parentElement;
  parent.querySelectorAll(".seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("onclick").includes(view));
  });
  renderActiveHourlyChart();
}

function renderActiveHourlyChart() {
  if (!cachedHourly || cachedHourly.length === 0) return;

  const slice = cachedHourly.slice(0, 24);
  const labels = slice.map(h => {
    const d = new Date(h.time);
    return d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
  });

  const ctx = document.getElementById("hourlyForecastChart").getContext("2d");
  if (hourlyChartInstance) hourlyChartInstance.destroy();

  let datasets = [];
  let scales = {
    x: { grid: { display: false }, ticks: { color: "rgba(255, 255, 255, 0.6)", font: { size: 10 } } }
  };

  if (currentHourlyView === 'temp') {
    datasets = [
      { type: "line", label: "Temp (°C)", data: slice.map(h => h.temp), borderColor: "#ffffff", backgroundColor: "rgba(255, 255, 255, 0.1)", fill: true, borderWidth: 2, pointRadius: 2, tension: 0.3, yAxisID: "y" }
    ];
    scales.y = { grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v}°` } };

  } else if (currentHourlyView === 'humidity') {
    datasets = [
      { type: "line", label: "Humidity (%)", data: slice.map(h => h.humidity), borderColor: "#38bdf8", backgroundColor: "rgba(56, 189, 248, 0.15)", fill: true, tension: 0.3, yAxisID: "y" }
    ];
    scales.y = { min: 0, max: 100, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v}%` } };

  } else if (currentHourlyView === 'uv') {
    datasets = [
      { type: "bar", label: "UV Index", data: slice.map(h => h.uv), backgroundColor: "rgba(251, 191, 36, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 12, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)" } };

  } else if (currentHourlyView === 'pm25') {
    datasets = [
      { type: "bar", label: "PM2.5 (µg/m³)", data: slice.map(h => h.pm25), backgroundColor: "rgba(52, 211, 153, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 40, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} µg` } };

  } else if (currentHourlyView === 'pm10') {
    datasets = [
      { type: "bar", label: "PM10 (µg/m³)", data: slice.map(h => h.pm10 || 0), backgroundColor: "rgba(56, 189, 248, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 80, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} µg` } };

  } else if (currentHourlyView === 'so2') {
    datasets = [
      { type: "bar", label: "SO₂ (µg/m³)", data: slice.map(h => h.so2 || 0), backgroundColor: "rgba(250, 204, 21, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 40, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} µg` } };

  } else if (currentHourlyView === 'wind') {
    datasets = [
      { type: "line", label: "Wind (km/h)", data: slice.map(h => h.wind), borderColor: "#93c5fd", tension: 0.3, yAxisID: "y" },
      { type: "line", label: "Gusts (km/h)", data: slice.map(h => h.gust), borderColor: "rgba(255, 255, 255, 0.5)", borderDash: [3, 3], tension: 0.3, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)" } };

  } else if (currentHourlyView === 'rain') {
    datasets = [
      { type: "bar", label: "Rain (mm/h)", data: slice.map(h => h.rain), backgroundColor: "rgba(125, 211, 252, 0.8)", borderRadius: 6, yAxisID: "y" },
      { type: "line", label: "Cloud Cover (%)", data: slice.map(h => h.cloud), borderColor: "rgba(255, 255, 255, 0.6)", borderWidth: 1.5, pointRadius: 0, tension: 0.35, yAxisID: "y1" }
    ];
    scales.y = { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)" } };
    scales.y1 = { beginAtZero: true, max: 100, position: "right", grid: { drawOnChartArea: false }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v}%` } };

  } else if (currentHourlyView === 'solar') {
    const solarGrad = ctx.createLinearGradient(0, 0, 0, 160);
    solarGrad.addColorStop(0, "rgba(250, 204, 21, 0.7)");
    solarGrad.addColorStop(1, "rgba(250, 204, 21, 0.05)");

    datasets = [
      { type: "line", label: "600W Output (W)", data: slice.map(h => Math.round(h.solarWatts)), borderColor: "#facc15", backgroundColor: solarGrad, fill: true, borderWidth: 2, pointRadius: 1, tension: 0.35, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 600, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v}W` } };
  }

  hourlyChartInstance = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { color: "rgba(255, 255, 255, 0.7)", usePointStyle: true, boxWidth: 6, font: { size: 10 } }
        }
      },
      scales
    }
  });
}

function switchDailyView(view) {
  currentDailyView = view;
  const parent = document.getElementById("dailyForecastChart").parentElement;
  parent.querySelectorAll(".seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("onclick").includes(view));
  });
  renderActiveDailyChart();
}

function renderActiveDailyChart() {
  if (!cachedDaily || cachedDaily.length < 4) return;

  const labels = cachedDaily.map((d, i) => {
    if (i === 0) return "Today";
    const dateObj = new Date(d.time);
    return dateObj.toLocaleDateString("en-US", { weekday: "short" });
  });

  const ctx = document.getElementById("dailyForecastChart").getContext("2d");
  if (dailyChartInstance) dailyChartInstance.destroy();

  let datasets = [];
  let scales = {
    x: { grid: { display: false }, ticks: { color: "rgba(255, 255, 255, 0.6)", font: { size: 10 } } }
  };

  if (currentDailyView === 'temp') {
    datasets = [
      { type: "line", label: "High (°C)", data: cachedDaily.map(d => Math.round(d.tempMax)), borderColor: "#fb923c", backgroundColor: "rgba(251, 146, 60, 0.15)", borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: "y" },
      { type: "line", label: "Low (°C)", data: cachedDaily.map(d => Math.round(d.tempMin)), borderColor: "#38bdf8", backgroundColor: "rgba(56, 189, 248, 0.1)", borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: "y" }
    ];
    scales.y = { grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v}°` } };

  } else if (currentDailyView === 'humidity') {
    datasets = [
      { type: "bar", label: "Avg Humidity (%)", data: cachedDaily.map(d => Math.round(d.humidityAvg)), backgroundColor: "rgba(56, 189, 248, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { min: 0, max: 100, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v}%` } };

  } else if (currentDailyView === 'uv') {
    datasets = [
      { type: "bar", label: "Max UV", data: cachedDaily.map(d => Math.round(d.uvMax)), backgroundColor: "rgba(251, 191, 36, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 12, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)" } };

  } else if (currentDailyView === 'pm25') {
    datasets = [
      { type: "bar", label: "Avg PM2.5 (µg/m³)", data: cachedDaily.map(d => d.pm25.toFixed(1)), backgroundColor: "rgba(52, 211, 153, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 35, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} µg` } };

  } else if (currentDailyView === 'pm10') {
    datasets = [
      { type: "bar", label: "Avg PM10 (µg/m³)", data: cachedDaily.map(d => (d.pm10 || 0).toFixed(1)), backgroundColor: "rgba(56, 189, 248, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 60, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} µg` } };

  } else if (currentDailyView === 'so2') {
    datasets = [
      { type: "bar", label: "Avg SO₂ (µg/m³)", data: cachedDaily.map(d => (d.so2 || 0).toFixed(1)), backgroundColor: "rgba(250, 204, 21, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 30, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} µg` } };

  } else if (currentDailyView === 'wind') {
    datasets = [
      { type: "bar", label: "Peak Wind (km/h)", data: cachedDaily.map(d => Math.round(d.windMax)), backgroundColor: "rgba(147, 197, 253, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} km/h` } };

  } else if (currentDailyView === 'rain') {
    datasets = [
      { type: "bar", label: "Daily Rain (mm)", data: cachedDaily.map(d => d.rainSum.toFixed(1)), backgroundColor: "rgba(56, 189, 248, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)" } };

  } else if (currentDailyView === 'solar') {
    datasets = [
      { type: "bar", label: "Est. Solar (Wh)", data: cachedDaily.map(d => d.solarWh), backgroundColor: "rgba(250, 204, 21, 0.8)", borderRadius: 6, yAxisID: "y" }
    ];
    scales.y = { beginAtZero: true, max: 3000, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { color: "rgba(255, 255, 255, 0.6)", callback: v => `${v} Wh` } };
  }

  dailyChartInstance = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { color: "rgba(255, 255, 255, 0.7)", usePointStyle: true, boxWidth: 6, font: { size: 10 } }
        }
      },
      scales
    }
  });
}

async function fetchEarthquakes() {
  const loadingEl = document.getElementById('eq-loading');
  const errorEl = document.getElementById('eq-error');

  try {
    const response = await fetchWithTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {}, 2000);
    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();
    allEarthquakes = data.features;

    loadingEl.style.display = 'none';
    document.getElementById('eq-update-time').textContent = `Updated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    filterAndRenderEq();
  } catch (err) {
    console.warn("USGS Earthquake fetch failed or timed out (2s):", err);
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
  }
}

function filterAndRenderEq() {
  const threshold = parseFloat(document.getElementById('mag-filter').value);
  const noEqEl = document.getElementById('eq-no-data');
  const listEl = document.getElementById('earthquake-list');

  const filtered = allEarthquakes.filter(eq => eq.properties.mag > threshold);

  if (filtered.length === 0) {
    noEqEl.style.display = 'block';
    listEl.style.display = 'none';
    noEqEl.textContent = `No earthquakes > M${threshold} recorded today. 🎉`;
    return;
  }

  noEqEl.style.display = 'none';
  listEl.style.display = 'flex';
  listEl.innerHTML = '';

  filtered.forEach(eq => {
    const props = eq.properties;
    const time = new Date(props.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let badgeColor = '#f97316';
    if (props.mag >= 7.0) badgeColor = '#b91c1c';
    else if (props.mag >= 6.5) badgeColor = '#ef4444';
    else if (props.mag < 4.0) badgeColor = '#eab308';

    const item = document.createElement('li');
    item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;';

    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
        <span style="background: ${badgeColor}; color: white; font-weight: bold; padding: 2px 6px; border-radius: 6px; font-size: 0.72rem; flex-shrink: 0;">
          M ${props.mag.toFixed(1)}
        </span>
        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          <div style="font-size: 0.8rem; font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${props.place}">${props.place}</div>
          <div style="font-size: 0.65rem; color: var(--muted);">${time}</div>
        </div>
      </div>
      <a href="${props.url}" target="_blank" style="font-size: 0.72rem; color: #38bdf8; text-decoration: none; font-weight: 500; flex-shrink: 0; margin-left: 8px;">
        Details &rarr;
      </a>
    `;
    listEl.appendChild(item);
  });
}

function toggleCityModal(show) {
  const backdrop = document.getElementById("modalBackdrop");
  if (show) {
    backdrop.classList.add("open");
    renderSavedCities();
    setTimeout(() => {
      const input = document.getElementById("citySearchInput");
      if (input) input.focus();
    }, 100);
  } else {
    backdrop.classList.remove("open");
    document.getElementById("citySearchInput").value = "";
    document.getElementById("searchSection").style.display = "none";
  }
}

function handleBackdropClick(e) {
  if (e.target.id === "modalBackdrop") toggleCityModal(false);
}

function renderSavedCities() {
  const list = document.getElementById("savedCitiesList");
  list.innerHTML = "";

  cities.forEach((city, idx) => {
    const li = document.createElement("li");
    li.className = "city-item";
    li.innerHTML = `
      <div class="city-item-left" onclick="selectCityFromModal(${idx})">
        <span class="city-item-name">${city.name} ${city.isCurrent ? '📍' : ''}</span>
        <span class="city-item-country">${city.country || ''}</span>
      </div>
      <div class="city-item-actions">
        ${!city.isCurrent && cities.length > 1 ? `<button class="city-remove-btn" onclick="removeCity(${idx})">✕</button>` : ''}
      </div>
    `;
    list.appendChild(li);
  });
}

function selectCityFromModal(idx) {
  toggleCityModal(false);
  goToCity(idx);
}

function removeCity(idx) {
  if (cities.length <= 1) return;
  cities.splice(idx, 1);
  if (currentCityIndex >= cities.length) currentCityIndex = cities.length - 1;
  saveCitiesState();
  renderSavedCities();
  renderPagination();
  updateCityView();
}

let searchDebounceTimer = null;
function handleCitySearch(query) {
  clearTimeout(searchDebounceTimer);
  const searchSection = document.getElementById("searchSection");
  const list = document.getElementById("searchResultsList");

  const cleanQuery = (query || "").trim();
  if (cleanQuery.length < 2) {
    searchSection.style.display = "none";
    list.innerHTML = "";
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=6&language=en&format=json`;

      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      const data = await res.json();
      list.innerHTML = "";

      if (data && data.results && data.results.length > 0) {
        searchSection.style.display = "block";
        data.results.forEach(resItem => {
          const item = document.createElement("li");
          item.className = "city-item";
          const admin = resItem.admin1 ? `${resItem.admin1}, ` : '';
          item.innerHTML = `
            <div class="city-item-left">
              <span class="city-item-name">${resItem.name}</span>
              <span class="city-item-country">${admin}${resItem.country || ''}</span>
            </div>
            <span style="font-size: 0.78rem; color: #38bdf8; font-weight: 600;">+ Add</span>
          `;
          item.onclick = () => addNewCity({
            name: resItem.name,
            country: resItem.country || '',
            lat: resItem.latitude,
            lon: resItem.longitude,
            timezone: resItem.timezone || 'Asia/Bangkok',
            isCurrent: false,
            baselineAvg: 32
          });
          list.appendChild(item);
        });
      } else {
        searchSection.style.display = "block";
        list.innerHTML = `<li style="font-size: 0.8rem; color: var(--muted); padding: 8px;">No matching cities found.</li>`;
      }
    } catch (err) {
      console.error("Geocoding request failed or timed out:", err);
      searchSection.style.display = "block";
      list.innerHTML = `<li style="font-size: 0.8rem; color: #f87171; padding: 8px;">City search connection issue. Please retry.</li>`;
    }
  }, 250);
}

function addNewCity(cityObj) {
  cities.push(cityObj);
  saveCitiesState();
  toggleCityModal(false);
  goToCity(cities.length - 1);
}

async function updateCityView() {
  showLoading(true);
  const active = getActiveCity();

  const safetyTimer = setTimeout(() => {
    showLoading(false);
  }, 2000);

  const runTask = (taskPromise) =>
    Promise.race([
      taskPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
    ]).catch(err => console.warn("Task skipped or timed out:", err));

  try {
    active.baselineAvg = await fetchHistoricalBaselineAvg(active.lat, active.lon, active.timezone || "auto").catch(() => 32);

    await Promise.allSettled([
      runTask(fetchSolarEphemeris(active.lat, active.lon)),
      runTask(loadAirQuality()),
      runTask(loadWeatherData()),
      runTask(updateIQAirWidget(active.lat, active.lon)),
      runTask(loadPollenAndAllergens(active.lat, active.lon)),
      runTask(checkSeismicAndTsunami(active.lat, active.lon)),
      runTask(loadAtmosphericHazards(active.lat, active.lon))
    ]);

    updateWindyWidget(active.lat, active.lon);
    checkVolcanoHazards(active.lat, active.lon);
    updateClock();
    syncTopActiveAlerts();
  } catch (e) {
    console.error("Error refreshing city view:", e);
  } finally {
    clearTimeout(safetyTimer);
    showLoading(false);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initPullToRefresh();
  renderPagination();
  updateCityView();
  document.getElementById('mag-filter').addEventListener('change', filterAndRenderEq);
  fetchEarthquakes();
});