const DB_KEY = "clinic-chart-v1";

const els = {
  micBtn: document.getElementById("micBtn"),
  micLabel: document.getElementById("micLabel"),
  liveTranscript: document.getElementById("liveTranscript"),
  visitForm: document.getElementById("visitForm"),
  visitDate: document.getElementById("visitDate"),
  patientName: document.getElementById("patientName"),
  patientAge: document.getElementById("patientAge"),
  patientSex: document.getElementById("patientSex"),
  diagnosis: document.getElementById("diagnosis"),
  treatment: document.getElementById("treatment"),
  diagnosisList: document.getElementById("diagnosisList"),
  clearForm: document.getElementById("clearForm"),
  formStatus: document.getElementById("formStatus"),
  browseDate: document.getElementById("browseDate"),
  dayHeading: document.getElementById("dayHeading"),
  dayList: document.getElementById("dayList"),
  diagnosisGroups: document.getElementById("diagnosisGroups"),
  patientList: document.getElementById("patientList"),
  patientSearch: document.getElementById("patientSearch"),
  patientDialog: document.getElementById("patientDialog"),
  dialogName: document.getElementById("dialogName"),
  dialogMeta: document.getElementById("dialogMeta"),
  dialogTimeline: document.getElementById("dialogTimeline"),
};

let db = loadDb();
let recognition = null;
let listening = false;
let finalTranscript = "";

function todayISO(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function loadDb() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || { patients: [], visits: [] };
  } catch {
    return { patients: [], visits: [] };
  }
}

function saveDb() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function findPatient(name) {
  const key = normalizeName(name).toLowerCase();
  return db.patients.find((p) => p.name.toLowerCase() === key);
}

function upsertPatient({ name, age, sex }) {
  const existing = findPatient(name);
  if (existing) {
    if (age) existing.age = age;
    if (sex) existing.sex = sex;
    return existing;
  }
  const patient = { id: uid(), name: normalizeName(name), age: age || "", sex: sex || "" };
  db.patients.push(patient);
  return patient;
}

function parseSpokenNote(text) {
  const raw = text.replace(/\s+/g, " ").trim();
  const lower = raw.toLowerCase();
  const out = { name: "", age: "", sex: "", diagnosis: "", treatment: "", date: "" };

  const dateMatch = lower.match(/\bdate\s+(today|tomorrow|yesterday|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+\w+(?:\s+\d{4})?)\b/);
  if (dateMatch) out.date = resolveSpokenDate(dateMatch[1]);
  else if (/\btoday\b/.test(lower)) out.date = todayISO();
  else if (/\byesterday\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    out.date = todayISO(d);
  }

  const nameMatch = raw.match(/\bpatient\s+([a-zA-Z][a-zA-Z .']{1,60}?)(?=,|\.|$|\b(?:age|years|year|female|male|diagnosis|dx|treatment|treated|date)\b)/i);
  if (nameMatch) out.name = nameMatch[1].trim();

  const ageMatch = lower.match(/\b(?:age\s*)?(\d{1,3})\s*(?:years?|yrs?|y\/o|yo)\b/) || lower.match(/\bage\s+(\d{1,3})\b/);
  if (ageMatch) out.age = ageMatch[1];

  if (/\bfemale\b|\bwoman\b|\bgirl\b/.test(lower)) out.sex = "Female";
  else if (/\bmale\b|\bman\b|\bboy\b/.test(lower)) out.sex = "Male";

  const dxMatch = raw.match(/\b(?:diagnosis|dx|diagnosed with)\s*[:\-]?\s*([^.]{3,160}?)(?=\.\s*(?:treatment|treated|date)|$|\btreatment\b|\btreated\b|\bdate\b)/i);
  if (dxMatch) out.diagnosis = cleanClause(dxMatch[1]);

  const rxMatch = raw.match(/\b(?:treatment|treated with|plan)\s*[:\-]?\s*([^.]{3,240}?)(?=\.\s*date|$|\bdate\b)/i);
  if (rxMatch) out.treatment = cleanClause(rxMatch[1]);

  if (!out.name && !out.diagnosis) {
    const parts = raw.split(/[.,]/).map((p) => p.trim()).filter(Boolean);
    if (parts[0]) out.name = parts[0].replace(/^patient\s+/i, "");
    if (parts[1]) out.diagnosis = parts[1];
    if (parts[2]) out.treatment = parts.slice(2).join(". ");
  }

  return out;
}

function cleanClause(s) {
  return s.replace(/^(is|was|of)\s+/i, "").replace(/\s+/g, " ").trim();
}

function resolveSpokenDate(phrase) {
  const p = phrase.toLowerCase().trim();
  if (p === "today") return todayISO();
  if (p === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayISO(d);
  }
  if (p === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return todayISO(d);
  }
  const slash = p.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return todayISO(new Date(year, month - 1, day));
  }
  const named = Date.parse(p.replace(/(\d+)(st|nd|rd|th)/, "$1"));
  if (!Number.isNaN(named)) return todayISO(new Date(named));
  return "";
}

function fillFormFromSpeech(parsed) {
  if (parsed.date) els.visitDate.value = parsed.date;
  if (parsed.name) els.patientName.value = parsed.name;
  if (parsed.age) els.patientAge.value = parsed.age;
  if (parsed.sex) els.patientSex.value = parsed.sex;
  if (parsed.diagnosis) els.diagnosis.value = parsed.diagnosis;
  if (parsed.treatment) els.treatment.value = parsed.treatment;
}

function setupSpeech() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    els.micLabel.textContent = "Voice needs Chrome or Edge";
    els.micBtn.disabled = true;
    return;
  }
  recognition = new Speech();
  recognition.lang = "en-IN";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += `${chunk} `;
      else interim += chunk;
    }
    els.liveTranscript.textContent = (finalTranscript + interim).trim();
  };

  recognition.onend = () => {
    if (listening) {
      try { recognition.start(); } catch (_) { /* already started */ }
    }
  };

  recognition.onerror = () => stopListening(true);
}

