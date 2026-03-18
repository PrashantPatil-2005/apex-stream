# APEX — F1 Intelligence Platform (Master Build Plan)

> Full specification for building the unified APEX platform covering
> three modules: apex-stream, apex-predict, and apex-engineer.

---

## Overview

APEX is a unified Formula 1 data and intelligence platform covering
three systems in one monorepo:

| Module | Name | Domain |
|---|---|---|
| Module 1 | **apex-stream** | F1 Data Pipeline (ETL) |
| Module 2 | **apex-predict** | Grand Prix Winner Prediction (ML) |
| Module 3 | **apex-engineer** | AI Race Engineer (MCP Agent) |

All three modules share the same PostgreSQL warehouse and the same
F1 dataset. This is a portfolio-grade project that demonstrates
data engineering, machine learning, and AI agent development
in a single unified system.

---

## Design System

```
Theme:            Dark, premium, F1-inspired
Background:       #080808
Surface:          #111111
Card background:  #161616
Border:           #242424
Primary accent:   #E8002D  (F1 red)
Gold accent:      #FFD700  (champion gold)
Success:          #00D26A
Warning:          #FF8C00
Error:            #FF3B3B
Info:             #3B8BFF
Text primary:     #F5F5F5
Text secondary:   #777777
Text muted:       #444444
Font headings:    'Barlow Condensed' (Google Fonts) — bold, uppercase
Font body:        'Inter' (Google Fonts) — regular weight
Code/terminal:    'JetBrains Mono' (Google Fonts)
```

### Layout Rules
- Fixed top navbar (56px height)
- Fixed left sidebar (220px width) for module + section nav
- Main content area fills remaining space
- Consistent 24px padding inside all content areas
- All cards: 8px border radius, 1px border #242424
- No gradients anywhere. Flat surfaces only.
- Thin 1px red top border on active nav items
- Smooth 200ms transitions on all hover and active states

---

## Navbar (top, fixed)

- **Left:** "APEX" logo — Barlow Condensed 28px bold. A in red, PEX in white. Tagline: "F1 Intelligence Platform" in muted 11px
- **Center:** 3 module switcher pills: `[STREAM]` `[PREDICT]` `[ENGINEER]`. Active pill = red background. Clicking switches sidebar + content.
- **Right:** Season selector (2021–2024), Pipeline status badge (IDLE/RUNNING/SUCCESS/FAILED), repo badge: "apex · monorepo · 3 modules"

---

## Left Sidebar (fixed, 220px)

Changes based on active module:

### STREAM Sidebar
```
STREAM
├── Pipeline Runner
├── Data Explorer
├── Schema Viewer
└── Run Logs
```

### PREDICT Sidebar
```
PREDICT
├── Model Overview
├── Feature Explorer
├── Race Predictor
└── Experiment Tracker
```

### ENGINEER Sidebar
```
ENGINEER
├── Race Engineer Chat
├── MCP Tools
├── Strategy Board
└── Scenario Simulator
```

### Sidebar Bottom (always visible)
```
Races loaded:   312
Drivers:        847
Lap records:    4,218,440
Last sync:      2 mins ago
DB size:        2.4 GB
```
Numbers animate/update every 30s to simulate live pipeline.

---

## Module 1 — APEX-STREAM (Data Pipeline)

### Pipeline Runner

**Stepper:** 5 horizontal stages: EXTRACT → VALIDATE → TRANSFORM → LOAD → NOTIFY
- Each shows: name, status icon, duration after completion
- Clicking a stage expands a detail panel

