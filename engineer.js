// ==========================================
// APEX-ENGINEER: AI Race Engineer Module
// ==========================================

let apiKey = '';

// --- Sidebar Navigation ---
function switchSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    const labels = { chat: 'race', tools: 'mcp', strategy: 'strategy', simulator: 'scenario' };
    document.querySelectorAll('.sidebar-item').forEach(s => {
        if (s.textContent.toLowerCase().includes(labels[name] || name)) s.classList.add('active');
    });
}

// ==========================================
// CHAT
// ==========================================
const systemPrompt = `You are an expert Formula 1 Race Engineer working the pit wall during a live Grand Prix. You are communicating with the strategy team via radio.

Current Race Context:
- Race: Monaco GP 2024, Lap 34 of 78
- Our Driver: Lewis Hamilton (Car 44), currently P4
- Gap to P3 (ahead): 4.2s, Gap to P5 (behind): 8.7s
- Tyre: Medium compound, 18 laps old, 67% life remaining, 0.8%/lap degradation
- Recommended pit window: Lap 28-32 (already passed)
- Weather: Track 38°C, Air 24°C, Dry, 12% rain probability from Lap 45+
- Last pit stop: Lap 15 (2.4s), Team average: 2.6s

You have access to the following MCP tools:
- get_tyre_life: Check tyre condition for any driver
- get_gap_to_leader: Get gap and closing rate data
- get_pit_window: Calculate optimal pit stop timing
- get_weather_forecast: Get weather predictions
- get_safety_car_probability: Assess SC likelihood
- get_rival_strategy: Analyze competitor strategy
- get_lap_delta: Compare lap-by-lap pace
- get_race_history: Historical circuit data

Respond concisely and professionally, like a real F1 engineer. Use data to support recommendations. When discussing strategy, be specific about lap numbers, tyre compounds, and time deltas.`;

const starterMessages = [
    { role: 'user', content: 'What\'s the current tyre situation for Hamilton?' },
    { role: 'tool', name: 'get_tyre_life', result: '{"driver": "HAM", "compound": "Medium", "lap_age": 18, "life_pct": 67, "deg_rate": "0.8%/lap", "optimal_window": "Lap 28-32", "cliff_risk": "Lap 42"}' },
    { role: 'assistant', content: 'Hamilton is on Medium compound tyres, currently 18 laps old with 67% life remaining. Degradation rate is steady at 0.8% per lap.\n\n⚠️ **We\'ve already passed the recommended pit window (Lap 28-32).** At current deg rates, we\'re looking at a tyre cliff around Lap 42 — that gives us about 8 laps before performance drops significantly.\n\n**Recommendation:** We should consider pitting within the next 3-4 laps (by Lap 38 latest) for Hard compound. Staying out beyond that risks losing more time through degradation than we\'d gain by track position.' },
    { role: 'user', content: 'Check what Sainz ahead is doing — can we undercut him?' },
    { role: 'tool', name: 'get_rival_strategy', result: '{"rival": "SAI", "position": "P3", "compound": "Medium", "lap_age": 20, "predicted_stop": "Lap 36-38", "undercut_viable": true, "gap": "4.2s", "pit_delta": "22s"}' },
    { role: 'assistant', content: 'Sainz (P3) is also on Mediums — older than ours at 20 laps. His team is predicted to pit between **Lap 36-38**.\n\n📊 **Undercut analysis:**\n- Current gap: 4.2s\n- Pit loss: ~22s\n- Fresh Hard vs worn Medium pace delta: ~1.2s/lap\n- Undercut gain over 3 out-laps: ~3.6s\n\n✅ **Undercut IS viable** if we pit on Lap 35 (next lap). We\'d come out behind but with significantly fresher tyres. We\'d need 2-3 laps to close the gap, and Sainz\'s degrading Mediums should hand us the position by Lap 40.\n\n**Call: Box Lewis, Lap 35, Hard compound. Execute the undercut on Sainz.**' }
];

