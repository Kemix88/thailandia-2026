const API_URL = "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQvUgH4bLA_xdMPhLxqDnZkSs33fF3OzD_IbohYjklQEUF4XUJP_oLRG9-dOZTnPeONvwVkpDTlgpO7FCBqFq09Y0D5qBcsUuq83e045_hxhllUmhwhOPXjRBNPcwgHytg9cM9-q2_mQDFG1G6-zONttnnerQfMLDsczbNCK89ZgobYcm_eNdjceUjACy7MhQFhwsLvv2agl6hSq5jWYVWnfrZMTZel6eyj7lIYH0Vm7njsdxH947EbqQNGypJ-h4zbRxKoN0ZjfK4utWP9juz0CsQjrw&lib=MpA1Li4oxEfAacgzF_pFINoUX5nX151GL";

const $ = (selector) => document.querySelector(selector);
let tripData = null;

document.addEventListener("DOMContentLoaded", () => {
  $("#refresh-btn").addEventListener("click", loadItinerary);
  $("#today-btn").addEventListener("click", scrollToToday);
  loadItinerary();
});

async function loadItinerary() {
  setStatus("Caricamento dati...");

  try {
    const response = await fetch(API_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    tripData = await response.json();

    if (tripData.error) {
      throw new Error(tripData.error);
    }

    renderTrip(tripData);
    setStatus(`Ultimo aggiornamento: ${new Date().toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit"
    })}`);
  } catch (error) {
    console.error(error);
    setStatus("Impossibile caricare l'itinerario. Controlla che l'endpoint Apps Script sia pubblico.", true);
  }
}

function renderTrip(data) {
  const trip = data.viaggio || {};
  const days = data.giorni || [];

  $("#trip-dates").textContent = formatTripDates(trip.inizio, trip.fine);
  renderDayNavigation(days);
  renderDays(days);
}

function renderDayNavigation(days) {
  const nav = $("#day-nav");
  nav.innerHTML = "";

  days.forEach((day, index) => {
    if (!day.data) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.target = `day-${index}`;

    const date = parseLocalDate(day.data);

    button.innerHTML = `
      <span class="day-number">${date.getDate()}</span>
      <span class="day-month">${date.toLocaleDateString("it-IT", { month: "short" })}</span>
    `;

    button.addEventListener("click", () => {
      document.getElementById(`day-${index}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    nav.appendChild(button);
  });
}

function renderDays(days) {
  const container = $("#itinerary");
  container.innerHTML = "";

  days.forEach((day, index) => {
    const section = document.createElement("section");
    section.className = "day-section";
    section.id = `day-${index}`;

    const date = day.data ? parseLocalDate(day.data) : null;
    const dateLabel = date
      ? date.toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      : "Data non disponibile";

    const weekday = day.giorno || (
      date ? date.toLocaleDateString("it-IT", { weekday: "long" }) : ""
    );

    section.innerHTML = `
      <div class="day-heading">
        <h2>${escapeHtml(capitalize(weekday))}</h2>
        <span>${escapeHtml(dateLabel)}</span>
      </div>
      <div class="timeline"></div>
    `;

    const timeline = section.querySelector(".timeline");
    const events = day.eventi || [];

    events.forEach(event => {
      timeline.appendChild(createEvent(event));
    });

    container.appendChild(section);
  });

  setupActiveDay();
}

function createEvent(event) {
  const wrapper = document.createElement("article");
  wrapper.className = "event";

  const time = event.ora || "";
  const description = event.descrizione || "";
  const note = event.note || "";
  const link = event.link || "";

  wrapper.innerHTML = `
    <div class="event-time">${escapeHtml(time)}</div>
    <div class="event-body">
      <div class="event-title">${iconFor(description)} ${escapeHtml(description)}</div>
      ${note ? `<div class="event-note">${linkifyText(note)}</div>` : ""}
      ${link && /^https?:\/\//i.test(link)
        ? `<a class="event-link" href="${escapeAttribute(link)}" target="_blank" rel="noopener noreferrer">Apri link</a>`
        : ""}
    </div>
  `;

  return wrapper;
}

function setupActiveDay() {
  const sections = [...document.querySelectorAll(".day-section")];
  const buttons = [...document.querySelectorAll(".day-nav button")];

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    buttons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.target === visible.target.id);
    });
  }, {
    rootMargin: "-80px 0px -55% 0px",
    threshold: [0, 0.2, 0.5]
  });

  sections.forEach(section => observer.observe(section));
}

function scrollToToday() {
  if (!tripData?.giorni) return;

  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");

  const index = tripData.giorni.findIndex(day => day.data === todayKey);

  if (index >= 0) {
    document.getElementById(`day-${index}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function formatTripDates(start, end) {
  if (!start || !end) return "Itinerario";

  const s = parseLocalDate(start);
  const e = parseLocalDate(end);

  const startText = s.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short"
  });

  const endText = e.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  return `${startText} → ${endText}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function iconFor(text) {
  const t = text.toLowerCase();

  if (/malpensa|volo|partenza|muscat|bangkok|aeroporto|arrivo/.test(t)) return "✈️";
  if (/hotel|rientro|check-in|check out/.test(t)) return "🏨";
  if (/colazione/.test(t)) return "☕";
  if (/cena|pranzo|ristorante/.test(t)) return "🍜";
  if (/palazzo|wat |tempio|templi/.test(t)) return "🏯";
  if (/tour|escursione/.test(t)) return "🎟️";
  if (/crociera|barca/.test(t)) return "🚢";
  if (/shopping|centri commerciali|chinatown/.test(t)) return "🛍️";
  if (/rooftop/.test(t)) return "🌇";
  if (/taxi|trasferimento/.test(t)) return "🚕";

  return "📍";
}

function linkifyText(text) {
  const escaped = escapeHtml(text);

  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
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

function setStatus(message, error = false) {
  const element = $("#status");
  element.textContent = message;
  element.classList.toggle("error", error);
}
