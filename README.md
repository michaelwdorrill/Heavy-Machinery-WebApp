# Heavy Machinery — Web

A read-only web dashboard for the Heavy Machinery Android workout tracker.
Plain HTML/CSS/JS, no build step, deployed via GitHub Pages.

Signs in against the Home Base auth Worker (email + password + TOTP, same
flow as the Android client) and reads workout data from the `heavymachinery`
Worker's `/heavymachinery/export` endpoint. Nothing is written back — the
phone stays the source of truth.

Features:
- Session list with per-exercise set detail
- Per-exercise weight-progression chart
- Export a single session or your full history as JSON
- Export a single exercise's progression as CSV

See `../docs/cloud-sync-spec.md` in the main Heavy Machinery repo for the
platform contract this reads from.