function startListening() {
  if (!recognition || listening) return;
  finalTranscript = "";
  els.liveTranscript.textContent = "Listening…";
  listening = true;
  els.micBtn.classList.add("listening");
  els.micBtn.setAttribute("aria-pressed", "true");
  els.micLabel.textContent = "Listening — click to stop";
  recognition.start();
}

function stopListening(fromError = false) {
  if (!recognition) return;
  listening = false;
  els.micBtn.classList.remove("listening");
  els.micBtn.setAttribute("aria-pressed", "false");
  els.micLabel.textContent = "Hold to speak a visit";
  try { recognition.stop(); } catch (_) { /* ignore */ }
  const spoken = (finalTranscript || els.liveTranscript.textContent || "").replace(/^Listening…$/, "").trim();
  if (spoken && !fromError) {
    fillFormFromSpeech(parseSpokenNote(spoken));
    els.formStatus.textContent = "Check the fields, then save.";
  }
}

function visitsForDate(iso) {
  return db.visits
    .filter((v) => v.date === iso)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function patientById(id) {
  return db.patients.find((p) => p.id === id);
}

function visitsForPatient(id) {
  return db.visits
    .filter((v) => v.patientId === id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function uniqueDiagnoses() {
  const map = new Map();
  db.visits.forEach((v) => {
    const key = v.diagnosis.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { label: v.diagnosis.trim(), visits: [] });
    map.get(key).visits.push(v);
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function renderDay() {
  const iso = els.browseDate.value || todayISO();
  els.dayHeading.textContent = formatDate(iso);
  const visits = visitsForDate(iso);
  if (!visits.length) {
    els.dayList.innerHTML = `<p class="empty">No visits recorded for this date.</p>`;
    return;
  }
  els.dayList.innerHTML = visits.map((v) => {
    const p = patientById(v.patientId);
    return `<article class="card">
      <h3><button class="linkish" data-open="${v.patientId}">${escapeHtml(p?.name || "Unknown")}</button></h3>
      <p class="meta">${escapeHtml([p?.age && `${p.age} yrs`, p?.sex].filter(Boolean).join(" · "))}</p>
      <p><strong>Dx:</strong> ${escapeHtml(v.diagnosis)}</p>
      <p><strong>Rx:</strong> ${escapeHtml(v.treatment)}</p>
    </article>`;
  }).join("");
}

function renderDiagnoses() {
  const groups = uniqueDiagnoses();
  if (!groups.length) {
    els.diagnosisGroups.innerHTML = `<p class="empty">Save a visit to start stratifying by diagnosis.</p>`;
    return;
  }
  els.diagnosisGroups.innerHTML = groups.map((g) => {
    const byPatient = new Map();
    g.visits.forEach((v) => {
      const list = byPatient.get(v.patientId) || [];
      list.push(v);
      byPatient.set(v.patientId, list);
    });
    const rows = [...byPatient.entries()].map(([pid, list]) => {
      const p = patientById(pid);
      const latest = list.sort((a, b) => b.date.localeCompare(a.date))[0];
      return `<li>
        <button class="linkish" data-open="${pid}">${escapeHtml(p?.name || "Unknown")}</button>
        — last seen ${escapeHtml(formatDate(latest.date))}: ${escapeHtml(latest.treatment)}
      </li>`;
    }).join("");
    return `<section class="group">
      <h3>${escapeHtml(g.label)} <span class="meta">(${byPatient.size})</span></h3>
      <ul>${rows}</ul>
    </section>`;
  }).join("");
}

function renderPatients() {
  const q = (els.patientSearch.value || "").toLowerCase().trim();
  const rows = db.patients
    .map((p) => ({ p, visits: visitsForPatient(p.id) }))
    .filter(({ p, visits }) => {
      if (!q) return true;
      const hay = `${p.name} ${visits.map((v) => v.diagnosis).join(" ")}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => a.p.name.localeCompare(b.p.name));

  if (!rows.length) {
    els.patientList.innerHTML = `<p class="empty">No matching patients.</p>`;
    return;
  }

  els.patientList.innerHTML = rows.map(({ p, visits }) => {
    const latest = visits[0];
    return `<article class="card">
      <h3><button class="linkish" data-open="${p.id}">${escapeHtml(p.name)}</button></h3>
      <p class="meta">${visits.length} visit${visits.length === 1 ? "" : "s"}${latest ? ` · last ${formatDate(latest.date)}` : ""}</p>
      <p>${latest ? escapeHtml(latest.diagnosis) : ""}</p>
    </article>`;
  }).join("");
}

function refreshDiagnosisList() {
  els.diagnosisList.innerHTML = uniqueDiagnoses()
    .map((g) => `<option value="${escapeAttr(g.label)}"></option>`)
    .join("");
}

function renderAll() {
  renderDay();
  renderDiagnoses();
  renderPatients();
  refreshDiagnosisList();
}

function openPatient(id) {
  const p = patientById(id);
  if (!p) return;
  els.dialogName.textContent = p.name;
  els.dialogMeta.textContent = [p.age && `${p.age} years`, p.sex].filter(Boolean).join(" · ");
  const visits = visitsForPatient(id);
  els.dialogTimeline.innerHTML = visits.length
    ? visits.map((v) => `<li>
        <strong>${escapeHtml(formatDate(v.date))}</strong>
        <div>Dx: ${escapeHtml(v.diagnosis)}</div>
        <div>Rx: ${escapeHtml(v.treatment)}</div>
      </li>`).join("")
    : `<li class="empty">No dated visits yet.</li>`;
  els.patientDialog.showModal();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  document.getElementById("panel-day").classList.toggle("hidden", name !== "day");
  document.getElementById("panel-diagnosis").classList.toggle("hidden", name !== "diagnosis");
  document.getElementById("panel-patients").classList.toggle("hidden", name !== "patients");
}

els.visitDate.value = todayISO();
els.browseDate.value = todayISO();
setupSpeech();
renderAll();

els.micBtn.addEventListener("click", () => {
  if (listening) stopListening();
  else startListening();
});

els.visitForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const patient = upsertPatient({
    name: els.patientName.value,
    age: els.patientAge.value.trim(),
    sex: els.patientSex.value,
  });
  db.visits.push({
    id: uid(),
    patientId: patient.id,
    date: els.visitDate.value,
    diagnosis: els.diagnosis.value.trim(),
    treatment: els.treatment.value.trim(),
    transcript: els.liveTranscript.textContent.trim(),
    createdAt: new Date().toISOString(),
  });
  saveDb();
  els.browseDate.value = els.visitDate.value;
  els.formStatus.textContent = `Saved for ${formatDate(els.visitDate.value)}.`;
  els.visitForm.reset();
  els.visitDate.value = els.browseDate.value;
  els.liveTranscript.textContent = "";
  renderAll();
  setTab("day");
});

els.clearForm.addEventListener("click", () => {
  els.visitForm.reset();
  els.visitDate.value = todayISO();
  els.liveTranscript.textContent = "";
  els.formStatus.textContent = "";
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
});

els.browseDate.addEventListener("change", renderDay);
document.getElementById("todayBtn").addEventListener("click", () => {
  els.browseDate.value = todayISO();
  renderDay();
});
document.getElementById("prevDay").addEventListener("click", () => shiftDay(-1));
document.getElementById("nextDay").addEventListener("click", () => shiftDay(1));

function shiftDay(delta) {
  const d = new Date(`${els.browseDate.value}T00:00:00`);
  d.setDate(d.getDate() + delta);
  els.browseDate.value = todayISO(d);
  renderDay();
}

els.patientSearch.addEventListener("input", renderPatients);

document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open]");
  if (btn) openPatient(btn.dataset.open);
});
