import { API_BASE_URL } from "./config.js";
import { getValidJwt } from "./auth.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function authedFetch(path) {
  let jwt = await getValidJwt();
  let response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (response.status === 401) {
    // Could be a just-expired JWT the safety margin didn't catch — refresh
    // once and retry before giving up.
    jwt = await getValidJwt({ forceRefresh: true });
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body?.error || message;
    } catch {
      // no JSON body
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

const emptyPage = () => ({
  sessions: [],
  completedSets: [],
  progressionStates: [],
  bodyweight: [],
  exercises: [],
  workouts: [],
});

/** Pages through /export?since=<rev> until hasMore is false, merging pages
 *  into flat arrays. `onProgress(pagesFetched)` fires after each page. */
export async function fetchAllSince(since, onProgress) {
  const acc = emptyPage();
  let rev = since;
  let page = 0;
  for (;;) {
    const result = await authedFetch(`/heavymachinery/export?since=${rev}`);
    for (const key of Object.keys(acc)) {
      if (Array.isArray(result[key])) acc[key].push(...result[key]);
    }
    rev = result.rev;
    page += 1;
    onProgress?.(page);
    if (!result.hasMore) break;
  }
  return { rev, ...acc };
}

/** Fetches one session and all of its completed sets, paging via afterSetId
 *  if the session has more sets than fit in one page (rare for this app). */
export async function fetchSessionWithSets(sessionId) {
  let afterSetId;
  const sets = [];
  let session = null;
  for (;;) {
    const query = afterSetId
      ? `sessionId=${encodeURIComponent(sessionId)}&afterSetId=${encodeURIComponent(afterSetId)}`
      : `sessionId=${encodeURIComponent(sessionId)}`;
    const result = await authedFetch(`/heavymachinery/export?${query}`);
    if (result.sessions[0]) session = result.sessions[0];
    sets.push(...result.completedSets);
    if (!result.hasMore) break;
    afterSetId = result.afterSetId;
  }
  return { session, sets };
}