function renderStarterMessages() {
    const el = document.getElementById('chatMsgs');
    starterMessages.forEach(m => {
        if (m.role === 'user') {
            el.innerHTML += `<div class="msg msg-user">${m.content}</div>`;
        } else if (m.role === 'tool') {
            el.innerHTML += `<div class="msg msg-tool"><div class="tool-name">⚡ ${m.name}()</div>${formatJSON(m.result)}</div>`;
        } else {
            el.innerHTML += `<div class="msg msg-ai">${formatMd(m.content)}</div>`;
        }
    });
    el.scrollTop = el.scrollHeight;
}

function formatMd(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function formatJSON(str) {
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

function sendQuick(msg) {
    document.getElementById('chatInput').value = msg;
    sendChat();
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const el = document.getElementById('chatMsgs');
    el.innerHTML += `<div class="msg msg-user">${msg}</div>`;

    apiKey = document.getElementById('apiKey').value.trim();

    if (!apiKey) {
        // Simulate AI response without API key
        el.innerHTML += `<div class="typing" id="typingIndicator"><span></span><span></span><span></span></div>`;
        el.scrollTop = el.scrollHeight;
        await new Promise(r => setTimeout(r, 1500));
        document.getElementById('typingIndicator')?.remove();

        const simTool = simulateToolCall(msg);
        if (simTool) {
            el.innerHTML += `<div class="msg msg-tool"><div class="tool-name">⚡ ${simTool.name}()</div>${formatJSON(simTool.result)}</div>`;
        }

        const response = generateSimResponse(msg);
        el.innerHTML += `<div class="msg msg-ai">${formatMd(response)}</div>`;
        el.scrollTop = el.scrollHeight;
        return;
    }

    // Real API call
    el.innerHTML += `<div class="typing" id="typingIndicator"><span></span><span></span><span></span></div>`;
    el.scrollTop = el.scrollHeight;

    try {
        const messages = [{ role: 'user', content: msg }];
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: systemPrompt, messages })
        });
        document.getElementById('typingIndicator')?.remove();
        if (!resp.ok) throw new Error(`API Error: ${resp.status}`);
        const data = await resp.json();
        const text = data.content?.[0]?.text || 'No response received.';
        el.innerHTML += `<div class="msg msg-ai">${formatMd(text)}</div>`;
    } catch (e) {
        document.getElementById('typingIndicator')?.remove();
        el.innerHTML += `<div class="msg msg-ai" style="border-color:var(--err)">⚠️ ${e.message}<br><br><em>Tip: Ensure your API key is valid. The chat also works without a key using simulated responses.</em></div>`;
    }
    el.scrollTop = el.scrollHeight;
}

function testApiKey() {
    apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) { alert('Enter an API key first'); return; }
    const el = document.getElementById('chatMsgs');
    el.innerHTML += `<div class="msg msg-ai">🔑 API key set. Live Claude responses enabled. Type a message to start!</div>`;
    el.scrollTop = el.scrollHeight;
}

function simulateToolCall(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('tyre') || lower.includes('tire')) return { name: 'get_tyre_life', result: '{"driver":"HAM","compound":"Medium","lap_age":18,"life_pct":67,"deg_rate":"0.8%/lap","cliff_risk":"Lap 42"}' };
    if (lower.includes('pit') || lower.includes('window')) return { name: 'get_pit_window', result: '{"driver":"HAM","optimal_lap":35,"latest_lap":38,"strategies":["Hard (1-stop)","Soft (2-stop)"],"undercut_threat":true}' };
    if (lower.includes('weather') || lower.includes('rain')) return { name: 'get_weather_forecast', result: '{"track_temp":"38°C","air_temp":"24°C","conditions":"Dry","rain_prob":"12%","rain_start":"Lap 45+","wind":"8 km/h NE"}' };
    if (lower.includes('rival') || lower.includes('sainz') || lower.includes('ahead')) return { name: 'get_rival_strategy', result: '{"rival":"SAI","position":"P3","compound":"Medium","lap_age":20,"predicted_stop":"Lap 36-38","undercut_viable":true}' };
    if (lower.includes('safety') || lower.includes('sc')) return { name: 'get_safety_car_probability', result: '{"probability":"18%","historical_avg":"23%","last_sc":"None this race","recommendation":"Low SC risk, proceed with standard strategy"}' };
    if (lower.includes('gap') || lower.includes('leader')) return { name: 'get_gap_to_leader', result: '{"leader":"VER","gap":"12.4s","closing_rate":"-0.3s/lap","drs_possible":false,"position":"P4"}' };
    return null;
}

