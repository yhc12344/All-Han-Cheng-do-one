# 🏃 FIT Dashboard

<p align="center">
  <img src="src/assets/app-icon.svg" alt="FIT Dashboard Icon" width="100" />
</p>

A high-performance, **local-first activity analytics dashboard** designed specifically for Garmin FIT telemetry files. Run it as a premium **Tauri v2 desktop app** or deploy it instantly via **Docker** to self-host.

Built with **Rust, DuckDB, and React** for blazing-fast computations.

---

> [!IMPORTANT]
> Garmin is a registered trademark of Garmin Ltd. This project is an independent, open-source tool and is not affiliated with, endorsed by, sponsored by, or approved by Garmin Ltd.

---

## ✨ Elite Features

*   📊 **Sports Science Models**: Real-time **CTL/ATL/TSB (Form)**, Gabbett's **ACWR (Acute:Chronic Workload)**, Peter Riegel volume-adjusted race projections, and Neuromuscular Speed Reserve profiling.
*   🫁 **Autonomic Readiness Tracker**: Automated waking **Readiness Index (PRI)** based on overnight HRV telemetry and cumulative training fatigue caps.
*   🗺️ **Explored Locations Heatmap**: Premium MapLibre GL density overlays mapping your geographic coordinate clusters (with premium custom themes: Flame, Forest, Electric, Amethyst).
*   📈 **High-Density 15px Grid**: A highly responsive, 365-day GitHub-style contribution grid featuring active streaks, consistency tiers, and daily activity cards.
*   📐 **Biomechanical Diagnostics**: Sub-second stride length tracking, cardiovascular efficiency (meters/beat), and Aerobic Decoupling (Cardiac Drift) detection.
*   ⚡ **Dynamic Training Scheduler**: Weekly calendar schedules loaded with planned workouts, actual FIT data completion rings, and training targets.
*   🛡️ **Smart Runners Filters**: Runner-centric filter chip sets to immediately isolate workouts (Z1–Z5 zones, long runs, Glitched warmups).
*   📂 **Multi-Format Exports**: One-click exports to CSV, JSON, GPX (with HR/cadence/power), or KML.

---

## 🚀 Quick Start

### 1. Prebuilt Desktop App
Grab the installer for Windows, macOS, or Linux from our [Releases page](https://github.com/arpanghosh8453/fit-dashboard/releases).

*Note: For macOS Gatekeeper errors, run `xattr -cr /Applications/FIT\ Dashboard.app` to clear the quarantine flag.*

### 2. Docker Self-Hosted Web App
Start the container instantly:
```bash
cd docker && docker compose up -d
```
Access the dashboard at `http://localhost:8088`. All your activity data is safely stored in `/data/fit-dashboard`.

### 3. Local Development Setup
Ensure you have **Rust 1.70+** and **Node.js 18+** installed.
```bash
npm install                     # Install frontend dependencies
cd src-tauri && cargo run       # Start Rust backend
# In another terminal:
npm run dev                     # Start React Vite frontend
```

---

## 📂 Synchronizing Garmin FIT Files

*   **Option A (Automated PS1 Sync - Recommended)**: Install `garmin-cli` (`cargo install garmin-cli`), log in with `garmin auth login`, and run `./scripts/sync_garmin.ps1`.
*   **Option B (Bulk Account Export)**: Request your account data dump from Garmin's site and import raw FIT files from `DI_CONNECT/DI-Connect-Fitness-Uploaded-Files`.
*   **Option C (Direct Import)**: Drag-and-drop any `.fit`, `.tcx`, or `.gpx` file directly into the dashboard sidebar.

---

## 🛠️ The Tech Stack

*   **Backend**: Rust, Tauri v2, Axum (Web server), `fitparser` decoder.
*   **Database**: Embedded client-side DuckDB analytics engine.
*   **Frontend**: React 18, TypeScript, Vite, ECharts (Telemetry charts), MapLibre GL, Zustand.

Refer to the [Architecture Guide](docs/ARCHITECTURE_GUIDE.md) and [Sports Science Formulas](docs/SPORTS_SCIENCE_FORMULAS.md) in the `docs/` folder for comprehensive documentation.

Licensed under the [GNU Affero General Public License v3.0](LICENSE).
