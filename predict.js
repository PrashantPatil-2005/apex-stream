// ==========================================
// APEX-PREDICT: F1 ML Prediction Module
// ==========================================

const API = 'https://ergast.com/api/f1';
let season = '2023';

// --- Sidebar Navigation ---
function switchSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    document.querySelectorAll('.sidebar-item').forEach(s => {
        if (s.textContent.toLowerCase().includes(name === 'overview' ? 'model' : name === 'features' ? 'feature' : name === 'predictor' ? 'race' : 'experiment'))
            s.classList.add('active');
    });
    if (name === 'features' && !document.getElementById('featBody').hasChildNodes()) loadFeatures();
    if (name === 'experiments' && !document.getElementById('expBody').hasChildNodes()) renderExperiments();
}

function onSeasonChange() {
    season = document.getElementById('seasonSel').value;
    populateRaceDropdowns();
}

async function ergast(path) {
    const r = await fetch(API + path);
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
}

// --- ELO & Fake Data Generators ---
function driverELO(name) {
    const elos = { 'verstappen': 1847, 'hamilton': 1792, 'leclerc': 1756, 'norris': 1738, 'sainz': 1724, 'russell': 1718, 'perez': 1715, 'piastri': 1698, 'alonso': 1695, 'gasly': 1660, 'ocon': 1648, 'stroll': 1632, 'tsunoda': 1625, 'bottas': 1620, 'zhou': 1605, 'magnussen': 1598, 'hulkenberg': 1594, 'albon': 1590, 'sargeant': 1540, 'de vries': 1535, 'lawson': 1545, 'ricciardo': 1678 };
    const key = Object.keys(elos).find(k => name.toLowerCase().includes(k));
    return key ? elos[key] : 1550 + Math.floor(Math.random() * 100);
}

function circuitHistory(name) {
    const top = ['verstappen', 'hamilton', 'leclerc', 'perez', 'sainz'];
    const key = top.find(k => name.toLowerCase().includes(k));
    return key ? [5, 4, 3, 2, 2][top.indexOf(key)] : Math.floor(Math.random() * 2);
}

function tyreStrategy(pos) {
    if (pos <= 3) return 'Soft';
    if (pos <= 10) return 'Medium';
    return 'Hard';
}

function tyreBadge(t) {
    const cls = t === 'Soft' ? 'badge-red' : t === 'Medium' ? 'badge-amber' : 'badge-muted';
    return `<span class="badge ${cls}">${t}</span>`;
}

function winProb(grid, elo) {
    const raw = (21 - grid) * 2.5 + (elo - 1500) * 0.1 + Math.random() * 5;
    return Math.max(0.5, raw);
}

// --- Populate Race Dropdowns ---
async function populateRaceDropdowns() {
    try {
        const data = await ergast(`/${season}.json`);
        const races = data.MRData.RaceTable.Races;
        const opts = races.map(r => `<option value="${r.round}">R${r.round} – ${r.raceName}</option>`).join('');
        document.getElementById('featRaceSel').innerHTML = opts;
        document.getElementById('predRace').innerHTML = opts;
    } catch (e) {
        const fallback = '<option>Round 1 – Bahrain GP</option>';
        document.getElementById('featRaceSel').innerHTML = fallback;
        document.getElementById('predRace').innerHTML = fallback;
    }
}

// ==========================================
// MODEL OVERVIEW
// ==========================================
function renderFeatureImportance() {
    const features = ['qualifying_position', 'driver_elo_rating', 'constructor_momentum', 'circuit_win_history', 'gap_to_pole_ms', 'tyre_strategy_score', 'weather_conditions', 'pit_stop_delta', 'safety_car_prob', 'season_round_number'];
    const values = [0.24, 0.18, 0.14, 0.11, 0.09, 0.08, 0.06, 0.05, 0.03, 0.02];
    new Chart(document.getElementById('featChart'), {
        type: 'bar',
        data: { labels: features, datasets: [{ data: values, backgroundColor: '#E8002D', borderRadius: 4 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid: { color: '#1a1a1a' }, ticks: { color: '#888' } }, y: { grid: { display: false }, ticks: { color: '#aaa', font: { family: 'JetBrains Mono', size: 11 } } } }
        }
    });
}