function generateSimResponse(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('tyre') || lower.includes('tire') || lower.includes('degradation'))
        return '**Tyre Status — Hamilton (P4)**\n\nMedium compound, 18 laps old. Life at 67% with steady 0.8%/lap degradation.\n\n⚠️ We\'re past the optimal window. Tyre cliff projected around **Lap 42**. At current pace, we\'re losing approximately 0.15s/lap to cars on fresher rubber.\n\n**Recommendation:** Plan to box by Lap 38 at the latest. Hard compound is the optimal choice for the run to the flag.';
    if (lower.includes('pit') || lower.includes('window') || lower.includes('box'))
        return '**Pit Window Analysis**\n\nOptimal pit lap: **35** (next lap)\nLatest safe pit lap: **38** before cliff\n\nAvailable strategies:\n1. **Hard compound (1-stop):** Pit Lap 35 → Run to flag on Hards. Conservative, safe P4.\n2. **Soft compound (2-stop):** Pit Lap 35 (Soft) → Pit Lap 55 (Soft). Aggressive, potential P3 but risky.\n\n✅ **Recommended: Option 1 — Box Lap 35 for Hards.** The undercut on Sainz is live.';
    if (lower.includes('weather') || lower.includes('rain'))
        return '**Weather Update — Monaco**\n\nCurrently **dry** conditions. Track temp 38°C, air 24°C.\n\n🌧️ Rain probability: **12%** starting from Lap 45+. Models show a small weather cell approaching from the coast but likely to pass north of the circuit.\n\n**Impact:** Low probability of rain affecting strategy. Continue planning for dry race. If rain materializes, we should immediately switch to Intermediates — track position becomes king on a wet Monaco.';
    if (lower.includes('rival') || lower.includes('strategy') || lower.includes('ahead'))
        return '**Rival Analysis — Top 4**\n\n| Pos | Driver | Tyre | Age | Pred. Stop |\n|-----|--------|------|-----|------------|\n| P1 | VER | Hard | 8 | No stop planned |\n| P2 | LEC | Hard | 10 | No stop planned |\n| P3 | SAI | Med | 20 | Lap 36-38 |\n| P4 | HAM | Med | 18 | **Our call** |\n\n**Key insight:** Verstappen and Leclerc are already on Hards — they\'ve undercut the field. Sainz is our direct competitor and will need to stop soon.\n\n✅ **Undercut opportunity on Sainz is LIVE.** If we box now (Lap 35), we gain the advantage.';
    if (lower.includes('safety') || lower.includes('sc'))
        return '**Safety Car Probability: 18%**\n\nHistoric Monaco SC rate is 23%, so we\'re slightly below average. No incidents so far.\n\nIf SC deploys: Free pit stop opportunity — everyone ahead would lose their gap advantage. This would heavily favor us if we haven\'t pitted yet.\n\n**Recommendation:** Don\'t gamble on an SC. Execute our planned strategy proactively.';
    return '**Copy, analyzing the situation.**\n\nCurrent position P4 at Lap 34/78. We\'re in a strong position with options available.\n\nKey considerations:\n- Tyre life at 67% — approaching critical window\n- Undercut on Sainz (P3) is viable\n- Weather stable with low rain risk\n- Gap behind is comfortable at 8.7s\n\nWould you like me to run a specific analysis? I can check **pit windows**, **rival strategies**, **weather forecasts**, or **tyre comparisons**.';
}

