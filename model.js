// In-memory + localStorage-cached view of the owner's exported data.
// Every table is server-side upserted-by-id (see cloud-sync-spec.md §3.2 —
// there is no tombstone/delete), so merging a new page into a Map keyed by
// id is always a correct, idempotent "replace with latest" — a row only
// ever appears at its current rev.

const TABLE_KEY = {
  sessions: "id",
  completedSets: "id",
  progressionStates: "exerciseId",
  bodyweight: "id",
  exercises: "id",
  workouts: "id",
};

export function emptyStore() {
  return {
    sessions: new Map(),
    completedSets: new Map(),
    progressionStates: new Map(),
    bodyweight: new Map(),
    exercises: new Map(),
    workouts: new Map(),
  };
}

export function storeFromPlain(plain) {
  const store = emptyStore();
  if (!plain) return store;
  mergeInto(store, plain);
  return store;
}

export function mergeInto(store, page) {
  for (const [table, key] of Object.entries(TABLE_KEY)) {
    for (const row of page[table] ?? []) {
      store[table].set(row[key], row);
    }
  }
  return store;
}

export function storeToPlain(store) {
  const plain = {};
  for (const table of Object.keys(TABLE_KEY)) {
    plain[table] = [...store[table].values()];
  }
  return plain;
}

export function sortedSessions(store) {
  return [...store.sessions.values()].sort((a, b) => b.startTimestamp - a.startTimestamp);
}

export function setsForSession(store, sessionId) {
  // `setNumber` resets per exercise, so sorting by it alone interleaves
  // exercises performed in the same session. `timestamp` (when the set was
  // actually logged) is the true workout order and keeps each exercise's
  // sets contiguous; setNumber only breaks ties.
  return [...store.completedSets.values()]
    .filter((s) => s.sessionId === sessionId)
    .sort((a, b) => a.timestamp - b.timestamp || a.setNumber - b.setNumber);
}

/** Exercise ids that appear in at least one completed set, with a display
 *  name, sorted alphabetically — populates the progression picker. */
export function exercisesWithHistory(store) {
  const ids = new Set([...store.completedSets.values()].map((s) => s.exerciseId));
  return [...ids]
    .map((id) => store.exercises.get(id) ?? { id, displayName: id })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** One point per session that touched this exercise: the heaviest working
 *  (non-warmup) set's actual weight, plus its rep count for the tooltip. */
export function progressionSeries(store, exerciseId) {
  const bySession = new Map();
  for (const set of store.completedSets.values()) {
    if (set.exerciseId !== exerciseId || set.isWarmup) continue;
    const existing = bySession.get(set.sessionId);
    if (!existing || set.actualWeightLbs > existing.weightLbs) {
      bySession.set(set.sessionId, {
        weightLbs: set.actualWeightLbs,
        reps: set.actualReps ?? null,
      });
    }
  }
  const points = [];
  for (const [sessionId, best] of bySession) {
    const session = store.sessions.get(sessionId);
    if (!session) continue;
    points.push({
      timestamp: session.startTimestamp,
      weightLbs: best.weightLbs,
      reps: best.reps,
    });
  }
  return points.sort((a, b) => a.timestamp - b.timestamp);
}