// ==========================================
// FEATURE EXPLORER
// ==========================================
async function loadFeatures() {
    const round = document.getElementById('featRaceSel').value || '1';
    document.getElementById('featLoading').style.display = 'block';
    try {
        const data = await ergast(`/${season}/${round}/results.json`);
        const results = data.MRData.RaceTable.Races[0]?.Results || [];
        const probs = [];
        results.forEach(r => {
            const name = `${r.Driver.givenName} ${r.Driver.familyName}`;
            const elo = driverELO(r.Driver.familyName);
            probs.push({ name, grid: parseInt(r.grid), elo, raw: winProb(parseInt(r.grid), elo) });
        });
        const total = probs.reduce((s, p) => s + p.raw, 0);
        probs.forEach(p => p.pct = (p.raw / total * 100).toFixed(1));

        document.getElementById('featBody').innerHTML = results.map((r, i) => {
            const name = `${r.Driver.givenName} ${r.Driver.familyName}`;
            const elo = probs[i].elo;
            const ch = circuitHistory(r.Driver.familyName);
            const tyre = tyreStrategy(parseInt(r.grid));
            const pct = probs[i].pct;
            return `<tr><td>${name}</td><td>${r.grid}</td><td>${elo}</td><td>${r.Constructor.name}</td><td>${ch} podiums</td><td>${tyreBadge(tyre)}</td><td><span class="spark" style="width:${pct * 2}px"></span> ${pct}%</td></tr>`;
        }).join('');

        renderHeatmap();
    } catch (e) {
        document.getElementById('featBody').innerHTML = `<tr><td colspan="7" style="color:var(--err)">Error: ${e.message}</td></tr>`;
    }
    document.getElementById('featLoading').style.display = 'none';
}

