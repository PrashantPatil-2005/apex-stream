// ==========================================
// APEX-STREAM: F1 Data Pipeline Application
// ==========================================

const API = 'https://ergast.com/api/f1';
let season = '2023';
let currentRound = '1';
let allResults = [];
let chartInstances = {};

// --- Tab Switching ---
function switchTab(name) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    document.querySelectorAll('.nav-tab').forEach(t => { if (t.textContent.toLowerCase().includes(name === 'explorer' ? 'data' : name)) t.classList.add('active'); });
    if (name === 'explorer' && !document.getElementById('raceGrid').hasChildNodes()) loadCalendar();
    if (name === 'schema' && !document.getElementById('schemaGrid').hasChildNodes()) renderSchema();
    if (name === 'dashboard') loadDashboard();
    if (name === 'logs' && !document.getElementById('logBody').hasChildNodes()) renderLogs();
}

function onSeasonChange() {
    season = document.getElementById('seasonSel').value;
    populateRaceSelect();
    document.getElementById('raceGrid').innerHTML = '';
    document.getElementById('explorerSections').style.display = 'none';
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab.id === 'tab-explorer') loadCalendar();
    if (activeTab.id === 'tab-dashboard') loadDashboard();
}

// --- API Helper ---
async function ergast(path) {
    const r = await fetch(API + path);
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
}