// ==========================================
// MCP TOOLS
// ==========================================
const mcpTools = [
    { name: 'get_tyre_life', desc: 'Returns current tyre compound, age, life percentage, degradation rate, and cliff prediction for a given driver.', input: '{\n  "driver_id": "string",\n  "race_id": "string"\n}', output: '{\n  "compound": "Medium",\n  "lap_age": 18,\n  "life_pct": 67,\n  "deg_rate": "0.8%/lap",\n  "optimal_window": "Lap 28-32",\n  "cliff_risk": "Lap 42"\n}', result: '{"compound":"Medium","lap_age":18,"life_pct":67,"deg_rate":"0.8%/lap","optimal_window":"Lap 28-32","cliff_risk":"Lap 42"}' },
    { name: 'get_gap_to_leader', desc: 'Returns the gap in seconds to the race leader, closing/opening rate, DRS availability, and current position.', input: '{\n  "driver_id": "string",\n  "race_id": "string",\n  "lap": "integer"\n}', output: '{\n  "gap_seconds": 12.4,\n  "closing_rate": "-0.3s/lap",\n  "drs_lap": false,\n  "position": "P4"\n}', result: '{"gap_seconds":12.4,"closing_rate":"-0.3s/lap","drs_lap":false,"position":"P4"}' },
    { name: 'get_pit_window', desc: 'Calculates the optimal pit stop window based on tyre degradation, track position, and competitor strategies.', input: '{\n  "driver_id": "string",\n  "race_id": "string",\n  "current_lap": "integer"\n}', output: '{\n  "optimal_lap": 35,\n  "latest_lap": 38,\n  "strategies": ["array"],\n  "undercut_threat": true\n}', result: '{"optimal_lap":35,"latest_lap":38,"strategies":["Hard (1-stop)","Soft (2-stop)"],"undercut_threat":true,"gap_after_pit":"estimated 5.8s behind SAI"}' },
    { name: 'get_weather_forecast', desc: 'Returns real-time weather data including track/air temperature, conditions, rain probability, and wind.', input: '{\n  "race_id": "string",\n  "lap_range": "string"\n}', output: '{\n  "track_temp": "38°C",\n  "air_temp": "24°C",\n  "conditions": "Dry",\n  "rain_prob": "12%",\n  "wind": "8 km/h NE"\n}', result: '{"track_temp":"38°C","air_temp":"24°C","conditions":"Dry","rain_prob":"12%","rain_start":"Lap 45+","wind":"8 km/h NE","confidence":"HIGH"}' },
    { name: 'get_safety_car_probability', desc: 'Evaluates the probability of a safety car deployment based on current race conditions and historical data.', input: '{\n  "race_id": "string",\n  "current_lap": "integer"\n}', output: '{\n  "probability": "18%",\n  "historical_avg": "23%",\n  "last_sc": "None",\n  "recommendation": "string"\n}', result: '{"probability":"18%","historical_avg":"23%","last_sc":"None this race","incidents_nearby":0,"recommendation":"Low SC risk — proceed with standard strategy"}' },
    { name: 'get_rival_strategy', desc: 'Analyzes a rival driver\'s current tyre, stint age, predicted pit window, and undercut/overcut viability.', input: '{\n  "race_id": "string",\n  "rival_driver_id": "string"\n}', output: '{\n  "tyre": "Medium",\n  "lap_age": 20,\n  "predicted_stop": "Lap 36-38",\n  "undercut_viable": true\n}', result: '{"rival":"SAI","position":"P3","compound":"Medium","lap_age":20,"predicted_stop":"Lap 36-38","undercut_viable":true,"overcut_viable":false}' },
    { name: 'get_lap_delta', desc: 'Compares lap-by-lap pace between two drivers, including sector splits, DRS impact, and overtake probability.', input: '{\n  "driver_id": "string",\n  "rival_id": "string",\n  "race_id": "string"\n}', output: '{\n  "delta_per_lap": "-0.3s",\n  "sectors": ["-0.1","-0.1","-0.1"],\n  "drs_impact": "0.2s",\n  "overtake_prob": "15%"\n}', result: '{"delta_per_lap":"-0.3s","sector_1":"-0.1s","sector_2":"-0.15s","sector_3":"-0.05s","drs_impact":"0.2s","overtake_prob":"15%"}' },
    { name: 'get_race_history', desc: 'Returns historical data for a circuit including average pit stops, common strategies, safety car rates, and fastest lap tyre.', input: '{\n  "circuit_id": "string",\n  "seasons": "integer[]"\n}', output: '{\n  "avg_stops": 1.8,\n  "strategies": ["array"],\n  "sc_rate": "23%",\n  "fastest_lap_tyre": "Soft"\n}', result: '{"circuit":"Monaco","avg_stops":1.8,"top_strategies":["M-H (1 stop)","S-H-M (2 stop)"],"sc_rate":"23%","fastest_lap_tyre":"Soft","avg_race_time":"1:45:32","overtakes_avg":8}' }
];

