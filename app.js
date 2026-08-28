const API_URL = "https://script.google.com/macros/s/AKfycbz2X2CTXf9hu6dS-j2QjibDwpk06WeNF9qh6MkHApt-UFYpVJYUcwtvPShafBldmJPZAw/exec";
const TRIP_YEAR = 2026;
const TIMELINE_UPDATE_INTERVAL = 60 * 1000;

const $ = selector => document.querySelector(selector);
let itineraryDays = [];
let eventDetailsCounter = 0;
let timelineUpdateTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshButton").addEventListener("click", loadData);
  $("#todayButton").addEventListener("click", () => {
    showAppView("itinerary");
    scrollToToday();
  });
  setupTabs();
  setupTimelineTimer();
  loadData();
});

async function loadData() {
  setStatus("Caricamento itinerario…");

  try {
    const response = await fetch(API_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const payload = await response.json();
    const itinerary = normalizeItineraryData(payload);

    itineraryDays = itinerary.days;
    renderNavigation(itineraryDays);
    renderItinerary(itineraryDays);
    updateTripHeader(itinerary.meta, itineraryDays);

    const now = new Date();
    setStatus(
      `Aggiornato alle ${now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "Non riesco a caricare i dati dall'endpoint JSON. Verifica che l'URL sia pubblico e restituisca JSON valido.",
      true
    );
  }
}

function normalizeItineraryData(payload) {
  if (Array.isArray(payload)) {
    return {
      meta: null,
      days: normalizeRows(payload)
    };
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.giorni)) {
    const meta = normalizeTripMeta(payload.viaggio);

    return {
      meta,
      days: normalizeStructuredDays(payload.giorni)
    };
  }

  throw new Error("Formato JSON non supportato.");
}

function normalizeTripMeta(meta) {
  if (!meta || typeof meta !== "object") return null;

  return {
    name: String(getField(meta, ["nome", "Nome", "name", "Name"]) || "").trim(),
    start: String(getField(meta, ["inizio", "Inizio", "start", "Start"]) || "").trim(),
    end: String(getField(meta, ["fine", "Fine", "end", "End"]) || "").trim(),
    timezone: String(getField(meta, ["timezone", "Timezone", "timeZone", "TimeZone"]) || "").trim()
  };
}

function normalizeStructuredDays(days) {
  return days
    .map(day => {
      const dateObject = parseIsoDate(getField(day, ["data", "Data", "date", "Date"]));

      if (!dateObject) return null;

      const rawEvents = getField(day, ["eventi", "Eventi", "events", "Events"]);
      const events = Array.isArray(rawEvents) ? rawEvents : [];

      return {
        date: toDateKey(dateObject),
        dateObject,
        weekday: String(getField(day, ["giorno", "Giorno", "weekday", "Weekday"]) || "").trim()
          || capitalize(dateObject.toLocaleDateString("it-IT", { weekday: "long" })),
        events: events
          .map(event => {
            const time = normalizeTime(getField(event, ["ora", "Ora", "ore", "Ore", "time", "Time"]));
            const description = String(getField(event, ["descrizione", "Descrizione", "description", "Description"]) || "").trim();
            const note = String(getField(event, ["note", "Note", "notes", "Notes"]) || "").trim();
            const link = normalizeUrl(String(getField(event, ["link", "Link", "url", "URL"]) || "").trim());

            if (![time, description, note, link].some(value => value !== "")) return null;

            return { time, description, note, link };
          })
          .filter(Boolean)
          .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dateObject - b.dateObject);
}

function normalizeRows(rows) {
  const grouped = new Map();

  rows.forEach(row => {
    const giornoRaw = getField(row, ["Giorno", "giorno"]);
    const oreRaw = getField(row, ["Ore", "ore", "Ora", "ora"]);
    const description = getField(row, ["Descrizione", "descrizione"]);
    const note = getField(row, ["Note", "note"]);
    const link = getField(row, ["Link", "link"]);

    const hasAnyContent = [giornoRaw, oreRaw, description, note, link]
      .some(value => String(value || "").trim() !== "");

    if (!hasAnyContent) return;

    const parsed = parseDateTime(oreRaw) || parseDayLabel(giornoRaw);

    if (!parsed) return;

    const key = parsed.date;

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        dateObject: parsed.dateObject,
        weekday: capitalize(
          parsed.dateObject.toLocaleDateString("it-IT", { weekday: "long" })
        ),
        events: []
      });
    }

    if (description || note || link || parsed.time) {
      grouped.get(key).events.push({
        time: parsed.time || extractTime(oreRaw),
        description: String(description || "").trim(),
        note: String(note || "").trim(),
        link: normalizeUrl(String(link || "").trim())
      });
    }
  });

  const days = [...grouped.values()].sort(
    (a, b) => a.dateObject - b.dateObject
  );

  days.forEach(day => {
    day.events.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  });

  return days;
}

function getField(row, possibleNames) {
  if (!row || typeof row !== "object") return "";

  for (const name of possibleNames) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }

  const keys = Object.keys(row);
  const normalizedNames = possibleNames.map(name => name.toLowerCase());

  const found = keys.find(key =>
    normalizedNames.includes(key.trim().toLowerCase())
  );

  return found ? row[found] : "";
}

function parseDateTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?/);

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : TRIP_YEAR;

  if (year < 100) year += 2000;

  const hour = match[4] !== undefined ? Number(match[4]) : 0;
  const minute = match[5] !== undefined ? Number(match[5]) : 0;

  const dateObject = new Date(year, month - 1, day, hour, minute);

  if (
    dateObject.getFullYear() !== year ||
    dateObject.getMonth() !== month - 1 ||
    dateObject.getDate() !== day
  ) return null;

  return {
    date: toDateKey(dateObject),
    dateObject,
    time: match[4] !== undefined
      ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : ""
  };
}

function parseDayLabel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const months = {
    jan: 0, january: 0, gen: 0, gennaio: 0,
    feb: 1, february: 1, febbraio: 1,
    mar: 2, march: 2, marzo: 2,
    apr: 3, april: 3, aprile: 3,
    may: 4, mag: 4, maggio: 4,
    jun: 5, june: 5, giu: 5, giugno: 5,
    jul: 6, july: 6, lug: 6, luglio: 6,
    aug: 7, august: 7, ago: 7, agosto: 7,
    sep: 8, sept: 8, september: 8, set: 8, settembre: 8,
    oct: 9, october: 9, ott: 9, ottobre: 9,
    nov: 10, november: 10, novembre: 10,
    dec: 11, december: 11, dic: 11, dicembre: 11
  };

  const match = text.match(/(\d{1,2})\s+([a-zàèéìòù]+)/i);
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const month = months[monthName];

  if (month === undefined) return null;

  const dateObject = new Date(TRIP_YEAR, month, day);

  return {
    date: toDateKey(dateObject),
    dateObject,
    time: ""
  };
}

function parseIsoDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dateObject = new Date(year, month - 1, day);

  if (
    dateObject.getFullYear() !== year ||
    dateObject.getMonth() !== month - 1 ||
    dateObject.getDate() !== day
  ) return null;

  return dateObject;
}

function normalizeTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;

  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function renderNavigation(days) {
  const nav = $("#dayNav");
  nav.innerHTML = "";
}

function renderItinerary(days) {
  const root = $("#itinerary");
  root.innerHTML = "";
  eventDetailsCounter = 0;

  if (!days.length) {
    root.innerHTML = '<div class="empty-day">Nessuna attività trovata nel file JSON.</div>';
    return;
  }

  days.forEach((day, index) => {
    const section = document.createElement("section");
    section.className = "day";
    section.id = `day-${index}`;
    section.setAttribute("data-day-date", day.date);

    const formattedDate = day.dateObject.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).toUpperCase();

    section.innerHTML = `
      <div class="day__card">
        <div class="day__header">
          <div>
            <h2 class="day__title">${escapeHtml(formattedDate)}</h2>
            <div class="day__date">${escapeHtml(day.weekday)}</div>
          </div>
        </div>
        <div class="day__events"></div>
      </div>
    `;

    const eventsRoot = section.querySelector(".day__events");

    if (!day.events.length) {
      eventsRoot.innerHTML = '<div class="empty-day">Nessuna attività pianificata.</div>';
    } else {
      day.events.forEach(event => eventsRoot.appendChild(createEvent(event)));
    }

    root.appendChild(section);
  });

  updateTimelineMarkers();
  observeCurrentDay();
}

function createEvent(event) {
  const article = document.createElement("article");
  const hasNote = String(event.note || "").trim() !== "";
  const detailsId = hasNote ? `event-details-${eventDetailsCounter += 1}` : "";

  article.className = `event${hasNote ? " event--expandable" : ""}`;
  article.setAttribute("data-event-time", event.time || "");

  const linkButton = event.link
    ? `<a class="event__link" href="${escapeAttribute(event.link)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttribute(linkLabel(event.link))}">&#8599;</a>`
    : "";
  const title = event.description ? escapeHtml(event.description) : "Dettagli";
  const summary = hasNote
    ? `<button class="event__summary" type="button" aria-expanded="false" aria-controls="${detailsId}">
        <span class="event__title">${title}</span>
        <img class="event__chevron" src="assets/arrow-down.svg" alt="" aria-hidden="true">
      </button>`
    : `<div class="event__summary">
        <span class="event__title">${title}</span>
      </div>`;

  article.innerHTML = `
    <div class="event__timeline" aria-hidden="true"></div>
    <div class="event__time">${escapeHtml(event.time || "")}</div>
    <div class="event__divider" aria-hidden="true"></div>
    <div class="event__body">
      ${summary}
      ${hasNote
        ? `<div id="${detailsId}" class="event__details" hidden>${formatNote(event.note)}</div>`
        : ""}
    </div>
    ${linkButton}
  `;

  const summaryButton = article.querySelector(".event__summary[aria-controls]");
  summaryButton?.addEventListener("click", () => toggleEventDetails(summaryButton));

  return article;
}

function toggleEventDetails(button) {
  const details = document.getElementById(button.getAttribute("aria-controls"));
  if (!details) return;

  const isOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isOpen));
  details.hidden = isOpen;
}

function setupTimelineTimer() {
  if (timelineUpdateTimer) return;

  timelineUpdateTimer = window.setInterval(
    updateTimelineMarkers,
    TIMELINE_UPDATE_INTERVAL
  );
}

function updateTimelineMarkers(now = new Date()) {
  const todayKey = toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  document.querySelectorAll(".day").forEach(dayRoot => {
    const dayKey = dayRoot.getAttribute("data-day-date");
    const eventsRoot = dayRoot.querySelector(".day__events");
    if (!eventsRoot) return;

    const events = [...eventsRoot.querySelectorAll(".event")];

    events.forEach(event => {
      event.classList.remove(
        "event--timeline-past",
        "event--timeline-current",
        "event--timeline-current-no-past"
      );
    });

    if (dayKey < todayKey) {
      events.forEach(event => event.classList.add("event--timeline-past"));
      return;
    }

    if (dayKey > todayKey) return;

    const timedEvents = events
      .map((event, index) => ({
        event,
        index,
        minutes: timeToMinutes(event.getAttribute("data-event-time"))
      }))
      .filter(item => item.minutes !== null);

    if (!timedEvents.length) return;

    const current = timedEvents.reduce((closest, item) => {
      const itemDistance = Math.abs(item.minutes - nowMinutes);
      const closestDistance = Math.abs(closest.minutes - nowMinutes);

      if (itemDistance < closestDistance) return item;
      if (
        itemDistance === closestDistance &&
        item.minutes >= nowMinutes &&
        closest.minutes < nowMinutes
      ) return item;

      return closest;
    });

    events.forEach((event, index) => {
      if (index < current.index) {
        event.classList.add("event--timeline-past");
      }
    });

    const hasPastBeforeMarker = timedEvents.some(item =>
      item.index < current.index && item.minutes <= nowMinutes
    );

    current.event.classList.add("event--timeline-current");

    if (current.minutes > nowMinutes && !hasPastBeforeMarker) {
      current.event.classList.add("event--timeline-current-no-past");
    }
  });
}

function setupTabs() {
  document.querySelectorAll(".app-tabs__button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".app-tabs__button").forEach(item => {
        item.classList.toggle("is-active", item === button);
      });

      if (button.dataset.action === "itinerary") {
        showAppView("itinerary");
        $("#itinerary")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

      if (button.dataset.action === "weather") {
        showAppView("weather");
      }
    });
  });
}