// ==========================================
// PIPELINE RUNNER
// ==========================================
const stages = [
    { id: 'extract', name: 'EXTRACT', icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
    { id: 'validate', name: 'VALIDATE', icon: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' },
    { id: 'transform', name: 'TRANSFORM', icon: '<svg viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' },
    { id: 'load', name: 'LOAD', icon: '<svg viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>' },
    { id: 'notify', name: 'NOTIFY', icon: '<svg viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>' }
];

function initStepper() {
    const el = document.getElementById('stepper');
    el.innerHTML = stages.map((s, i) =>
        `<div class="step" id="step-${s.id}" onclick="toggleStepInfo('${s.id}')">
            <div class="step-icon">${s.icon}</div>
            <div class="step-name">${s.name}</div>
            <div class="step-time" id="time-${s.id}">—</div>
            ${i < stages.length - 1 ? '<span class="step-arrow">→</span>' : ''}
        </div>`
    ).join('');
}

function toggleStepInfo(id) { /* expand detail - simplified */ }

function setStep(id, state, time) {
    const el = document.getElementById('step-' + id);
    el.className = 'step ' + state;
    if (time) document.getElementById('time-' + id).textContent = time;
}

function setGlobalStatus(state) {
    const el = document.getElementById('globalStatus');
    el.className = 'status-badge ' + state;
    el.textContent = state.toUpperCase();
}

const logLines = {
    extract: [
        ['INFO', 'Starting apex-stream pipeline'],
        ['INFO', `Target: Round ${currentRound} – {RACE} ${season}`],
        ['INFO', 'Connecting to Ergast API...'],
        ['INFO', 'Fetched 20 driver results ✓'],
        ['INFO', 'Connecting to FastF1 cache...'],
        ['INFO', `Loading session: {RACE} ${season} Race`],
        ['INFO', 'Extracted 1,240 lap time records ✓'],
        ['INFO', 'Extracted 34 pit stop records ✓']
    ],
    validate: [
        ['INFO', 'Running Great Expectations suite...'],
        ['INFO', 'Validating: lap_time.milliseconds range'],
        ['INFO', 'Validating: result.position not null'],
        ['INFO', 'Validating: driver_code format (3 chars)'],
        ['INFO', 'All 12 expectations passed ✓']
    ],
    transform: [
        ['INFO', 'Transforming: normalising lap times'],
        ['INFO', 'Transforming: computing gap to leader'],
        ['INFO', 'Transforming: flagging safety car laps']
    ],
    load: [
        ['INFO', 'Upserting results to race table...'],
        ['INFO', 'Upserting 1,240 rows to lap_time table...'],
        ['INFO', 'Upserting 34 rows to pit_stop table...'],
        ['INFO', 'Load complete. 0 duplicates found ✓']
    ],
    notify: [
        ['INFO', 'Sending Slack notification...'],
        ['SUCCESS', 'Pipeline completed in {DURATION}s ✓']
    ]
};

function clearLog() { document.getElementById('logTerminal').innerHTML = ''; }

function appendLog(level, msg) {
    const t = document.getElementById('logTerminal');
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const cls = level === 'WARNING' ? 'log-warn' : level === 'ERROR' ? 'log-err' : level === 'SUCCESS' ? 'log-success' : '';
    t.innerHTML += `<div class="${cls}">[${ts}] ${level.padEnd(8)} ${msg}</div>`;
    t.scrollTop = t.scrollHeight;
}

async function runPipeline() {
    const btn = document.getElementById('btnRunPipeline');
    btn.disabled = true;
    setGlobalStatus('running');
    stages.forEach(s => setStep(s.id, '', '—'));
    clearLog();

    const raceEl = document.getElementById('raceSelect');
    const raceName = raceEl.options[raceEl.selectedIndex]?.text || 'Bahrain GP';
    const stageByStage = document.getElementById('togStage').classList.contains('on');
    const startTime = Date.now();

    for (const stage of stages) {
        setStep(stage.id, 'running');
        const stageStart = Date.now();
        const lines = logLines[stage.id] || [];

        for (const [level, rawMsg] of lines) {
            const msg = rawMsg.replace('{RACE}', raceName).replace('{DURATION}', ((Date.now() - startTime) / 1000).toFixed(1));
            appendLog(level, msg);
            await new Promise(r => setTimeout(r, 250 + Math.random() * 200));
        }

        const dur = ((Date.now() - stageStart) / 1000).toFixed(1) + 's';
        setStep(stage.id, 'success', dur);

        if (stageByStage && stage.id !== 'notify') {
            appendLog('INFO', 'Waiting for user to proceed...');
            await new Promise(r => { window._nextStage = r; });
        }
    }

    setGlobalStatus('success');
    btn.disabled = false;
    addHistoryRun(raceName, true, ((Date.now() - startTime) / 1000).toFixed(1));
    addLogEntry('SUCCESS', 'notify', `Pipeline completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

function populateRaceSelect() {
    const races = { '2024': ['Bahrain GP','Saudi Arabian GP','Australian GP','Japanese GP','Chinese GP','Miami GP','Emilia Romagna GP','Monaco GP','Canadian GP','Spanish GP'], '2023': ['Bahrain GP','Saudi Arabian GP','Australian GP','Azerbaijan GP','Miami GP','Monaco GP','Spanish GP','Canadian GP','Austrian GP','British GP'], '2022': ['Bahrain GP','Saudi Arabian GP','Australian GP','Emilia Romagna GP','Miami GP','Spanish GP','Monaco GP','Azerbaijan GP','Canadian GP','British GP'], '2021': ['Bahrain GP','Emilia Romagna GP','Portuguese GP','Spanish GP','Monaco GP','Azerbaijan GP','French GP','Styrian GP','Austrian GP','British GP'] };
    const sel = document.getElementById('raceSelect');
    const bf1 = document.getElementById('bfStart');
    const bf2 = document.getElementById('bfEnd');
    sel.innerHTML = ''; bf1.innerHTML = ''; bf2.innerHTML = '';
    (races[season] || races['2023']).forEach((r, i) => {
        const o = `<option value="${i + 1}">Round ${i + 1} – ${r}</option>`;
        sel.innerHTML += o; bf1.innerHTML += o; bf2.innerHTML += o;
    });
}

function toggleBackfill() {
    const t = document.getElementById('togBackfill');
    t.classList.toggle('on');
    document.getElementById('backfillPanel').style.display = t.classList.contains('on') ? 'block' : 'none';
}

// History table
const historyRuns = [
    { id: 'run-0047', race: 'British GP', season: '2023', status: 'SUCCESS', dur: '9.8s', ts: '2023-07-09 18:12:44' },
    { id: 'run-0046', race: 'Austrian GP', season: '2023', status: 'SUCCESS', dur: '11.2s', ts: '2023-07-02 18:05:31' },
    { id: 'run-0045', race: 'Canadian GP', season: '2023', status: 'FAILED', dur: '4.1s', ts: '2023-06-18 18:01:12' },
    { id: 'run-0044', race: 'Spanish GP', season: '2023', status: 'SUCCESS', dur: '10.5s', ts: '2023-06-04 18:08:55' },
    { id: 'run-0043', race: 'Monaco GP', season: '2023', status: 'SUCCESS', dur: '8.7s', ts: '2023-05-28 18:03:22' }
];

function renderHistory() {
    document.getElementById('historyBody').innerHTML = historyRuns.map(r =>
        `<tr><td>${r.id}</td><td>${r.race}</td><td>${r.season}</td><td><span class="badge ${r.status === 'SUCCESS' ? 'badge-success' : 'badge-fail'}">${r.status}</span></td><td>${r.dur}</td><td>${r.ts}</td></tr>`
    ).join('');
}

function addHistoryRun(race, success, dur) {
    const id = 'run-' + String(historyRuns.length + 48).padStart(4, '0');
    historyRuns.unshift({ id, race, season, status: success ? 'SUCCESS' : 'FAILED', dur: dur + 's', ts: new Date().toISOString().replace('T', ' ').substring(0, 19) });
    if (historyRuns.length > 5) historyRuns.pop();
    renderHistory();
}

// ==========================================
// DATA EXPLORER
// ==========================================
async function loadCalendar() {
    const grid = document.getElementById('raceGrid');
    const load = document.getElementById('calendarLoading');
    grid.innerHTML = ''; load.style.display = 'block';
    try {
        const data = await ergast(`/${season}.json`);
        const races = data.MRData.RaceTable.Races;
        load.style.display = 'none';
        races.forEach(r => {
            grid.innerHTML += `<div class="race-card">
                <span class="round-badge">R${r.round}</span>
                <h4>${r.raceName}</h4>
                <p>${r.Circuit.circuitName}</p>
                <p>${r.Circuit.Location.country}</p>
                <p style="color:var(--t1);margin-top:4px">${r.date}</p>
                <button class="btn btn-outline" onclick="loadRaceData('${r.round}','${r.raceName.replace(/'/g,"\\'")}')">View Results</button>
            </div>`;
        });
    } catch (e) { load.innerHTML = `<p style="color:var(--err)">Failed to load calendar: ${e.message}</p>`; }
}

async function loadRaceData(round, name) {
    currentRound = round;
    document.getElementById('explorerSections').style.display = 'block';
    document.getElementById('resultsInfo').textContent = `Loaded: Round ${round} – ${name}`;
    document.getElementById('resultsUrl').textContent = `${API}/${season}/${round}/results.json`;
    document.getElementById('pitsUrl').textContent = `${API}/${season}/${round}/pitstops.json`;
    loadResults(round); loadStandings(); loadPitStops(round);
}

async function loadResults(round) {
    const thead = document.getElementById('resultsThead');
    const tbody = document.getElementById('resultsTbody');
    thead.innerHTML = '<tr><th>Pos</th><th>Driver</th><th>Constructor</th><th>Grid</th><th>Points</th><th>Status</th><th>Gap</th></tr>';
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>';
    try {
        const d = await ergast(`/${season}/${round}/results.json`);
        allResults = d.MRData.RaceTable.Races[0]?.Results || [];
        renderResults(allResults);
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--err)">Error: ${e.message}</td></tr>`; }
}

function renderResults(results) {
    const tbody = document.getElementById('resultsTbody');
    tbody.innerHTML = results.map((r, i) => {
        const podium = i === 0 ? 'podium-1' : i === 1 ? 'podium-2' : i === 2 ? 'podium-3' : '';
        const statusCls = r.status === 'Finished' ? 'badge-success' : r.status.includes('+') ? 'badge-warn' : 'badge-fail';
        const gap = r.Time ? r.Time.time : r.status;
        return `<tr class="${podium}"><td>${r.position}</td><td>${r.Driver.givenName} ${r.Driver.familyName}</td><td>${r.Constructor.name}</td><td>${r.grid}</td><td>${r.points}</td><td><span class="badge ${statusCls}">${r.status}</span></td><td>${gap}</td></tr>`;
    }).join('');
}

function filterResults() {
    const q = document.getElementById('resultsFilter').value.toLowerCase();
    const filtered = allResults.filter(r => `${r.Driver.givenName} ${r.Driver.familyName} ${r.Constructor.name}`.toLowerCase().includes(q));
    renderResults(filtered);
}

async function loadStandings() {
    const thead = document.getElementById('standingsThead');
    const tbody = document.getElementById('standingsTbody');
    document.getElementById('standingsUrl').textContent = `${API}/${season}/driverStandings.json`;
    thead.innerHTML = '<tr><th>Pos</th><th>Driver</th><th>Nationality</th><th>Constructor</th><th>Points</th><th>Wins</th><th>Progress</th></tr>';
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>';
    try {
        const d = await ergast(`/${season}/driverStandings.json`);
        const list = d.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
        const maxPts = list.length ? parseFloat(list[0].points) : 1;
        tbody.innerHTML = list.map(s => {
            const pct = (parseFloat(s.points) / maxPts * 100).toFixed(0);
            return `<tr><td>${s.position}</td><td>${s.Driver.givenName} ${s.Driver.familyName}</td><td>${s.Driver.nationality}</td><td>${s.Constructors[0]?.name || ''}</td><td>${s.points}</td><td>${s.wins}</td><td><div class="pbar"><div class="pbar-fill" style="width:${pct}%"></div></div></td></tr>`;
        }).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--err)">Error: ${e.message}</td></tr>`; }
}

async function loadPitStops(round) {
    const thead = document.getElementById('pitsThead');
    const tbody = document.getElementById('pitsTbody');
    thead.innerHTML = '<tr><th>Stop #</th><th>Driver</th><th>Lap</th><th>Duration</th></tr>';
    tbody.innerHTML = '<tr><td colspan="4" class="loading"><div class="spinner"></div></td></tr>';
    try {
        const d = await ergast(`/${season}/${round}/pitstops.json`);
        const stops = d.MRData.RaceTable.Races[0]?.PitStops || [];
        stops.sort((a, b) => parseFloat(a.duration) - parseFloat(b.duration));
        tbody.innerHTML = stops.map(s => {
            const dur = parseFloat(s.duration);
            const cls = dur < 25 ? 'color:var(--green)' : dur > 50 ? 'color:var(--err)' : '';
            return `<tr><td>${s.stop}</td><td>${s.driverId}</td><td>${s.lap}</td><td style="${cls}">${s.duration}s</td></tr>`;
        }).join('');
    } catch (e) { tbody.innerHTML = `<tr><td colspan="4" style="color:var(--err)">Error: ${e.message}</td></tr>`; }
}

// ==========================================
// SCHEMA VIEWER
// ==========================================
const schema = {
    driver: { cols: [['driver_id','INT','PK','NN'],['driver_ref','VARCHAR','','NN'],['number','INT','',''],['code','VARCHAR(3)','','NN'],['given_name','VARCHAR','','NN'],['family_name','VARCHAR','','NN'],['dob','DATE','',''],['nationality','VARCHAR','','']], rows: '~850', ddl: `CREATE TABLE driver (\n  driver_id   SERIAL PRIMARY KEY,\n  driver_ref  VARCHAR(64) NOT NULL UNIQUE,\n  number      INTEGER,\n  code        VARCHAR(3) NOT NULL,\n  given_name  VARCHAR(128) NOT NULL,\n  family_name VARCHAR(128) NOT NULL,\n  dob         DATE,\n  nationality VARCHAR(64)\n);\nCREATE INDEX idx_driver_code ON driver(code);`, sample: [['1','max_verstappen','1','VER','Max','Verstappen','1997-09-30','Dutch'],['2','perez','11','PER','Sergio','Perez','1990-01-26','Mexican'],['3','hamilton','44','HAM','Lewis','Hamilton','1985-01-07','British']] },
    constructor: { cols: [['constructor_id','INT','PK','NN'],['constructor_ref','VARCHAR','','NN'],['name','VARCHAR','','NN'],['nationality','VARCHAR','','']], rows: '~210', ddl: `CREATE TABLE constructor (\n  constructor_id  SERIAL PRIMARY KEY,\n  constructor_ref VARCHAR(64) NOT NULL UNIQUE,\n  name            VARCHAR(128) NOT NULL,\n  nationality     VARCHAR(64)\n);`, sample: [['1','red_bull','Red Bull','Austrian'],['2','mercedes','Mercedes','German'],['3','ferrari','Ferrari','Italian']] },
    circuit: { cols: [['circuit_id','INT','PK','NN'],['circuit_ref','VARCHAR','','NN'],['name','VARCHAR','','NN'],['location','VARCHAR','',''],['country','VARCHAR','','NN']], rows: '~77', ddl: `CREATE TABLE circuit (\n  circuit_id  SERIAL PRIMARY KEY,\n  circuit_ref VARCHAR(64) NOT NULL UNIQUE,\n  name        VARCHAR(256) NOT NULL,\n  location    VARCHAR(128),\n  country     VARCHAR(64) NOT NULL\n);`, sample: [['1','bahrain','Bahrain Intl Circuit','Sakhir','Bahrain'],['2','jeddah','Jeddah Corniche','Jeddah','Saudi Arabia'],['3','albert_park','Albert Park','Melbourne','Australia']] },
    race: { cols: [['race_id','INT','PK','NN'],['year','INT','','NN'],['round','INT','','NN'],['circuit_id','INT','FK','NN'],['name','VARCHAR','','NN'],['date','DATE','','NN']], rows: '~1100', ddl: `CREATE TABLE race (\n  race_id    SERIAL PRIMARY KEY,\n  year       INTEGER NOT NULL,\n  round      INTEGER NOT NULL,\n  circuit_id INTEGER NOT NULL REFERENCES circuit(circuit_id) ON DELETE CASCADE,\n  name       VARCHAR(256) NOT NULL,\n  date       DATE NOT NULL\n);\nCREATE INDEX idx_race_year ON race(year);`, sample: [['1','2023','1','1','Bahrain GP','2023-03-05'],['2','2023','2','2','Saudi Arabian GP','2023-03-19'],['3','2023','3','3','Australian GP','2023-04-02']] },
    result: { cols: [['result_id','INT','PK','NN'],['race_id','INT','FK','NN'],['driver_id','INT','FK','NN'],['constructor_id','INT','FK','NN'],['grid','INT','','NN'],['position','INT','',''],['points','FLOAT','','NN'],['laps','INT','','NN'],['status','VARCHAR','','']], rows: '~26000', ddl: `CREATE TABLE result (\n  result_id      SERIAL PRIMARY KEY,\n  race_id        INTEGER NOT NULL REFERENCES race(race_id),\n  driver_id      INTEGER NOT NULL REFERENCES driver(driver_id),\n  constructor_id INTEGER NOT NULL REFERENCES constructor(constructor_id),\n  grid           INTEGER NOT NULL,\n  position       INTEGER,\n  points         FLOAT NOT NULL DEFAULT 0,\n  laps           INTEGER NOT NULL,\n  status         VARCHAR(64)\n);\nCREATE INDEX idx_result_race ON result(race_id);`, sample: [['1','1','1','1','1','1','25','57','Finished'],['2','1','2','1','2','2','18','57','Finished'],['3','1','3','2','5','3','15','57','Finished']] },
    lap_time: { cols: [['race_id','INT','FK','NN'],['driver_id','INT','FK','NN'],['lap','INT','PK','NN'],['position','INT','',''],['time','VARCHAR','','NN'],['milliseconds','INT','','']], rows: '~540000', ddl: `CREATE TABLE lap_time (\n  race_id      INTEGER NOT NULL REFERENCES race(race_id),\n  driver_id    INTEGER NOT NULL REFERENCES driver(driver_id),\n  lap          INTEGER NOT NULL,\n  position     INTEGER,\n  time         VARCHAR(16) NOT NULL,\n  milliseconds INTEGER,\n  PRIMARY KEY (race_id, driver_id, lap)\n);`, sample: [['1','1','1','1','1:34.523','94523'],['1','1','2','1','1:33.812','93812'],['1','2','1','2','1:34.891','94891']] },
    pit_stop: { cols: [['race_id','INT','FK','NN'],['driver_id','INT','FK','NN'],['stop','INT','PK','NN'],['lap','INT','','NN'],['time','TIME','',''],['duration','VARCHAR','','']], rows: '~9800', ddl: `CREATE TABLE pit_stop (\n  race_id   INTEGER NOT NULL REFERENCES race(race_id),\n  driver_id INTEGER NOT NULL REFERENCES driver(driver_id),\n  stop      INTEGER NOT NULL,\n  lap       INTEGER NOT NULL,\n  time      TIME,\n  duration  VARCHAR(16),\n  PRIMARY KEY (race_id, driver_id, stop)\n);`, sample: [['1','1','1','16','17:42:31','23.4'],['1','1','2','33','18:12:05','24.1'],['1','2','1','15','17:41:55','22.8']] }
};

function renderSchema() {
    const grid = document.getElementById('schemaGrid');
    grid.innerHTML = '';
    for (const [tbl, info] of Object.entries(schema)) {
        const colsHtml = info.cols.map(c => {
            const badges = (c[2] === 'PK' ? '<span class="pk-badge">PK</span>' : c[2] === 'FK' ? '<span class="fk-badge">FK</span>' : '') + (c[3] === 'NN' ? ' <span class="nn-dot" title="NOT NULL"></span>' : '');
            return `<div class="db-col"><div class="db-col-left">${badges} ${c[0]}</div><span class="type-badge">${c[1]}</span></div>`;
        }).join('');
        const sampleHdr = info.cols.map(c => `<th>${c[0]}</th>`).join('');
        const sampleRows = info.sample.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
        grid.innerHTML += `<div class="db-card">
            <div class="db-card-head"><span>${tbl}</span><span class="row-est">${info.rows}</span></div>
            ${colsHtml}
            <div style="padding:8px 16px;display:flex;gap:8px">
                <button class="btn btn-outline" style="flex:1;font-size:11px;padding:4px" onclick="this.parentElement.nextElementSibling.style.display=this.parentElement.nextElementSibling.style.display==='none'?'block':'none'">Sample Data</button>
                <button class="btn btn-outline" style="flex:1;font-size:11px;padding:4px" onclick="this.parentElement.nextElementSibling.nextElementSibling.style.display=this.parentElement.nextElementSibling.nextElementSibling.style.display==='none'?'block':'none'">SQL DDL</button>
            </div>
            <div class="sample-panel"><table><thead><tr>${sampleHdr}</tr></thead><tbody>${sampleRows}</tbody></table></div>
            <div class="ddl-box">${info.ddl}</div>
        </div>`;
    }
}

// ==========================================
// DASHBOARD
// ==========================================
async function loadDashboard() {
    const s = season;
    document.getElementById('champTitle').textContent = s;
    try {
        // Stat cards
        const [raceData, standData, constData] = await Promise.all([
            ergast(`/${s}.json`), ergast(`/${s}/driverStandings.json`), ergast(`/${s}/constructorStandings.json`)
        ]);
        const races = raceData.MRData.RaceTable.Races;
        const drivers = standData.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
        const constList = constData.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || [];
        document.getElementById('statRow').innerHTML = `
            <div class="stat-card"><div class="stat-val">${races.length}</div><div class="stat-label">Races</div></div>
            <div class="stat-card"><div class="stat-val">${drivers.length}</div><div class="stat-label">Drivers</div></div>
            <div class="stat-card"><div class="stat-val">${constList.length}</div><div class="stat-label">Constructors</div></div>
            <div class="stat-card"><div class="stat-val" style="font-size:18px">${drivers[0]?.Driver?.familyName||'—'}</div><div class="stat-label">Champion</div></div>`;

        // Populate scatter dropdown
        const dd = document.getElementById('scatterRound');
        dd.innerHTML = races.slice(0, 10).map(r => `<option value="${r.round}">R${r.round}</option>`).join('');

        // Championship chart
        destroyChart('chartChamp');
        const top5 = drivers.slice(0, 5);
        const colors = ['#E8002D', '#00D26A', '#4DA6FF', '#FFD700', '#FF8C00'];
        const datasets = await Promise.all(top5.map(async (d, i) => {
            const pts = []; let cumulative = 0;
            for (let r = 1; r <= Math.min(races.length, 15); r++) {
                try {
                    const rd = await ergast(`/${s}/${r}/results.json`);
                    const res = rd.MRData.RaceTable.Races[0]?.Results?.find(x => x.Driver.driverId === d.Driver.driverId);
                    cumulative += res ? parseFloat(res.points) : 0;
                } catch { }
                pts.push(cumulative);
            }
            return { label: d.Driver.familyName, data: pts, borderColor: colors[i], backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 };
        }));
        new Chart(document.getElementById('chartChamp'), {
            type: 'line', data: { labels: races.slice(0, 15).map((r, i) => `R${i + 1}`), datasets },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#aaa' } } }, scales: { x: { grid: { color: '#1a1a1a' }, ticks: { color: '#888' } }, y: { grid: { color: '#1a1a1a' }, ticks: { color: '#888' } } } }
        });

        // Constructor chart
        destroyChart('chartConst');
        new Chart(document.getElementById('chartConst'), {
            type: 'bar', data: { labels: constList.map(c => c.Constructor.name), datasets: [{ data: constList.map(c => parseFloat(c.points)), backgroundColor: constList.map((c, i) => i === 0 ? '#FFD700' : '#E8002D'), borderRadius: 4 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#1a1a1a' }, ticks: { color: '#888' } }, y: { grid: { display: false }, ticks: { color: '#aaa' } } } }
        });

        loadScatter();
    } catch (e) { console.error('Dashboard error:', e); }
}

async function loadScatter() {
    const round = document.getElementById('scatterRound').value || '1';
    document.getElementById('scatterTitle').textContent = `Round ${round}`;
    destroyChart('chartScatter');
    try {
        const d = await ergast(`/${season}/${round}/results.json`);
        const results = d.MRData.RaceTable.Races[0]?.Results || [];
        const pts = results.filter(r => r.position && r.grid !== '0').map(r => {
            const grid = parseInt(r.grid), fin = parseInt(r.position), diff = grid - fin;
            return { x: grid, y: fin, label: r.Driver.code, color: diff >= 3 ? '#00D26A' : diff <= -3 ? '#FF3B3B' : '#888' };
        });
        new Chart(document.getElementById('chartScatter'), {
            type: 'scatter', data: { datasets: [{ data: pts, backgroundColor: pts.map(p => p.color), pointRadius: 6 }, { data: Array.from({ length: 20 }, (_, i) => ({ x: i + 1, y: i + 1 })), borderColor: '#333', borderDash: [5, 5], showLine: true, pointRadius: 0, borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw.label ? `${ctx.raw.label}: Grid ${ctx.raw.x} → P${ctx.raw.y}` : '' } } }, scales: { x: { title: { display: true, text: 'Grid', color: '#888' }, grid: { color: '#1a1a1a' }, ticks: { color: '#888' }, min: 0, max: 21 }, y: { title: { display: true, text: 'Finish', color: '#888' }, grid: { color: '#1a1a1a' }, ticks: { color: '#888' }, min: 0, max: 21, reverse: false } } }
        });
    } catch (e) { console.error('Scatter error:', e); }
}

function destroyChart(id) { if (Chart.getChart(id)) Chart.getChart(id).destroy(); }

// ==========================================
// LOGS
// ==========================================
const logData = [
    { ts: '2023-07-09 18:12:44', level: 'INFO', stage: 'extract', msg: 'Connecting to Ergast API...' },
    { ts: '2023-07-09 18:12:45', level: 'INFO', stage: 'extract', msg: 'Fetched 20 driver results' },
    { ts: '2023-07-09 18:12:46', level: 'WARNING', stage: 'extract', msg: 'FastF1 cache miss, fetching live data' },
    { ts: '2023-07-09 18:12:48', level: 'INFO', stage: 'extract', msg: 'Extracted 1,380 lap time records' },
    { ts: '2023-07-09 18:12:49', level: 'INFO', stage: 'validate', msg: 'Running Great Expectations suite' },
    { ts: '2023-07-09 18:12:50', level: 'INFO', stage: 'validate', msg: 'All 12 expectations passed' },
    { ts: '2023-07-09 18:12:51', level: 'INFO', stage: 'transform', msg: 'Normalising lap times to milliseconds' },
    { ts: '2023-07-09 18:12:52', level: 'INFO', stage: 'load', msg: 'Upserting 1,380 rows to lap_time table' },
    { ts: '2023-07-09 18:12:53', level: 'SUCCESS', stage: 'notify', msg: 'Pipeline completed in 9.8s' },
    { ts: '2023-07-02 18:05:31', level: 'INFO', stage: 'extract', msg: 'Starting pipeline for Austrian GP' },
    { ts: '2023-07-02 18:05:33', level: 'WARNING', stage: 'extract', msg: 'Rate limit approaching, slowing requests' },
    { ts: '2023-07-02 18:05:35', level: 'INFO', stage: 'extract', msg: 'Extracted 1,190 lap time records' },
    { ts: '2023-07-02 18:05:37', level: 'INFO', stage: 'validate', msg: 'All 12 expectations passed' },
    { ts: '2023-07-02 18:05:40', level: 'INFO', stage: 'transform', msg: 'Computing gap to leader' },
    { ts: '2023-07-02 18:05:42', level: 'INFO', stage: 'load', msg: 'Upserting results to race table' },
    { ts: '2023-07-02 18:05:43', level: 'SUCCESS', stage: 'notify', msg: 'Pipeline completed in 11.2s' },
    { ts: '2023-06-18 18:01:12', level: 'INFO', stage: 'extract', msg: 'Starting pipeline for Canadian GP' },
    { ts: '2023-06-18 18:01:14', level: 'ERROR', stage: 'extract', msg: 'Ergast API timeout, retrying (1/3)' },
    { ts: '2023-06-18 18:01:18', level: 'ERROR', stage: 'extract', msg: 'Ergast API timeout, retrying (2/3)' },
    { ts: '2023-06-18 18:01:22', level: 'ERROR', stage: 'extract', msg: 'Max retries exceeded. Pipeline failed.' },
    { ts: '2023-06-04 18:08:55', level: 'INFO', stage: 'extract', msg: 'Starting pipeline for Spanish GP' },
    { ts: '2023-06-04 18:08:57', level: 'INFO', stage: 'extract', msg: 'Fetched 20 driver results' },
    { ts: '2023-06-04 18:09:00', level: 'WARNING', stage: 'validate', msg: 'Nullable position found for DNF drivers' },
    { ts: '2023-06-04 18:09:02', level: 'INFO', stage: 'transform', msg: 'Flagging 8 safety car laps' },
    { ts: '2023-06-04 18:09:04', level: 'INFO', stage: 'load', msg: 'Load complete. 0 duplicates found' },
    { ts: '2023-06-04 18:09:05', level: 'SUCCESS', stage: 'notify', msg: 'Pipeline completed in 10.5s' },
    { ts: '2023-05-28 18:03:22', level: 'INFO', stage: 'extract', msg: 'Starting pipeline for Monaco GP' },
    { ts: '2023-05-28 18:03:25', level: 'WARNING', stage: 'extract', msg: 'FastF1 returned partial telemetry data' },
    { ts: '2023-05-28 18:03:28', level: 'INFO', stage: 'validate', msg: 'All 12 expectations passed' },
    { ts: '2023-05-28 18:03:31', level: 'INFO', stage: 'load', msg: 'Upserting 980 rows to lap_time table' },
    { ts: '2023-05-28 18:03:32', level: 'SUCCESS', stage: 'notify', msg: 'Pipeline completed in 8.7s' }
];

function addLogEntry(level, stage, msg) {
    logData.unshift({ ts: new Date().toISOString().replace('T', ' ').substring(0, 19), level, stage, msg });
}

function renderLogs() {
    filterLogs();
}

function filterLogs() {
    const level = document.getElementById('logLevelFilter').value;
    const q = document.getElementById('logSearch').value.toLowerCase();
    const filtered = logData.filter(l => (level === 'ALL' || l.level === level) && (l.msg.toLowerCase().includes(q) || l.stage.toLowerCase().includes(q)));
    const counts = { INFO: 0, WARNING: 0, ERROR: 0, SUCCESS: 0 };
    logData.forEach(l => counts[l.level] = (counts[l.level] || 0) + 1);
    document.getElementById('logSummary').innerHTML = `<span>Total: <b>${logData.length}</b></span><span>Info: <b>${counts.INFO}</b></span><span>Warnings: <b>${counts.WARNING}</b></span><span>Errors: <b>${counts.ERROR}</b></span><span>Success: <b>${counts.SUCCESS}</b></span>`;
    document.getElementById('logBody').innerHTML = filtered.map(l => {
        const cls = l.level === 'SUCCESS' ? 'badge-success' : l.level === 'ERROR' ? 'badge-fail' : l.level === 'WARNING' ? 'badge-warn' : 'badge-info';
        return `<tr><td style="white-space:nowrap">${l.ts}</td><td><span class="badge ${cls}">${l.level}</span></td><td>${l.stage}</td><td>${l.msg}</td></tr>`;
    }).join('');
}

function exportLogs() {
    const level = document.getElementById('logLevelFilter').value;
    const q = document.getElementById('logSearch').value.toLowerCase();
    const filtered = logData.filter(l => (level === 'ALL' || l.level === level) && l.msg.toLowerCase().includes(q));
    const text = filtered.map(l => `[${l.ts}] ${l.level.padEnd(8)} [${l.stage}] ${l.msg}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'apex-stream-logs.txt'; a.click();
}

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initStepper();
    populateRaceSelect();
    renderHistory();
});