function renderMCPTools() {
    const grid = document.getElementById('toolGrid');
    grid.innerHTML = mcpTools.map((t, i) => `
        <div class="tool-card">
            <h4>${t.name}</h4>
            <p>${t.desc}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">INPUT SCHEMA</div><div class="tool-schema">${t.input}</div></div>
                <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">OUTPUT SCHEMA</div><div class="tool-schema">${t.output}</div></div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="testTool(${i})" style="width:100%">▶ Test Tool</button>
            <div class="tool-output" id="toolOut-${i}"></div>
        </div>`).join('');
}

function testTool(i) {
    const el = document.getElementById('toolOut-' + i);
    if (el.style.display === 'block') { el.style.display = 'none'; return; }
    el.textContent = '⏳ Executing...';
    el.style.display = 'block';
    setTimeout(() => { el.textContent = JSON.stringify(JSON.parse(mcpTools[i].result), null, 2); }, 600);
}

// ==========================================
// STRATEGY BOARD
// ==========================================
const stintData = [
    { driver: 'VER', stints: [{ compound: 'soft', start: 1, end: 15 }, { compound: 'hard', start: 16, end: 78 }] },
    { driver: 'LEC', stints: [{ compound: 'soft', start: 1, end: 13 }, { compound: 'hard', start: 14, end: 78 }] },
    { driver: 'SAI', stints: [{ compound: 'medium', start: 1, end: 36 }, { compound: 'hard', start: 37, end: 78 }] },
    { driver: 'HAM', stints: [{ compound: 'medium', start: 1, end: 35 }, { compound: 'hard', start: 36, end: 78 }] },
    { driver: 'NOR', stints: [{ compound: 'soft', start: 1, end: 18 }, { compound: 'medium', start: 19, end: 45 }, { compound: 'hard', start: 46, end: 78 }] },
    { driver: 'PIA', stints: [{ compound: 'soft', start: 1, end: 16 }, { compound: 'hard', start: 17, end: 78 }] },
    { driver: 'RUS', stints: [{ compound: 'medium', start: 1, end: 25 }, { compound: 'hard', start: 26, end: 78 }] },
    { driver: 'ALO', stints: [{ compound: 'hard', start: 1, end: 30 }, { compound: 'medium', start: 31, end: 78 }] },
    { driver: 'PER', stints: [{ compound: 'soft', start: 1, end: 14 }, { compound: 'medium', start: 15, end: 42 }, { compound: 'hard', start: 43, end: 78 }] },
    { driver: 'GAS', stints: [{ compound: 'medium', start: 1, end: 28 }, { compound: 'hard', start: 29, end: 78 }] }
];

function renderStints() {
    const el = document.getElementById('stintTimeline');
    el.innerHTML = stintData.map(d => {
        const segs = d.stints.map(s => {
            const w = ((s.end - s.start + 1) / 78 * 100).toFixed(1);
            return `<div class="stint-seg ${s.compound}" style="width:${w}%">L${s.start}-${s.end}</div>`;
        }).join('');
        const pits = d.stints.slice(1).map(s => `<div class="stint-pit" style="left:${((s.start - 1) / 78 * 100).toFixed(1)}%"></div>`).join('');
        return `<div class="stint-row"><span class="stint-label">${d.driver}</span><div class="stint-bar">${pits}${segs}</div></div>`;
    }).join('');
}

const strategyData = [
    { driver: 'VER', s1: 'Lap 15 (S→H)', s2: '—', compounds: 'S-H', pit: '2.2s', finish: 'P1' },
    { driver: 'LEC', s1: 'Lap 13 (S→H)', s2: '—', compounds: 'S-H', pit: '2.5s', finish: 'P2' },
    { driver: 'SAI', s1: 'Lap 36 (M→H)', s2: '—', compounds: 'M-H', pit: '2.4s', finish: 'P4' },
    { driver: 'HAM', s1: 'Lap 35 (M→H)', s2: '—', compounds: 'M-H', pit: '2.4s', finish: 'P3' },
    { driver: 'NOR', s1: 'Lap 18 (S→M)', s2: 'Lap 45 (M→H)', compounds: 'S-M-H', pit: '4.6s', finish: 'P5' },
    { driver: 'PIA', s1: 'Lap 16 (S→H)', s2: '—', compounds: 'S-H', pit: '2.3s', finish: 'P6' },
    { driver: 'RUS', s1: 'Lap 25 (M→H)', s2: '—', compounds: 'M-H', pit: '2.5s', finish: 'P7' },
    { driver: 'ALO', s1: 'Lap 30 (H→M)', s2: '—', compounds: 'H-M', pit: '2.8s', finish: 'P8' }
];

