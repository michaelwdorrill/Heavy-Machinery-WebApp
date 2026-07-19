// Thin localStorage wrapper. This is a single-owner personal tool with no
// third-party script on the page, so localStorage (survives tab close,
// avoids re-login every visit) is an acceptable tradeoff over sessionStorage
// — sign out clears everything below.
const KEYS = {
  sessionToken: "hm_session_token",
  email: "hm_email",
  jwt: "hm_jwt",
  jwtExpiresAt: "hm_jwt_expires_at",
  rev: "hm_rev",
  data: "hm_data_v1",
};

export const storage = {
  get sessionToken() {
    return localStorage.getItem(KEYS.sessionToken);
  },
  get email() {
    return localStorage.getItem(KEYS.email);
  },
  saveSession(sessionToken, email) {
    localStorage.setItem(KEYS.sessionToken, sessionToken);
    if (email) localStorage.setItem(KEYS.email, email);
  },
  get jwt() {
    return localStorage.getItem(KEYS.jwt);
  },
  get jwtExpiresAt() {
    const raw = localStorage.getItem(KEYS.jwtExpiresAt);
    return raw ? Number(raw) : 0;
  },
  cacheJwt(jwt, expiresAtMs) {
    localStorage.setItem(KEYS.jwt, jwt);
    localStorage.setItem(KEYS.jwtExpiresAt, String(expiresAtMs));
  },
  get rev() {
    const raw = localStorage.getItem(KEYS.rev);
    return raw ? Number(raw) : 0;
  },
  saveRev(rev) {
    localStorage.setItem(KEYS.rev, String(rev));
  },
  loadCachedData() {
    const raw = localStorage.getItem(KEYS.data);
    return raw ? JSON.parse(raw) : null;
  },
  saveCachedData(data) {
    localStorage.setItem(KEYS.data, JSON.stringify(data));
  },
  clear() {
    for (const key of Object.values(KEYS)) localStorage.removeItem(key);
  },
};
