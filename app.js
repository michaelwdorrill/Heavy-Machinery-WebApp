import { signInEmail, verifyTotp, isSignedIn, signOut, AuthError } from "./auth.js";
import { fetchAllSince, ApiError } from "./api.js";
import { storage } from "./storage.js";
import { storeFromPlain, mergeInto, storeToPlain, sortedSessions, setsForSession, exercisesWithHistory, progressionSeries } from "./model.js";
import { renderProgressionChart } from "./charts.js";
import { downloadJson, downloadCsv } from "./export.js";

const el = (id) => document.getElementById(id);

const views = {
  login: el("login-view"),
  totp: el("totp-view"),
  dashboard: el("dashboard-view"),
};
const accountBar = el("account-bar");
const statusBanner = el("status-banner");

let store = storeFromPlain(storage.loadCachedData());
let selectedSessionId = null;

function showView(name) {
  for (const [key, node] of Object.entries(views)) node.classList.toggle("hidden", key !== name);
  accountBar.classList.toggle("hidden", name !== "dashboard");
}

function showStatus(message, kind = "info") {
  if (!message) {
    statusBanner.classList.add("hidden");
    return;
  }
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${kind}`;
}

function friendlyError(err) {
  if (err instanceof AuthError || err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

// ── Auth flows ──────────────────────────────────────────────────────────────

el("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showStatus("Signing in…");
  try {
    await signInEmail(el("login-email").value, el("login-password").value);
    showStatus(null);
    showView("totp");
  } catch (err) {
    showStatus(friendlyError(err), "error");
  }
});

el("totp-back-btn").addEventListener("click", () => {
  showStatus(null);
  showView("login");
});

el("totp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showStatus("Verifying…");
  try {
    await verifyTotp(el("totp-code").value.trim());
    el("totp-code").value = "";
    showStatus(null);
    await enterDashboard();
  } catch (err) {
    showStatus(friendlyError(err), "error");
  }
});

el("signout-btn").addEventListener("click", async () => {
  await signOut();
  store = storeFromPlain(null);
  selectedSessionId = null;
  showView("login");
});

el("refresh-btn").addEventListener("click", () => loadData({ force: true }));

// ── Dashboard: tabs ───────────────────────────────────────────────────────

for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.addEventListener("click", () => {
    for (const b of document.querySelectorAll(".tab-btn")) b.classList.toggle("active", b === btn);
    for (const panel of document.querySelectorAll(".tab-panel")) {
      panel.classList.toggle("hidden", panel.id !== `tab-${btn.dataset.tab}`);
    }
    if (btn.dataset.tab === "progression") renderProgressionTab();
  });
}

// ── Data loading ────────────────────────────────────────────────────────────

async function loadData({ force = false } = {}) {
  showStatus("Loading your data…");
  try {
    const since = force ? 0 : storage.rev;
    const page = await fetchAllSince(since, (n) => showStatus(`Loading your data… (page ${n})`));
    mergeInto(store, page);
    storage.saveRev(page.rev);
    storage.saveCachedData(storeToPlain(store));
    showStatus(null);
    renderSessionList();
    renderExerciseOptions();
  } catch (err) {
    showStatus(friendlyError(err), "error");
  }
}

async function enterDashboard() {
  el("account-email").textContent = storage.email || "";
  showView("dashboard");
  renderSessionList();
  renderExerciseOptions();
  await loadData();
}

// ── Sessions tab ──────────────────────────────────────────────────────────

function workoutName(workoutId) {
  return store.workouts.get(workoutId)?.name || workoutId;
}

function exerciseName(exerciseId) {
  return store.exercises.get(exerciseId)?.displayName || exerciseId;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(session) {
  if (!session.endTimestamp) return "in progress";
  const minutes = Math.round((session.endTimestamp - session.startTimestamp) / 60000);
  return `${minutes} min`;
}

function renderSessionList() {
  const list = el("session-list");
  const sessions = sortedSessions(store);
  list.replaceChildren();
  for (const session of sessions) {
    const li = document.createElement("li");
    li.className = session.id === selectedSessionId ? "selected" : "";
    li.dataset.sessionId = session.id;
    const date = document.createElement("div");
    date.className = "session-date";
    date.textContent = formatDate(session.startTimestamp);
    const meta = document.createElement("div");
    meta.className = "session-meta";
    meta.textContent = `${workoutName(session.workoutId)} · ${formatDuration(session)}${session.isDeloadSession ? " · deload" : ""}`;
    li.append(date, meta);
    li.addEventListener("click", () => {
      selectedSessionId = session.id;
      renderSessionList();
      renderSessionDetail(session);
    });
    list.appendChild(li);
  }
  if (sessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No synced sessions yet — complete a workout on your phone and sync.";
    list.replaceChildren(empty);
  }
}

function renderSessionDetail(session) {
  const container = el("session-detail");
  const sets = setsForSession(store, session.id);

  container.replaceChildren();
  const header = document.createElement("div");
  header.className = "card-header-row";
  const heading = document.createElement("h2");
  heading.textContent = `${workoutName(session.workoutId)} — ${formatDate(session.startTimestamp)}`;
  const exportBtn = document.createElement("button");
  exportBtn.className = "btn-secondary";
  exportBtn.textContent = "Export session";
  exportBtn.addEventListener("click", () => exportSession(session, sets));
  header.append(heading, exportBtn);
  container.appendChild(header);

  if (session.notes) {
    const notes = document.createElement("p");
    notes.className = "muted";
    notes.textContent = session.notes;
    container.appendChild(notes);
  }

  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th>Exercise</th><th>Set</th><th>Weight</th><th>Reps</th><th>RIR</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  let previousExerciseId = null;
  for (const set of sets) {
    const isGroupStart = set.exerciseId !== previousExerciseId;
    previousExerciseId = set.exerciseId;

    const tr = document.createElement("tr");
    if (isGroupStart) tr.className = "set-group-start";

    const exerciseCell = document.createElement("td");
    exerciseCell.className = set.isWarmup ? "exercise-name warmup-tag" : "exercise-name";
    if (isGroupStart) {
      exerciseCell.textContent = exerciseName(set.exerciseId) + (set.isWarmup ? " (warmup)" : "");
    } else {
      exerciseCell.className += " set-continuation";
      exerciseCell.textContent = set.isWarmup ? "warmup" : "";
    }
    tr.appendChild(exerciseCell);

    const cells = [set.setNumber, formatWeight(set), set.actualReps ?? "—", set.rir ?? "—"];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/** Bodyweight movements log 0 lbs by design — "0 lbs" reads as a data gap,
 *  "BW" reads as intentional. */
function formatWeight(set) {
  const exercise = store.exercises.get(set.exerciseId);
  const isBodyweight = exercise?.barType === "BODYWEIGHT" || exercise?.barType === "BODYWEIGHT_LOADED";
  if (isBodyweight && set.actualWeightLbs === 0) return "BW";
  return `${set.actualWeightLbs} lbs`;
}

function exportSession(session, sets) {
  const stamp = new Date(session.startTimestamp).toISOString().slice(0, 10);
  downloadJson(`heavy-machinery-session-${stamp}.json`, {
    session: { ...session, workoutName: workoutName(session.workoutId) },
    sets: sets.map((s) => ({ ...s, exerciseName: exerciseName(s.exerciseId) })),
  });
}

el("export-all-json-btn").addEventListener("click", () => {
  downloadJson("heavy-machinery-full-export.json", storeToPlain(store));
});

// ── Progression tab ─────────────────────────────────────────────────────────

function renderExerciseOptions() {
  const select = el("exercise-select");
  const previous = select.value;
  const exercises = exercisesWithHistory(store);
  select.replaceChildren(
    ...exercises.map((ex) => {
      const opt = document.createElement("option");
      opt.value = ex.id;
      opt.textContent = ex.displayName;
      return opt;
    }),
  );
  if (exercises.some((ex) => ex.id === previous)) select.value = previous;
}

function renderProgressionTab() {
  const exerciseId = el("exercise-select").value;
  if (!exerciseId) {
    renderProgressionChart(el("progression-chart"), []);
    return;
  }
  renderProgressionChart(el("progression-chart"), progressionSeries(store, exerciseId));
}

el("exercise-select").addEventListener("change", renderProgressionTab);

el("export-progression-csv-btn").addEventListener("click", () => {
  const exerciseId = el("exercise-select").value;
  if (!exerciseId) return;
  const series = progressionSeries(store, exerciseId).map((p) => ({
    date: new Date(p.timestamp).toISOString().slice(0, 10),
    weightLbs: p.weightLbs,
    reps: p.reps ?? "",
  }));
  downloadCsv(`heavy-machinery-progression-${exerciseName(exerciseId)}.csv`, series, ["date", "weightLbs", "reps"]);
});

// ── Boot ──────────────────────────────────────────────────────────────────

if (isSignedIn()) {
  enterDashboard();
} else {
  showView("login");
}