function renderStrategyTable() {
    document.getElementById('stratBody').innerHTML = strategyData.map(s =>
        `<tr><td style="font-weight:600">${s.driver}</td><td>${s.s1}</td><td>${s.s2}</td><td>${s.compounds.split('-').map(c => {
            const cls = c === 'S' ? 'badge-red' : c === 'M' ? 'badge-amber' : 'badge-muted';
            const name = c === 'S' ? 'SOFT' : c === 'M' ? 'MED' : 'HARD';
            return `<span class="badge ${cls}">${name}</span>`;
        }).join(' ')}</td><td>${s.pit}</td><td style="font-weight:600">${s.finish}</td></tr>`
    ).join('');
}

const strategies = [
    { name: 'CONSERVATIVE', type: '2-stop: M → H → H', pos: 'P4 (hold)', risk: 'LOW', color: 'var(--green)',
      pros: '✅ Low tyre stress\n✅ Consistent pace\n✅ Covers Safety Car risk', cons: '❌ No position gain\n❌ Extra pit stop time' },
    { name: 'AGGRESSIVE', type: '1-stop: M → H (now)', pos: 'P3 (gain)', risk: 'MEDIUM', color: 'var(--amber)',
      pros: '✅ Undercut on Sainz\n✅ Minimal pit time\n✅ Track position play', cons: '❌ Tyre management required\n❌ 44 laps on Hards' },
    { name: 'OPPORTUNISTIC', type: 'SC-triggered: pit under SC', pos: 'P2 (best case)', risk: 'HIGH', color: 'var(--err)',
      pros: '✅ Free pit stop if SC\n✅ Huge position swing\n✅ Maximum upside', cons: '❌ Only 18% SC probability\n❌ Major risk if no SC' }
];

function renderStrategyCards() {
    document.getElementById('stratCards').innerHTML = strategies.map(s => `
        <div class="strat-card">
            <h4>${s.name}</h4>
            <div class="strat-type">${s.type}</div>
            <div class="strat-meta">
                <span>Predicted: <strong>${s.pos}</strong></span>
                <span class="badge" style="background:${s.color}22;color:${s.color}">${s.risk} RISK</span>
            </div>
            <div class="strat-pros" style="white-space:pre-line">${s.pros}\n${s.cons}</div>
            <button class="btn btn-outline btn-sm" style="width:100%" onclick="sendStratToChat('${s.name}','${s.type}')">📨 Send to Chat</button>
        </div>`).join('');
}

function sendStratToChat(name, type) {
    switchSection('chat');
    const input = document.getElementById('chatInput');
    input.value = `Evaluate the ${name} strategy (${type}) for Hamilton. What are the risks and expected outcome?`;
    input.focus();
}