function showAppView(view) {
  const isWeather = view === "weather";

  $("#itinerary").hidden = isWeather;
  $("#weather").hidden = !isWeather;
  $("#status").hidden = isWeather;
  $("#dayNav").hidden = isWeather;
}

function updateTripHeader(meta, days) {
  if (meta?.name) {
    const title = document.querySelector(".hero h1");
    if (title) title.textContent = meta.name;
  }

  const start = parseIsoDate(meta?.start);
  const end = parseIsoDate(meta?.end);

  if (start && end) {
    $("#tripDates").textContent = formatDateRange(start, end);
    return;
  }

  updateTripDates(days);
}

function updateTripDates(days) {
  if (!days.length) return;

  const first = days[0].dateObject;
  const last = days[days.length - 1].dateObject;

  $("#tripDates").textContent = formatDateRange(first, last);
}

function formatDateRange(first, last) {
  const firstText = first.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long"
  });

  const lastText = last.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return `${firstText} – ${lastText}`;
}

function scrollToToday() {
  const now = new Date();
  const todayKey = toDateKey(now);
  const index = itineraryDays.findIndex(day => day.date === todayKey);

  if (index >= 0) {
    document.getElementById(`day-${index}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    return;
  }

  if (itineraryDays.length) {
    document.getElementById("day-0")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function observeCurrentDay() {
  const sections = [...document.querySelectorAll(".day")];
  const buttons = [...document.querySelectorAll(".day-nav__button")];

  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    buttons.forEach(button => {
      button.classList.toggle(
        "is-active",
        button.dataset.target === visible.target.id
      );
    });
  }, {
    rootMargin: "-90px 0px -55% 0px",
    threshold: [0, .2, .5]
  });

  sections.forEach(section => observer.observe(section));
}

function normalizeUrl(value) {
  if (!value) return "";

  const markdownLink = value.match(/^\[.*?\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) return markdownLink[1];

  if (/^https?:\/\//i.test(value)) return value;

  return "";
}

function linkLabel(url) {
  const lower = url.toLowerCase();

  if (lower.includes("google.com/maps") || lower.includes("maps.app.goo.gl")) {
    return "Apri in Maps";
  }

  if (lower.includes("getyourguide") || lower.includes("gyg.me")) {
    return "Prenotazione";
  }

  return "Apri link";
}

function eventIcon(text) {
  const value = String(text || "").toLowerCase();

  if (/malpensa|muscat|aeroporto|volo|partenza|arrivo.*bangkok/.test(value)) return "✈";
  if (/hotel|rientro/.test(value)) return "▣";
  if (/colazione/.test(value)) return "☕";
  if (/cena|pranzo|ristorante/.test(value)) return "●";
  if (/palazzo|wat |tempio/.test(value)) return "◆";
  if (/crociera|barca/.test(value)) return "≈";
  if (/chinatown|centri commerciali|shopping/.test(value)) return "◇";
  if (/rooftop/.test(value)) return "△";

  return "•";
}

function formatNote(text) {
  let escaped = escapeHtml(text);

  escaped = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  escaped = escaped.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
  );

  return escaped;
}

function extractTime(value) {
  const match = String(value || "").match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : "";
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function setStatus(message, isError = false) {
  const status = $("#status");
  status.textContent = message;
  status.classList.toggle("status--error", isError);
}