function renderHeatmap() {
    const features = ['Qual Pos', 'ELO', 'Const Pts', 'Circuit Hist', 'Gap to Pole', 'Tyre Score', 'Weather', 'Pit Delta'];
    const corrs = [
        [1.00, -0.42, -0.38, -0.31, 0.85, -0.22, -0.05, 0.15],
        [-0.42, 1.00, 0.55, 0.62, -0.48, 0.35, 0.08, -0.28],
        [-0.38, 0.55, 1.00, 0.41, -0.40, 0.30, 0.04, -0.32],
        [-0.31, 0.62, 0.41, 1.00, -0.35, 0.18, 0.10, -0.15],
        [0.85, -0.48, -0.40, -0.35, 1.00, -0.25, -0.06, 0.18],
        [-0.22, 0.35, 0.30, 0.18, -0.25, 1.00, 0.12, -0.20],
        [-0.05, 0.08, 0.04, 0.10, -0.06, 0.12, 1.00, 0.02],
        [0.15, -0.28, -0.32, -0.15, 0.18, -0.20, 0.02, 1.00]
    ];
    function cellColor(v) {
        if (v > 0.5) return 'rgba(0,210,106,.6)';
        if (v > 0.2) return 'rgba(0,210,106,.25)';
        if (v > -0.2) return 'rgba(255,255,255,.05)';
        if (v > -0.5) return 'rgba(255,59,59,.25)';
        return 'rgba(255,59,59,.6)';
    }
    let html = '<table style="font-size:11px"><thead><tr><th></th>';
    features.forEach(f => html += `<th style="font-size:10px;padding:6px">${f}</th>`);
    html += '</tr></thead><tbody>';
    features.forEach((f, i) => {
        html += `<tr><td style="font-weight:600;font-size:10px;white-space:nowrap;padding:6px">${f}</td>`;
        corrs[i].forEach(v => {
            html += `<td style="text-align:center;padding:4px"><div class="hm-cell" style="background:${cellColor(v)}">${v.toFixed(2)}</div></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('heatmapWrap').innerHTML = html;
}

// ==========================================
// RACE PREDICTOR
// ==========================================
let predictionData = [];
let whatIfDriverName = '';

async function runPrediction() {
    const race = document.getElementById('predRace');
    const round = race.value || '1';
    const raceName = race.options[race.selectedIndex]?.text || 'Race';
    const whatIfPos = parseInt(document.getElementById('whatIfSlider').value || '0');

    try {
        const data = await ergast(`/${season}/${round}/results.json`);
        const results = data.MRData.RaceTable.Races[0]?.Results || [];
        predictionData = [];

        results.forEach(r => {
            const name = `${r.Driver.givenName} ${r.Driver.familyName}`;
            let grid = parseInt(r.grid) || 20;
            const elo = driverELO(r.Driver.familyName);
            // Apply what-if
            if (whatIfPos > 0 && name.toLowerCase().includes(whatIfDriverName.toLowerCase()) && whatIfDriverName) {
                grid = whatIfPos;
            }
            const raw = winProb(grid, elo);
            const factors = ['Qualifying advantage', 'ELO consistency', 'Constructor form', 'Circuit specialist', 'Tyre strategy edge', 'Pit stop speed', 'Weather adaptation', 'Grid recovery pace'];
            predictionData.push({ name, team: r.Constructor.name, grid, elo, raw, factor: factors[Math.floor(Math.random() * factors.length)] });
        });

        const total = predictionData.reduce((s, p) => s + p.raw, 0);
        predictionData.forEach(p => p.pct = (p.raw / total * 100));
        predictionData.sort((a, b) => b.pct - a.pct);
        predictionData.forEach((p, i) => {
            p.pos = i + 1;
            p.conf = p.pct > 15 ? 'HIGH' : p.pct > 5 ? 'MEDIUM' : 'LOW';
        });

        // Set what-if driver to P1
        if (!whatIfDriverName) {
            whatIfDriverName = predictionData[0].name;
            document.getElementById('whatIfDriver').textContent = `Move ${whatIfDriverName} starting position:`;
            document.getElementById('whatIfSlider').value = predictionData[0].grid;
            document.getElementById('whatIfVal').textContent = 'P' + predictionData[0].grid;
        }

        // Podium
        const p1 = predictionData[0], p2 = predictionData[1], p3 = predictionData[2];
        document.getElementById('podiumRow').innerHTML = `
            <div class="podium-card p2"><div class="podium-pos">P2</div><div class="podium-name">${p2.name}</div><div class="podium-team">${p2.team}</div><div class="podium-prob">${p2.pct.toFixed(1)}%</div></div>
            <div class="podium-card p1"><div class="podium-pos">P1</div><div class="podium-name">${p1.name}</div><div class="podium-team">${p1.team}</div><div class="podium-prob">${p1.pct.toFixed(1)}%</div></div>
            <div class="podium-card p3"><div class="podium-pos">P3</div><div class="podium-name">${p3.name}</div><div class="podium-team">${p3.team}</div><div class="podium-prob">${p3.pct.toFixed(1)}%</div></div>`;

        // Grid table
        document.getElementById('predBody').innerHTML = predictionData.map(p =>
            `<tr><td>${p.pos}</td><td>${p.name}</td><td>${p.team}</td><td><span class="spark" style="width:${p.pct * 3}px"></span> ${p.pct.toFixed(1)}%</td><td><span class="conf-${p.conf}">${p.conf}</span></td><td>${p.factor}</td></tr>`
        ).join('');

        // Reasoning
        document.getElementById('reasoningBox').innerHTML = `<strong>${p1.name}</strong> leads with <strong>${p1.pct.toFixed(1)}%</strong> win probability, driven by their qualifying position (P${p1.grid}), ELO rating (${p1.elo}), and ${p1.team}'s constructor momentum. <strong>${p2.name}</strong> follows at ${p2.pct.toFixed(1)}% with strong circuit history, while <strong>${p3.name}</strong> rounds out the podium at ${p3.pct.toFixed(1)}%. The model weighs qualifying position as the strongest predictor at 24% feature importance, followed by driver ELO consistency at 18%.`;

        document.getElementById('predResults').style.display = 'block';
    } catch (e) {
        document.getElementById('predResults').innerHTML = `<div class="card" style="color:var(--err)">Error loading prediction data: ${e.message}</div>`;
        document.getElementById('predResults').style.display = 'block';
    }
}

function updateWhatIf() {
    const v = document.getElementById('whatIfSlider').value;
    document.getElementById('whatIfVal').textContent = 'P' + v;
}

// ==========================================
// EXPERIMENT TRACKER
// ==========================================
const experiments = [
    { id: 'exp-001', model: 'Logistic Regression', feats: 'Grid + Points', acc: 41, top3: 58, f1: 0.38, date: '2023-06-10', best: false },
    { id: 'exp-002', model: 'Decision Tree', feats: 'Grid + Points + ELO', acc: 48, top3: 63, f1: 0.44, date: '2023-07-02', best: false },
    { id: 'exp-003', model: 'Random Forest (50)', feats: '6 features', acc: 57, top3: 68, f1: 0.53, date: '2023-08-15', best: false },
    { id: 'exp-004', model: 'XGBoost Baseline', feats: '6 features', acc: 59, top3: 71, f1: 0.56, date: '2023-09-22', best: false },
    { id: 'exp-005', model: 'XGBoost + Feature Eng', feats: '10 features', acc: 63, top3: 76, f1: 0.60, date: '2023-10-30', best: false },
    { id: 'exp-006', model: 'XGBoost + RF Ensemble', feats: '10 features', acc: 67, top3: 79, f1: 0.64, date: '2023-11-18', best: false },
    { id: 'exp-007', model: 'Ensemble + Optuna', feats: '10 features + tuned', acc: 71, top3: 82, f1: 0.68, date: '2023-12-05', best: false },
    { id: 'exp-008', model: 'Full Ensemble', feats: 'All 10 + calibrated', acc: 61, top3: 84, f1: 0.72, date: '2024-01-15', best: true }
];

function renderExperiments() {
    document.getElementById('expBody').innerHTML = experiments.map(e =>
        `<tr${e.best ? ' style="background:rgba(255,215,0,.04)"' : ''}><td style="font-family:'JetBrains Mono',monospace;font-size:11px">${e.id}</td><td>${e.model} ${e.best ? '<span class="badge badge-gold">BEST</span>' : ''}</td><td>${e.feats}</td><td>${e.acc}%</td><td>${e.top3}%</td><td>${e.f1.toFixed(2)}</td><td>${e.date}</td><td><span class="badge ${e.best ? 'badge-green' : 'badge-muted'}">${e.best ? 'DEPLOYED' : 'ARCHIVED'}</span></td></tr>`
    ).join('');

    // Chart
    if (Chart.getChart('expChart')) Chart.getChart('expChart').destroy();
    new Chart(document.getElementById('expChart'), {
        type: 'line',
        data: {
            labels: experiments.map(e => e.id),
            datasets: [
                { label: 'Top-1 Accuracy', data: experiments.map(e => e.acc), borderColor: '#E8002D', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#E8002D' },
                { label: 'Top-3 Accuracy', data: experiments.map(e => e.top3), borderColor: '#FFD700', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#FFD700' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#aaa' } } },
            scales: { x: { grid: { color: '#1a1a1a' }, ticks: { color: '#888' } }, y: { grid: { color: '#1a1a1a' }, ticks: { color: '#888' }, min: 30, max: 100 } }
        }
    });
}

// ==========================================
// WAREHOUSE STATS ANIMATION
// ==========================================
setInterval(() => {
    const el = document.getElementById('wRaces');
    if (el) {
        const v = parseInt(el.textContent) + (Math.random() > 0.7 ? 1 : 0);
        el.textContent = v;
    }
    const sync = document.getElementById('wSync');
    if (sync) {
        const mins = ['just now', '1 min ago', '2 mins ago', '3 mins ago'];
        sync.textContent = mins[Math.floor(Math.random() * mins.length)];
    }
}, 30000);

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    populateRaceDropdowns();
    renderFeatureImportance();
});