**Two Columns:**
- **Left — Controls:** Run Full Pipeline button, Step-by-Step toggle, Race selector dropdown (Ergast API), Backfill mode with range picker, Config panel (Source, Target, Schedule, Retries, Timeout)
- **Right — Terminal:** Dark terminal (#0a0a0a bg, #00FF41 text, JetBrains Mono 12px). Streams 20+ log lines with 300ms delay. Clear + Copy buttons. Auto-scroll.

**Terminal Log Lines:**
```
[10:42:01] INFO     Starting apex pipeline v1.0.0
[10:42:01] INFO     Target: Round 3 – Australian GP 2023
[10:42:02] INFO     Connecting to Ergast API...
[10:42:03] INFO     Fetched 20 driver results ✓
[10:42:03] INFO     Connecting to FastF1 session cache...
[10:42:04] INFO     Cache miss. Fetching from live stream...
[10:42:05] WARNING  FastF1 rate limit: backing off 2s
[10:42:07] INFO     Session loaded: Australia 2023 Race ✓
[10:42:08] INFO     Extracted 1,247 lap time records ✓
[10:42:08] INFO     Extracted 34 pit stop records ✓
[10:42:08] INFO     Extracted 58 sector time records ✓
[10:42:09] INFO     Running Great Expectations suite (12 checks)
[10:42:09] INFO     ✓ lap_time.milliseconds in [60000, 200000]
[10:42:09] INFO     ✓ result.position not null
[10:42:09] INFO     ✓ driver_code is 3-char string
[10:42:09] INFO     ✓ No duplicate race+driver combinations
[10:42:10] INFO     All 12 expectations passed ✓
[10:42:10] INFO     Normalising lap time formats...
[10:42:10] INFO     Computing gap_to_leader per lap...
[10:42:11] INFO     Flagging safety car laps (laps 12, 13)...
[10:42:11] INFO     Upserting 20 rows → result table
[10:42:11] INFO     Upserting 1,247 rows → lap_time table
[10:42:12] INFO     Upserting 34 rows → pit_stop table
[10:42:12] INFO     0 duplicate records detected ✓
[10:42:12] INFO     Sending Slack notification...
[10:42:13] SUCCESS  Pipeline completed in 11.8s ✓
```

**History Table:** Run ID | Race | Season | Triggered By | Status | Duration | Timestamp (5 entries, mix SUCCESS + 1 FAILED)

### Data Explorer

Fetch real data from `https://ergast.com/api/f1`:

- **Section A — Race Calendar:** Card grid (3/row) from `/{season}.json`
- **Section B — Race Results:** Table from `/{season}/{round}/results.json` with podium highlighting (gold/silver/bronze), sortable, filterable
- **Section C — Lap Times:** Table from `/{season}/{round}/laps.json?limit=100` with driver filter, fastest lap highlighted
- **Section D — Pit Stops:** Table from `/{season}/{round}/pitstops.json` with color-coded durations (<2.5s green, >5s red)
- **Section E — Driver Standings:** Table from `/{season}/driverStandings.json` with progress bars

Show API endpoint below each section. Loading spinners. Error states with retry.

### Schema Viewer

7 table cards: `driver`, `constructor`, `circuit`, `race`, `result`, `lap_time`, `pit_stop`

Each card: table name header (red), columns with type/PK/FK/NN badges, row count, Sample Data toggle, DDL toggle (PostgreSQL CREATE TABLE)

FK Relationships panel below: From Table | Column | References | Type | On Delete

### Run Logs

Filter by level (ALL/INFO/WARNING/ERROR/SUCCESS), search, export .txt. Table: Timestamp | Level | Stage | Message. ~30 pre-filled entries. Summary counts bar.

---

## Module 2 — APEX-PREDICT (ML Prediction)

### Model Overview

**4 Stat Cards:** Model type, Top-1 Accuracy (61%), Top-3 Accuracy (84%), Training data (2010–2022, 312 races)

**Architecture Diagram (HTML/CSS):**
```
[Feature Engineering] → [XGBoost + RF Ensemble] → [Win Probability]
```

**Feature Importance Chart (Chart.js, horizontal bar):**
```
qualifying_position      0.24
driver_elo_rating        0.18
constructor_momentum     0.14
circuit_win_history      0.11
gap_to_pole_ms           0.09
tyre_strategy_score      0.08
weather_conditions       0.06
pit_stop_delta           0.05
safety_car_probability   0.03
season_round_number      0.02
```

**Training Timeline:** Data prep → Feature eng → Baseline → Tuning → Ensemble → Validation → Deployment

### Feature Explorer

Table per race: Driver | Qualifying Pos | ELO Rating | Constructor Pts | Circuit History | Tyre Strategy | Predicted Win %

ELO ratings: fake but consistent per driver (1400–1850 range). Correlation heatmap (HTML table, color-coded cells).

### Race Predictor

- **Race Setup:** Season + Race selectors, "Load Race Context" button
- **Prediction Inputs:** Editable form per driver (Grid, ELO, Constructor Pts, Tyre)
- **Prediction Results:** Podium display (P1 gold/larger, P2, P3), full grid table with Win Prob %, Confidence badge, Key Factor
- **Model Reasoning:** Plain English explanation
- **What If:** Slider to move driver position, "Recalculate" button

### Experiment Tracker

**Experiments Table (8 runs):**
| Run | Model | Val Accuracy | Top-3 Acc |
|---|---|---|---|
| 1 | Logistic Regression | 41% | — |
| 2 | Decision Tree | 48% | — |
| 3 | Random Forest (50) | 57% | — |
| 4 | XGBoost Baseline | 59% | — |
| 5 | XGBoost + Features | 63% | — |
| 6 | XGBoost + RF Ensemble | 67% | — |
| 7 | Ensemble + Optuna | 71% | — |
| 8 | **Full Ensemble (BEST)** | **84%** | **84%** |

**Metric Chart:** Line chart — Top-1 and Top-3 accuracy across runs.

**Registered Models:** v1.2 (Production) + v1.1 (Staging) cards with Promote/Archive buttons.

---

## Module 3 — APEX-ENGINEER (AI Race Engineer)

### Race Engineer Chat

**Two columns:** Chat (60%) + Race Context (40%)

**Chat Interface:**
- User messages: right, red bubble. AI: left, dark card. Tool calls: center, monospace amber card.
- Pre-loaded 3 starter messages demonstrating tool calls
- Real Anthropic API call (claude-sonnet-4-20250514) with system prompt for F1 race engineer persona
- Typing indicator, token streaming

**Race Context Panel (pre-filled):**
```
RACE: Monaco GP 2024 – Lap 34 / 78
OUR DRIVER: Lewis Hamilton (Car 44)
Position: P4 | Gap ahead: 4.2s | Gap behind: 8.7s

TYRE: Medium, 18 laps old, 67% life, 0.8%/lap deg
REC WINDOW: Lap 28–32

WEATHER: Track 38°C, Air 24°C, Dry, 12% rain (lap 45+)

PIT DATA: Last stop Lap 15 (2.4s), Team avg 2.6s

STRATEGY OPTIONS:
A: Stay out → Lap 30 (Hard)
B: Pit now → Lap 19 (Hard)
C: Undercut → Lap 22 (Soft)
```

**Quick Action Buttons:** Request Pit Window | Check Rivals | Weather Update | Tyre Compare

### MCP Tools

8 tool cards (2/row): tool name, description, input/output schema (JSON), "Test Tool" button

| Tool | Input | Output |
|---|---|---|
| `get_tyre_life` | driver_id, race_id | compound, lap_age, life_pct, deg_rate, window |
| `get_gap_to_leader` | driver_id, race_id, lap | gap_seconds, closing_rate, drs_lap, position |
| `get_pit_window` | driver_id, race_id, current_lap | optimal_lap, latest_lap, strategies, undercut_threat |
| `get_weather_forecast` | race_id, lap_range | temps, conditions, rain_prob, wind |
| `get_safety_car_probability` | race_id, current_lap | probability, historical_avg, last_sc, recommendation |
| `get_rival_strategy` | race_id, rival_driver_id | tyre, lap_age, predicted_stop, undercut_viable |
| `get_lap_delta` | driver_id, rival_id, race_id | delta/lap, sectors, drs_impact, overtake_prob |
| `get_race_history` | circuit_id, seasons | avg_stops, strategies, sc_rate, fastest_lap_tyre |

**MCP Architecture:** `[Claude LLM] ←→ [MCP Server] ←→ [F1 Data Tools]`

### Strategy Board

- **Stint Timeline:** Horizontal bars per driver (top 10), colored by compound (Soft=red, Medium=yellow, Hard=white), pit markers
- **Strategy Table:** Driver | Stop 1 | Stop 2 | Compounds | Total Pit Time | Predicted Finish
- **Strategy Cards (3):** Conservative (2-stop M-H-H), Aggressive (1-stop S-H), Opportunistic (SC-triggered). Each with predicted pos, risk badge, pros/cons, "Send to Chat" button

### Scenario Simulator

**Controls:** Lap slider (1–78), Safety car toggle, Rain lap slider, Rival pits toggle, Deg rate multiplier (0.5x–2x)

**Output:** Updated race context, recommended action, impact analysis, narrative explanation. Default scenario pre-run on load.

---

## Technical Requirements

- Single HTML file, all CSS/JS inline, no build step
- Google Fonts: Barlow Condensed, Inter, JetBrains Mono
- Chart.js 4.4 from CDN
- Ergast API via fetch() + async/await
- Anthropic API for chat (claude-sonnet-4-20250514)
- Pure JS tab/module switching, no frameworks
- All tables sortable by column headers
- CSS-only loading spinners
- Error states with retry on all API calls
- 200ms CSS transitions on all interactions
- Forced dark mode
- No placeholder text — real or realistic data everywhere
- Every button functional
- Clean, commented, section-organized code

---

## Quality Bar

This should look and feel like a real internal tool used by a data engineering and ML team at a professional F1 analytics company. The pipeline simulation feels real, the ML predictor is credible, and the AI engineer chat works with real API calls. Switching modules feels like navigating three interconnected systems sharing the same data foundation.
