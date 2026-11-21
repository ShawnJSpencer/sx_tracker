# Daily Bloom

A private, iPad-first daily symptom and medication tracker with built-in analytics and a printable report for doctors.

This repository only contains **app code**. No health data is ever stored here.

## How privacy works

- Everything she logs is saved on the device first, in the browser's IndexedDB storage.
- To sync between iPad and iPhone, the app gzips the data, then **encrypts it on the device** (AES-256-GCM, key derived from a passphrase with PBKDF2-SHA256, 310,000 rounds). Only that ciphertext goes to a **separate private repository** (default `sx_tracker_data`), through the GitHub API.
- GitHub, and anyone who sees the private repo, only sees unreadable ciphertext. Photos are encrypted the same way, one file each.
- The app won't connect to a data repo that is public.
- The service worker caches the app's own files for offline use. It never caches GitHub API traffic.

## One-time setup

1. **Turn on GitHub Pages** for this repo: Settings → Pages → Deploy from branch → `main` / root. The app will be at `https://shawnjspencer.github.io/sx_tracker/`.
2. **Create the data repo:** GitHub → New repository → name it `sx_tracker_data` → **Private** → check "Add a README" so the `main` branch exists.
3. **Create a token:** GitHub → Settings → Developer settings → Fine-grained tokens → Generate.
   - Repository access: **Only select repositories** → `sx_tracker_data`
   - Permissions → Repository → **Contents: Read and write**
   - Pick a long expiration and put a reminder on your calendar to renew it.
4. On the iPad, open the app → ⚙ → **Private sync**. Paste the token, choose a passphrase (a short sentence works well), then tap **Connect & encrypt**.
5. Use **Share → Add to Home Screen** so it opens full-screen like an app.
6. On each additional device, enter the same repo, a token, and the **same passphrase**.

> If the passphrase is lost, the synced copy can't be decrypted. Write it down somewhere safe, and use ⚙ → Backup now and then.

## Using it

- **Log** has dates across the top and symptoms down the left side. The symptom column and the medication rows stay pinned while she scrolls.
  - Today's column is highlighted. When it scrolls out of view, a **Today** tab appears on that side showing how many days away it is. Tap it to jump back.
  - **0–10 scores:** tap a blank cell to open the wheel (0 at 12 o'clock, going clockwise to 10).
  - **Yes/No:** tap to cycle ● yes → – no → blank.
  - Tap a **date** for quick actions, such as "mark all blank yes/no as No".
  - Tap a group name to collapse or expand it.
- **Medications:** tap a day in a medication row and pick the dose. A dose carries forward until it's changed, so a titration only needs an entry on the days the dose changes, and future days can be filled in ahead of time. Loryna follows a 24 active / 4 placebo cycle: set the pack start date by tapping a day and choosing "Start a new pack this day".
- **Insights** includes:
  - Highlights and KPIs
  - Trend lines with medication-change markers and placebo-week shading
  - Medication timelines
  - A six-month calendar heatmap
  - Immune-clue frequency
  - Sun exposure vs. rash
  - Before/after averages around each dose change
  - Sleep vs. fatigue
  - Weekday rhythm
  - Active vs. placebo pill days
  - A correlation matrix
  - Hours slept and weight
  - Logging consistency
- **Labs** keeps results per test, with a trend line and out-of-range flags.
- **Report** creates a printable summary for appointments (Print → Save as PDF).

## Development

It's plain ES modules with no build step. To run it locally: `python3 -m http.server` and open `http://localhost:8000`.
Symptoms and medication defaults are in `js/config.js`. The chart colours were checked for colour-vision deficiency.