// ==========================================
// SCENARIO SIMULATOR
// ==========================================
function runSimulation() {
    const lap = parseInt(document.getElementById('simLap').value);
    const sc = document.getElementById('simSC').classList.contains('on');
    const rainLap = parseInt(document.getElementById('simRain').value);
    const rivalPit = document.getElementById('simRivalPit').classList.contains('on');
    const deg = parseFloat(document.getElementById('simDeg').value) / 10;

    const tyreLapsLeft = Math.max(0, Math.round((42 - lap) / deg));
    const totalLaps = 78;
    const lapsRemaining = totalLaps - lap;
    const tyreCliff = lap + tyreLapsLeft;

    let action, impact, narrative;

    if (sc) {
        action = '🟢 PIT IMMEDIATELY — Safety Car deployed. Free pit stop opportunity!';
        impact = `Position change: P4 → P2 (estimated). Gap reset to 0. Fresh Hard tyres for ${lapsRemaining} remaining laps.`;
        narrative = `Safety car deployed at Lap ${lap}. This is the best possible scenario for Hamilton. Pitting under SC costs minimal time (~5s vs ~22s under racing conditions). With fresh Hards and the field bunched up, Hamilton can attack Leclerc and Sainz on the restart. Rain at Lap ${rainLap} (if it comes) would further benefit us with newer tyres.`;
    } else if (lap >= rainLap - 3) {
        action = '🌧️ PREPARE FOR INTERMEDIATES — Rain approaching!';
        impact = `Rain expected in ~${rainLap - lap} laps. Switch to Intermediate compound. Position depends on timing vs rivals.`;
        narrative = `Rain is ${rainLap - lap} laps away. Key decision: do we pit now for Intermediates (proactive) or wait and see? At Monaco, being first to react to rain is crucial — the narrow streets amplify the advantage of correct tyre choice. Recommend boxing at Lap ${rainLap - 1} for Intermediates if radar confirms rain.`;
    } else if (rivalPit) {
        action = '⚡ RESPOND — Rival has pitted. Cover or overcut?';
        impact = `Sainz (P3) has pitted. Current gap removes undercut threat. We can overcut by staying out ${Math.min(3, tyreLapsLeft)} more laps.`;
        narrative = `Sainz has taken his stop. With ${deg.toFixed(1)}x degradation, our tyres have ${tyreLapsLeft} laps before the cliff at Lap ${tyreCliff}. The overcut can work if we push for ${Math.min(3, tyreLapsLeft)} more laps on these Mediums — we'll gain time from clear air. Recommendation: Stay out until Lap ${Math.min(lap + 3, tyreCliff)} then box for Hards.`;
    } else {
        const pitLap = Math.min(lap + 2, tyreCliff);
        action = `🔧 BOX LAP ${pitLap} — Undercut window is open`;
        impact = `Predicted finish: P3 (+1 position). Tyre cliff at Lap ${tyreCliff} with ${deg.toFixed(1)}x degradation.`;
        narrative = `Standard racing conditions. At ${deg.toFixed(1)}x degradation rate, tyres will hit the cliff at Lap ${tyreCliff} (${tyreLapsLeft} laps from now). Optimal strategy: pit at Lap ${pitLap} for Hard compound. ${lapsRemaining - (pitLap - lap)} laps on Hards is well within the compound's life. Undercut on Sainz is viable — execute with clean in-lap and quick stop.`;
    }

    const html = `
        <div style="margin-bottom:16px">
            <div class="ctx-row"><span>Lap</span><span>${lap} / ${totalLaps}</span></div>
            <div class="ctx-row"><span>Laps Remaining</span><span>${lapsRemaining}</span></div>
            <div class="ctx-row"><span>Safety Car</span><span style="color:${sc ? 'var(--amber)' : 'var(--green)'}">${sc ? 'DEPLOYED' : 'No'}</span></div>
            <div class="ctx-row"><span>Rain</span><span>Lap ${rainLap} (${rainLap - lap} laps away)</span></div>
            <div class="ctx-row"><span>Rival Pit</span><span>${rivalPit ? 'Yes' : 'No'}</span></div>
            <div class="ctx-row"><span>Deg. Rate</span><span>${deg.toFixed(1)}x (cliff: Lap ${tyreCliff})</span></div>
        </div>
        <div class="sim-action"><strong>RECOMMENDED ACTION</strong><br>${action}</div>
        <div class="sim-result"><strong>IMPACT ANALYSIS</strong><br>${impact}</div>
        <div class="sim-result"><strong>NARRATIVE</strong><br>${narrative}</div>`;

    document.getElementById('simResults').innerHTML = html;
}

// ==========================================
// WAREHOUSE STATS
// ==========================================
setInterval(() => {
    const el = document.getElementById('wRaces');
    if (el) el.textContent = parseInt(el.textContent) + (Math.random() > 0.7 ? 1 : 0);
    const sync = document.getElementById('wSync');
    if (sync) sync.textContent = ['just now', '1 min ago', '2 mins ago', '3 mins ago'][Math.floor(Math.random() * 4)];
}, 30000);

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    renderStarterMessages();
    renderMCPTools();
    renderStints();
    renderStrategyTable();
    renderStrategyCards();
    runSimulation();
});
