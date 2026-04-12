/* ═══════════════════════════════════════════════════════════
   SNAKE BATTLE — Game Engine v4 (fixed multiplayer)
   ═══════════════════════════════════════════════════════════ */

// ── Firebase ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDCLIF9pwyo6sQUSUXaRQV3DIS2MtYtLoM",
  authDomain: "snake-battle-e986b.firebaseapp.com",
  databaseURL: "https://snake-battle-e986b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "snake-battle-e986b"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── DOM References ────────────────────────────────────────
const canvas  = document.getElementById("gameCanvas");
const ctx     = canvas.getContext("2d");
const menuEl  = document.getElementById("menu");
const gameEl  = document.getElementById("gameArea");
const nameInp = document.getElementById("nameInput");
const roomInp = document.getElementById("roomInput");
const roomDisp = document.getElementById("roomDisplay");
const statusEl = document.getElementById("statusMsg");
const gameStatEl = document.getElementById("gameStatus");
const pcCtrl  = document.getElementById("pcControlsInfo");
const mobSingle = document.getElementById("mobileControlsSingle");
const mobLocal  = document.getElementById("mobileControlsLocal");
const legendEl = document.getElementById("playerLegend");

// ── Constants ─────────────────────────────────────────────
const UNIT = 20;
const CW = canvas.width;
const CH = canvas.height;
const GAME_SPEED = 120;
const START_SCORE = 30;
const OPPOSITE = { UP:"DOWN", DOWN:"UP", LEFT:"RIGHT", RIGHT:"LEFT" };
const COLORS = [
  { main:"#00ff88", dim:"#009955", glow:"rgba(0,255,136,", name:"Green" },
  { main:"#ff4466", dim:"#aa1133", glow:"rgba(255,68,102,", name:"Coral" },
  { main:"#ffcc00", dim:"#aa8800", glow:"rgba(255,204,0,",  name:"Gold" },
  { main:"#aa66ff", dim:"#6633aa", glow:"rgba(170,102,255,",name:"Purple" }
];

// ── Sound System ──────────────────────────────────────────
let audioCtx = null;
let bgmInterval = null;
let sfxOn = true;
let musicOn = true;

const ICON_SFX_ON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>';
const ICON_SFX_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
const ICON_MUSIC_ON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
const ICON_MUSIC_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13" opacity="0.3"/><circle cx="6" cy="18" r="3" opacity="0.3"/><circle cx="18" cy="16" r="3" opacity="0.3"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, dur, type, vol, freqEnd) {
  if (!sfxOn) return;
  try {
    const c = getAudio();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.1, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.01);
  } catch (e) { /* silent */ }
}

function sfxClick()    { playTone(800, 0.04, "square", 0.06); }
function sfxEat()      { playTone(400, 0.08, "sine", 0.1); setTimeout(() => playTone(600, 0.08, "sine", 0.1), 50); }
function sfxDamage()   { playTone(120, 0.22, "sawtooth", 0.14, 50); }
function sfxGameOver() { playTone(400, 0.15, "sine", 0.1); setTimeout(() => playTone(300, 0.15, "sine", 0.1), 120); setTimeout(() => playTone(200, 0.4, "sine", 0.1), 240); }
function sfxJoin()     { playTone(523, 0.1, "sine", 0.08); setTimeout(() => playTone(659, 0.12, "sine", 0.08), 90); }
function sfxLeave()    { playTone(659, 0.1, "sine", 0.08); setTimeout(() => playTone(440, 0.15, "sine", 0.08), 90); }

// ── BGM ───────────────────────────────────────────────────
const BGM_NOTES = [
  261.63, 311.13, 349.23, 392.00,
  466.16, 392.00, 349.23, 311.13,
  261.63, 349.23, 466.16, 349.23,
  311.13, 392.00, 523.25, 392.00
];

function startBGM() {
  if (!musicOn || bgmInterval) return;
  try {
    const c = getAudio();
    let idx = 0;
    bgmInterval = setInterval(() => {
      if (!musicOn) { stopBGM(); return; }
      const freq = BGM_NOTES[idx % BGM_NOTES.length];
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.04, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.19);
      idx++;
    }, 220);
  } catch (e) { /* silent */ }
}

function stopBGM() {
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

function toggleMusic() {
  sfxClick();
  musicOn = !musicOn;
  if (musicOn) startBGM(); else stopBGM();
  updateSoundBtns();
}

function toggleSfx() {
  sfxOn = !sfxOn;
  if (sfxOn) sfxClick();
  updateSoundBtns();
}

function updateSoundBtns() {
  const mb = document.getElementById("btnMusic");
  const sb = document.getElementById("btnSfx");
  if (mb) { mb.classList.toggle("muted", !musicOn); mb.innerHTML = musicOn ? ICON_MUSIC_ON : ICON_MUSIC_OFF; }
  if (sb) { sb.classList.toggle("muted", !sfxOn); sb.innerHTML = sfxOn ? ICON_SFX_ON : ICON_SFX_OFF; }
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg) {
  const c = document.getElementById("toastContainer");
  if (!c) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
  setTimeout(() => { t.classList.remove("show"); t.classList.add("hide"); setTimeout(() => t.remove(), 500); }, 3000);
}

// ── Visual Effects ────────────────────────────────────────
let floatingTexts = [];
let screenFlash = 0;

function addFloatingText(x, y, text) {
  floatingTexts.push({ x: x + UNIT / 2, y, text, alpha: 1, life: 35 });
}

function updateFloatingTexts() {
  floatingTexts = floatingTexts.filter(t => {
    t.y -= 1.5; t.alpha -= 1 / t.life; t.life--;
    return t.life > 0;
  });
}

function triggerDamageFlash() {
  const el = document.getElementById("damageFlash");
  if (!el) return;
  el.style.display = "block";
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "flashFade 0.3s ease-out forwards";
  setTimeout(() => { el.style.display = "none"; }, 300);
}

// ── Game State ────────────────────────────────────────────
let mode = "";
let gameModeSetting = "normal"; // normal, sudden_death, last_man
let suddenDeathBorder = 0;
let gameStartTime = 0;
let activePlayerCount = 0;

function updateAIDifficultyBtn(diff) {
  const span = document.getElementById("currentAIDiff");
  if (span) span.innerText = (diff || "Medium").toUpperCase();
}           // "", "local", "ai", "online"
let interval = null;     // main game loop timer
let aiInterval = null;   // AI tick timer
let roomRef = null;      // Firebase ref for current room
let roomListener = null; // the value listener function
let currentRoomId = "";
let playerRole = "";     // "player1" or "player2"
let gameOver = false;
let winner = null;
let previousPlayers = {};
let matchmakingActive = false;
let matchmakingTimeout = null;
let matchmakingInBackground = false;
let _aiModalForMatchmaking = false;

let snake1, snake2, snake3, snake4;
let dir1, dir2, dir3, dir4;
let score1, score2, score3, score4;
let food;
let player1Name = "P1", player2Name = "P2", player3Name = "P3", player4Name = "P4";

let players = [];

function syncToPlayers() {
  players[0] = { id: "p1", name: player1Name, snake: snake1, dir: dir1, score: score1, alive: score1 > 0 && snake1 && snake1.length > 0, color: COLORS[0], _prevH: _prevH1 };
  players[1] = { id: "p2", name: player2Name, snake: snake2, dir: dir2, score: score2, alive: score2 > 0 && snake2 && snake2.length > 0, color: COLORS[1], _prevH: _prevH2 };
  players[2] = { id: "p3", name: player3Name, snake: snake3, dir: dir3, score: score3, alive: score3 > 0 && snake3 && snake3.length > 0, color: COLORS[2], _prevH: null };
  players[3] = { id: "p4", name: player4Name, snake: snake4, dir: dir4, score: score4, alive: score4 > 0 && snake4 && snake4.length > 0, color: COLORS[3], _prevH: null };
}

function syncFromPlayers() {
  if (players[0]) { snake1=players[0].snake; dir1=players[0].dir; score1=players[0].score; }
  if (players[1]) { snake2=players[1].snake; dir2=players[1].dir; score2=players[1].score; }
  if (players[2]) { snake3=players[2].snake; dir3=players[2].dir; score3=players[2].score; }
  if (players[3]) { snake4=players[3].snake; dir4=players[3].dir; score4=players[3].score; }
}

// Swap detection: previous head positions
let _prevH1 = null, _prevH2 = null;

// ── Grid Pattern ──────────────────────────────────────────
let gridPattern = null;
function ensureGridPattern() {
  if (gridPattern) return;
  const pc = document.createElement("canvas");
  pc.width = UNIT; pc.height = UNIT;
  const px = pc.getContext("2d");
  px.strokeStyle = "rgba(255,255,255,0.025)";
  px.lineWidth = 0.5;
  px.strokeRect(0, 0, UNIT, UNIT);
  gridPattern = ctx.createPattern(pc, "repeat");
}

// ── Reset / Init ──────────────────────────────────────────
function resetGameState() {
  snake1 = [{ x:200, y:300 }, { x:180, y:300 }, { x:160, y:300 }];
  snake2 = [{ x:700, y:300 }, { x:720, y:300 }, { x:740, y:300 }];
  snake3 = [{ x:450, y:100 }, { x:450, y:80 }, { x:450, y:60 }];
  snake4 = [{ x:450, y:500 }, { x:450, y:520 }, { x:450, y:540 }];
  dir1 = "RIGHT"; dir2 = "LEFT"; dir3 = "DOWN"; dir4 = "UP";
  score1 = START_SCORE; score2 = START_SCORE; score3 = START_SCORE; score4 = START_SCORE;

  // In local/ai, strictly 2 players
  if (mode !== "online") {
    snake3 = []; snake4 = []; score3 = 0; score4 = 0;
  } else {
    // If online, ideally we only spawn players who joined.
    // We'll rely on the host resetting the state correctly. 
    // If we want dynamic spawn based on previousPlayers:
    if (!previousPlayers.player3) { snake3 = []; score3 = 0; }
    if (!previousPlayers.player4) { snake4 = []; score4 = 0; }
  }

  syncToPlayers();
  activePlayerCount = players.filter(p => p.snake && p.snake.length > 0).length;
  food = randomFood(players.map(p => p.snake).filter(s => s && s.length > 0));
  
  if (gameModeSetting === "sudden_death") {
    setTimeout(() => showToast("Sudden Death! Walls will shrink in 10 seconds."), 500);
  }
  
  gameOver = false;
  winner = null;
  gameStartTime = Date.now();
  suddenDeathBorder = 0;
  floatingTexts = [];
  screenFlash = 0;
  _prevH1 = null;
  _prevH2 = null;
}

function initGame(loopFn) {
  clearGameTimer();
  resetGameState();
  draw();
  interval = setInterval(loopFn, GAME_SPEED);
  startBGM();
}

function clearGameTimer() { if (interval) { clearInterval(interval); interval = null; } }
function clearAiTimer()   { if (aiInterval) { clearInterval(aiInterval); aiInterval = null; } }

function detachRoom() {
  if (roomRef && roomListener) {
    try { roomRef.off("value", roomListener); } catch(e) {}
  }
  clearPollInterval();
  roomRef = null;
  roomListener = null;
  currentRoomId = "";
  playerRole = "";
  previousPlayers = {};
}

// Polling fallback for cross-device sync
let _pollInterval = null;
function clearPollInterval() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}
function startPollForPlayer2() {
  clearPollInterval();
  if (playerRole !== "player1" || !currentRoomId) return;
  console.log("[Poll] Starting poll for player2");
  _pollInterval = setInterval(() => {
    if (mode !== "online" || !currentRoomId || playerRole !== "player1" || interval) {
      clearPollInterval();
      return;
    }
    db.ref("rooms/" + currentRoomId + "/players/player2").once("value").then(snap => {
      if (snap.exists() && !interval && !gameOver) {
        console.log("[Poll] Detected player2 via polling!");
        clearPollInterval();
        // Read full room to get name
        db.ref("rooms/" + currentRoomId).once("value").then(rs => {
          const room = rs.val();
          if (room && room.players && room.players.player2) {
            player2Name = room.players.player2.name || "P2";
            updatePlayerLegend();
            showGameStatus(currentRoomId + " \u2014 " + player1Name + " vs " + player2Name);
            hideStatus();
            if (!interval && !gameOver) {
              console.log("[Poll] Starting game loop");
              resetGameState();
              interval = setInterval(hostGameLoop, GAME_SPEED);
              startBGM();
              syncRoomState();
            }
          }
        });
      }
    }).catch(() => {});
  }, 2000);
}

function stopCurrentSession() {
  clearGameTimer();
  clearAiTimer();
  detachRoom();
}

// ── UI State ──────────────────────────────────────────────
function isMobile() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function showMenu() {
  menuEl.style.display = "flex";
  gameEl.style.display = "none";
  pcCtrl.style.display = "none";
  mobSingle.style.display = "none";
  mobLocal.style.display = "none";
  legendEl.style.display = "none";
  hideCopyBtn();
  hideRestartBtn();
  hideStatus();
  hideGameStatus();
  roomDisp.style.display = "none";
  const pcEl = document.getElementById("playerCount");
  if (pcEl) pcEl.style.display = "none";
  const cmBtn = document.getElementById("cancelMatchBtn");
  if (cmBtn) cmBtn.style.display = "none";
  const tryBtn = document.getElementById("tryAIBtn");
  if (tryBtn) tryBtn.style.display = "none";
  const mmBar = document.getElementById("matchmakingBar");
  if (mmBar) mmBar.style.display = "none";
  matchmakingActive = false;
  matchmakingInBackground = false;
  _aiModalForMatchmaking = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
}

function showGame(single, local) {
  menuEl.style.display = "none";
  gameEl.style.display = "flex";
  legendEl.style.display = "flex";
  const cmBtn = document.getElementById("cancelMatchBtn");
  if (cmBtn) cmBtn.style.display = "none";
  showRestartBtn();
  updatePlayerLegend();
  const mob = isMobile();
  pcCtrl.style.display    = (!mob && local) ? "flex" : "none";
  mobSingle.style.display = (mob && single) ? "flex" : "none";
  mobLocal.style.display  = (mob && local) ? "flex" : "none";
  if (mob) {
    setTimeout(() => gameEl.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
  
  // Show "Change Difficulty" button in AI mode or background matchmaking
  const diffBtn = document.getElementById("changeAIDiffBtn");
  if (diffBtn) {
    diffBtn.style.display = (mode === "ai" || matchmakingInBackground) ? "inline-flex" : "none";
  }
}

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.style.display = msg ? "block" : "none";
}
function hideStatus() { statusEl.style.display = "none"; }

function showGameStatus(msg) {
  gameStatEl.textContent = msg;
  gameStatEl.style.display = msg ? "block" : "none";
}
function hideGameStatus() { gameStatEl.style.display = "none"; }

// ── Player Helpers ────────────────────────────────────────
function getPlayerName(fallback) {
  const v = nameInp ? nameInp.value.trim() : "";
  return v || fallback;
}
function getRoomId() {
  return roomInp ? roomInp.value.trim().toUpperCase() : "";
}
function genRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function updatePlayerLegend() {
  if (!legendEl) return;
  syncToPlayers();
  legendEl.innerHTML = "";
  players.forEach(p => {
    if (!p || !p.snake) return;
    const d = document.createElement("div");
    d.className = "legend-item";
    d.innerHTML = '<span class="legend-dot" style="background:' + p.color.main + '"></span>' + p.name;
    legendEl.appendChild(d);
  });
}

function updatePlayerCount(playersRoom) {
  const el = document.getElementById("playerCount");
  if (!el) return;
  const count = Object.keys(playersRoom || {}).filter(k => playersRoom[k]).length;
  const max = 4; // Updated from Phase 2
  el.textContent = "Players: " + count + "/" + max;
  el.style.display = mode === "online" ? "block" : "none";
}

// ── Food ──────────────────────────────────────────────────
function randomFood(snakes) {
  snakes = snakes || [];
  for (let i = 0; i < 200; i++) {
    const c = {
      x: Math.floor(Math.random() * (CW / UNIT)) * UNIT,
      y: Math.floor(Math.random() * (CH / UNIT)) * UNIT
    };
    if (c.y < UNIT * 2) continue;
    let ok = true;
    for (const s of snakes) { for (const seg of s) { if (seg.x === c.x && seg.y === c.y) { ok = false; break; } } if (!ok) break; }
    if (ok) return c;
  }
  return { x: UNIT * 5, y: UNIT * 5 };
}

// ── Rendering ─────────────────────────────────────────────
function draw() {
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, CW, CH);
  ensureGridPattern();
  if (gridPattern) { ctx.fillStyle = gridPattern; ctx.fillRect(0, 0, CW, CH); }

  // Draw Sudden Death border
  if (gameModeSetting === "sudden_death" && suddenDeathBorder > 0) {
    ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
    // Top
    ctx.fillRect(0, 0, CW, suddenDeathBorder);
    // Bottom
    ctx.fillRect(0, CH - suddenDeathBorder, CW, suddenDeathBorder);
    // Left
    ctx.fillRect(0, suddenDeathBorder, suddenDeathBorder, CH - 2 * suddenDeathBorder);
    // Right
    ctx.fillRect(CW - suddenDeathBorder, suddenDeathBorder, suddenDeathBorder, CH - 2 * suddenDeathBorder);
    
    // Warning text
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
      ctx.font = 'bold 20px "Share Tech Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("SUDDEN DEATH: WALLS CLOSING IN!", CW / 2, CH / 2);
      ctx.textAlign = "left";
    }
  }

  // Sync state to players array before rendering
  syncToPlayers();

  // Food pulse
  const fp = 0.6 + 0.4 * Math.sin(Date.now() / 250);
  ctx.globalAlpha = fp * 0.25;
  ctx.fillStyle = "#00e5ff";
  ctx.fillRect(food.x - 4, food.y - 4, UNIT + 8, UNIT + 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#00e5ff";
  ctx.fillRect(food.x + 2, food.y + 2, UNIT - 4, UNIT - 4);

  // Draw snakes dynamically from players array
  players.forEach(p => {
    if (p && p.snake && p.snake.length > 0) {
      drawSnake(p.snake, p.color, p.name);
    }
  });

  // Score HUD dynamically driven by players array
  ctx.fillStyle = "rgba(6,6,15,0.88)";
  ctx.fillRect(0, 0, CW, 34);
  ctx.strokeStyle = "rgba(0,229,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(CW, 34); ctx.stroke();
  ctx.font = 'bold 16px "Share Tech Mono", monospace';
  
  if (players[0]) {
    ctx.fillStyle = players[0].color.main;
    ctx.textAlign = "left";
    ctx.fillText(players[0].name + "  " + players[0].score + " pts", 12, 23);
  }
  if (players[1]) {
    ctx.fillStyle = players[1].color.main;
    ctx.textAlign = "right";
    ctx.fillText(players[1].score + " pts  " + players[1].name, CW - 12, 23);
  }
  ctx.textAlign = "left";

  // Floating texts
  updateFloatingTexts();
  floatingTexts.forEach(t => {
    ctx.globalAlpha = Math.max(0, t.alpha);
    ctx.fillStyle = "#ff4466";
    ctx.font = 'bold 15px "Orbitron", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  });

  // Screen flash
  if (screenFlash > 0) {
    ctx.fillStyle = "rgba(255,50,50," + screenFlash + ")";
    ctx.fillRect(0, 0, CW, CH);
    screenFlash = Math.max(0, screenFlash - 0.06);
  }

  if (gameOver) {
    let msg = "DRAW!";
    if (winner === "p1") msg = player1Name + " WINS!";
    else if (winner === "p2") msg = player2Name + " WINS!";
    drawBanner(msg);
  }
}

function drawSnake(snake, colors, name) {
  if (!snake || snake.length === 0) return;
  for (let i = snake.length - 1; i >= 0; i--) {
    const seg = snake[i];
    const isHead = i === 0;
    const bright = 1 - (i / (snake.length + 5)) * 0.5;
    if (isHead) {
      ctx.fillStyle = colors.glow + "0.13)";
      ctx.fillRect(seg.x - 3, seg.y - 3, UNIT + 6, UNIT + 6);
    }
    ctx.globalAlpha = bright;
    ctx.fillStyle = isHead ? colors.main : colors.dim;
    ctx.fillRect(seg.x + 1, seg.y + 1, UNIT - 2, UNIT - 2);
    ctx.globalAlpha = 1;
  }
  if (name && snake.length > 0) {
    const h = snake[0];
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors.main;
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText(name, h.x + UNIT / 2, h.y - 5);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}

function drawBanner(msg) {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, CH / 2 - 40, CW, 80);
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 26px "Orbitron", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(msg, CW / 2, CH / 2 + 9);
  ctx.textAlign = "left";
}

// ── Snake Movement ────────────────────────────────────────
function nextHead(snake, dir) {
  const h = { ...snake[0] };
  if (dir === "UP")    h.y -= UNIT;
  if (dir === "DOWN")  h.y += UNIT;
  if (dir === "LEFT")  h.x -= UNIT;
  if (dir === "RIGHT") h.x += UNIT;
  wrap(h);
  return h;
}
function wrap(p) {
  if (p.x < 0)   p.x = CW - UNIT;
  if (p.x >= CW) p.x = 0;
  if (p.y < 0)   p.y = CH - UNIT;
  if (p.y >= CH) p.y = 0;
}
function hit(a, b) { return a && b && a.x === b.x && a.y === b.y; }

function stepSnake(snake, dir) {
  const head = nextHead(snake, dir);
  snake.unshift(head);
  const ate = hit(head, food);
  if (!ate) snake.pop();
  return ate;
}

// ── Collision System ──────────────────────────────────────
function checkCollisions() {
  if (gameOver) return;
  syncToPlayers();
  
  const alivePlayers = players.filter(p => p && p.alive && p.snake && p.snake.length > 0);
  
  // Robust win condition check at the start of tick
  if (activePlayerCount > 1 && alivePlayers.length <= 1) {
    if (alivePlayers.length === 1) endGame(alivePlayers[0].id);
    else endGame("draw");
    return;
  }
  
  // Single player testing/waiting mode
  if (alivePlayers.length <= 1) return;

  const dmgSet = new Set();

  for (const p1 of alivePlayers) {
    const h1 = p1.snake[0];
    for (const p2 of alivePlayers) {
      const start = (p1.id === p2.id) ? 1 : 0;
      for (let i = start; i < p2.snake.length; i++) {
        if (hit(h1, p2.snake[i])) { dmgSet.add(p1.id); break; }
      }
      if (dmgSet.has(p1.id)) break;
    }
  }

  // Swap-through detection
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const p1 = alivePlayers[i];
      const p2 = alivePlayers[j];
      if (p1._prevH && p2._prevH && p1.snake.length > 0 && p2.snake.length > 0) {
        if (hit(p1.snake[0], p2._prevH) && hit(p2.snake[0], p1._prevH)) {
          dmgSet.add(p1.id);
          dmgSet.add(p2.id);
        }
      }
    }
  }

  // Sudden Death border check
  if (gameModeSetting === "sudden_death" && suddenDeathBorder > 0) {
    for (const p of alivePlayers) {
      const h = p.snake[0];
      if (h.x < suddenDeathBorder || h.x >= CW - suddenDeathBorder ||
          h.y < suddenDeathBorder || h.y >= CH - suddenDeathBorder) {
        dmgSet.add(p.id);
      }
    }
  }

  if (dmgSet.size > 0) {
    for (const id of dmgSet) { applyDamageDynamic(id); }
    syncFromPlayers();
    
    syncToPlayers();
    const surviving = players.filter(p => p && p.alive && p.snake && p.snake.length > 0);
    
    // Check win condition at the end of tick
    if (activePlayerCount > 1 && surviving.length <= 1) {
      if (surviving.length === 1) endGame(surviving[0].id);
      else endGame("draw");
      return;
    }
  }
}

function applyDamageDynamic(id) {
  const p = players.find(p => p && p.id === id);
  if (!p) return;
  if (p.snake && p.snake.length > 0) p.snake.pop();
  p.score -= 10;
  if (p.snake && p.snake.length > 0) addFloatingText(p.snake[0].x, p.snake[0].y, "OUCH!");
  screenFlash = 0.35;
  triggerDamageFlash();
  sfxDamage();
  if (p.score <= 0 || !p.snake || p.snake.length === 0) p.alive = false;
}

function endGame(result) {
  gameOver = true;
  winner = result;
  clearGameTimer();
  clearAiTimer();
  sfxGameOver();
  stopBGM();
  draw();
  // Host syncs final state
  if (mode === "online" && roomRef && playerRole === "player1" && !matchmakingInBackground) {
    roomRef.child("game").update({
      gameOver: true, winner: result,
      score1: score1, score2: score2,
      snake1: serSnake(snake1), snake2: serSnake(snake2)
    }).catch(e => console.error("[endGame] sync error:", e));
  }
}

// ── Game Tick ─────────────────────────────────────────────
function tickGame() {
  if (gameOver) return;
  syncToPlayers();

  let anyoneAte = false;
  players.forEach(p => {
    if (!p || !p.alive || !p.snake || p.snake.length === 0) return;
    p._prevH = { x: p.snake[0].x, y: p.snake[0].y };
    const ate = stepSnake(p.snake, p.dir);
    if (ate) {
      p.score += 10;
      anyoneAte = true;
      sfxEat();
    }
  });

  if (anyoneAte) {
    food = randomFood(players.map(p => p.snake).filter(s => s && s.length > 0));
  }
  
  if (gameModeSetting === "sudden_death" && (mode !== "local" && (mode !== "ai" || matchmakingInBackground)) && playerRole === "player1") {
    const elapsed = Date.now() - gameStartTime;
    if (elapsed > 10000) { // 10 seconds
      const phases = Math.floor((elapsed - 10000) / 10000); // shrink every 10 seconds
      suddenDeathBorder = Math.min(phases * UNIT, Math.min(CW, CH) / 2 - 2 * UNIT);
    }
  } else if (gameModeSetting === "sudden_death" && (mode === "ai" || mode === "local")) {
    const elapsed = Date.now() - gameStartTime;
    if (elapsed > 10000) { // 10 seconds
      const phases = Math.floor((elapsed - 10000) / 10000); 
      suddenDeathBorder = Math.min(phases * UNIT, Math.min(CW, CH) / 2 - 2 * UNIT);
    }
  }
  
  syncFromPlayers();
  // Provide prev states for swap logic
  _prevH1 = players[0] ? players[0]._prevH : null;
  _prevH2 = players[1] ? players[1]._prevH : null;
  
  checkCollisions();
}

function gameLoop() { tickGame(); draw(); }

function hostGameLoop() {
  if (!roomRef) return;
  tickGame();
  draw();
  syncRoomState();
}

// ── AI Logic ──────────────────────────────────────────────
let aiDifficulty = "medium";

function aiTick() {
  if (gameOver || !players[1] || !players[1].alive) return;
  const ai = players[1].snake[0];
  let bestDir = dir2;

  if (aiDifficulty === "impossible" || aiDifficulty === "hard") {
    bestDir = smartAI(ai, food);
  } else {
    let target = food;
    if (aiDifficulty === "easy") {
      // Easy wanders randomly 60% of the time, 40% goes for food
      if (Math.random() < 0.6) {
        target = { x: ai.x + (Math.random() - 0.5) * 500, y: ai.y + (Math.random() - 0.5) * 500 };
      }
    }
    
    if (target) {
      const dx = target.x - ai.x, dy = target.y - ai.y;
      const preferred = [];
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > 0) preferred.push("RIGHT"); else if (dx < 0) preferred.push("LEFT");
        if (dy > 0) preferred.push("DOWN"); else if (dy < 0) preferred.push("UP");
      } else {
        if (dy > 0) preferred.push("DOWN"); else if (dy < 0) preferred.push("UP");
        if (dx > 0) preferred.push("RIGHT"); else if (dx < 0) preferred.push("LEFT");
      }
      for (const d of ["UP","DOWN","LEFT","RIGHT"]) { if (!preferred.includes(d)) preferred.push(d); }
      for (const d of preferred) { if (d !== OPPOSITE[dir2]) { bestDir = d; break; } }
    }
  }
  applyDirection("p2", bestDir);
}

function smartAI(head, goal) {
  const dirs = ["UP", "DOWN", "LEFT", "RIGHT"];
  let target = goal;

  // Impossible aggressive logic: if near player, prioritize cutting them off
  if (aiDifficulty === "impossible") {
    const playerHead = snake1[0];
    const dToPlayer = Math.abs(head.x - playerHead.x) + Math.abs(head.y - playerHead.y);
    if (dToPlayer < UNIT * 8) {
      target = playerHead;
    }
  }

  let bestDir = null, bestDist = Infinity;
  for (const d of dirs) {
    if (d === OPPOSITE[dir2]) continue;
    const n = { ...head };
    if (d === "UP") n.y -= UNIT; if (d === "DOWN") n.y += UNIT;
    if (d === "LEFT") n.x -= UNIT; if (d === "RIGHT") n.x += UNIT;
    wrap(n);

    let blocked = false;
    // Check own body
    for (let i = 1; i < snake2.length; i++) { if (hit(n, snake2[i])) { blocked = true; break; } }
    // Check opponent 1
    if (!blocked) for (const s of snake1) { if (hit(n, s)) { blocked = true; break; } }
    // Check Sudden Death borders
    if (!blocked && gameModeSetting === "sudden_death" && suddenDeathBorder > 0) {
      if (n.x < suddenDeathBorder || n.x >= CW - suddenDeathBorder || n.y < suddenDeathBorder || n.y >= CH - suddenDeathBorder) {
        blocked = true;
      }
    }

    if (blocked) continue;
    const dist = Math.abs(n.x - target.x) + Math.abs(n.y - target.y);
    if (dist < bestDist) { bestDist = dist; bestDir = d; }
  }
  return bestDir || dir2;
}

// ── Direction Application ─────────────────────────────────
function applyDirection(player, nextDir) {
  if (!nextDir || gameOver) return;
  if (mode === "online" && !matchmakingInBackground) {
    // In online mode, only allow controlling your own snake
    const local = playerRole === "player2" ? "p2" : "p1";
    if (player !== local) return;
  }
  const cur = player === "p1" ? dir1 : dir2;
  if (cur === OPPOSITE[nextDir]) return;
  if (player === "p1") dir1 = nextDir; else dir2 = nextDir;

  // Sync direction to Firebase immediately (not during background AI)
  if (mode === "online" && roomRef && !matchmakingInBackground) {
    const roleKey = playerRole;
    roomRef.child("players/" + roleKey + "/direction").set(nextDir)
      .catch(e => console.error("[dir] sync error:", e));
  }
}

// ── Firebase Serialization ────────────────────────────────
function serSnake(s) { return s.map(p => ({ x: p.x, y: p.y })); }

function serState() {
  return {
    snake1: serSnake(snake1), snake2: serSnake(snake2),
    snake3: serSnake(snake3), snake4: serSnake(snake4),
    food: { x: food.x, y: food.y },
    score1: score1, score2: score2, score3: score3, score4: score4,
    dir1: dir1, dir2: dir2, dir3: dir3, dir4: dir4,
    suddenDeathBorder: suddenDeathBorder,
    gameOver: gameOver, winner: winner
  };
}

let _syncInFlight = false;
let _syncPending = false;

function syncRoomState() {
  if (!roomRef) return;
  if (_syncInFlight) { _syncPending = true; return; }
  _syncInFlight = true;
  roomRef.child("game").set(serState())
    .catch(e => console.error("[sync] error:", e))
    .finally(() => {
      _syncInFlight = false;
      if (_syncPending) { _syncPending = false; syncRoomState(); }
    });
}

// ── Firebase Data Normalization ───────────────────────────
function normSnake(raw, fallback) {
  if (!raw) return fallback;
  const arr = Array.isArray(raw) ? raw : Object.keys(raw).sort((a,b) => +a - +b).map(k => raw[k]);
  const segs = arr.filter(s => s && typeof s.x === "number" && typeof s.y === "number").map(s => ({ x: s.x, y: s.y }));
  return segs.length > 0 ? segs : fallback;
}
function normPt(p, fallback) {
  return (p && typeof p.x === "number" && typeof p.y === "number") ? { x: p.x, y: p.y } : fallback;
}

// ══════════════════════════════════════════════════════════
//  MULTIPLAYER — Room Listener (the core of online play)
// ══════════════════════════════════════════════════════════
function bindRoomListener() {
  if (!roomRef) { console.error("[Room] Cannot bind: roomRef is null"); return; }
  const roomKey = roomRef.key;
  console.log("[Room] Binding .on('value') listener for: rooms/" + roomKey);

  roomListener = function(snap) {
    const room = snap.val();
    console.log("[Room] ROOM UPDATE:", JSON.stringify(room ? { players: Object.keys(room.players || {}), status: room.status, gameOver: room.game && room.game.gameOver } : null));

    if (!room) {
      console.log("[Room] Room was deleted");
      clearGameTimer();
      clearPollInterval();
      showGameStatus("Room closed.");
      return;
    }

    const roomPlayers = room.players || {};
    const g = room.game || {};
    if (room.gameMode) gameModeSetting = room.gameMode;

    // ── Join/Leave toasts ──
    for (const k of Object.keys(roomPlayers)) {
      if (!previousPlayers[k] && roomPlayers[k]) {
        showToast((roomPlayers[k].name || k) + " joined");
        sfxJoin();
      }
    }
    for (const k of Object.keys(previousPlayers)) {
      if (!roomPlayers[k] && previousPlayers[k]) {
        showToast((previousPlayers[k].name || k) + " left");
        sfxLeave();
      }
    }
    previousPlayers = {};
    for (const k of Object.keys(roomPlayers)) {
      previousPlayers[k] = roomPlayers[k] ? { name: roomPlayers[k].name } : null;
    }

    // ── Player count indicator ──
    updatePlayerCount(roomPlayers);

    // ── Always sync player names ──
    player1Name = (roomPlayers.player1 && roomPlayers.player1.name) || "P1";
    if (matchmakingInBackground) {
      player2Name = "AI";
    } else {
      player2Name = (roomPlayers.player2 && roomPlayers.player2.name) || "P2";
    }
    updatePlayerLegend();

    // ── CRITICAL: Always read OPPONENTs direction from Firebase ──
    if (playerRole === "player1") {
      if (roomPlayers.player2 && roomPlayers.player2.direction) dir2 = roomPlayers.player2.direction;
      if (roomPlayers.player3 && roomPlayers.player3.direction) dir3 = roomPlayers.player3.direction;
      if (roomPlayers.player4 && roomPlayers.player4.direction) dir4 = roomPlayers.player4.direction;
    } else {
      if (roomPlayers.player1 && roomPlayers.player1.direction) dir1 = roomPlayers.player1.direction;
      if (roomPlayers.player2 && roomPlayers.player2.direction && playerRole !== "player2") dir2 = roomPlayers.player2.direction;
      if (roomPlayers.player3 && roomPlayers.player3.direction && playerRole !== "player3") dir3 = roomPlayers.player3.direction;
      if (roomPlayers.player4 && roomPlayers.player4.direction && playerRole !== "player4") dir4 = roomPlayers.player4.direction;
    }

    // ── Guest: sync full game state from host ──
    if (playerRole !== "player1") {
      snake1 = normSnake(g.snake1, snake1);
      snake2 = normSnake(g.snake2, snake2);
      snake3 = normSnake(g.snake3, snake3);
      snake4 = normSnake(g.snake4, snake4);
      food   = normPt(g.food, food);
      if (typeof g.score1 === "number") score1 = g.score1;
      if (typeof g.score2 === "number") score2 = g.score2;
      if (typeof g.score3 === "number") score3 = g.score3;
      if (typeof g.score4 === "number") score4 = g.score4;
      if (typeof g.dir1 === "string") dir1 = g.dir1;
      if (typeof g.dir2 === "string") dir2 = g.dir2;
      if (typeof g.dir3 === "string") dir3 = g.dir3;
      if (typeof g.dir4 === "string") dir4 = g.dir4;
      if (typeof g.suddenDeathBorder === "number") suddenDeathBorder = g.suddenDeathBorder;

      if (g.gameOver && !gameOver) {
        gameOver = true;
        winner = g.winner || null;
        clearGameTimer();
        sfxGameOver();
        stopBGM();
      }
    }

    // ── Status display ──
    const hasP2 = Boolean(roomPlayers.player2);
    if (hasP2) {
      showGameStatus(currentRoomId + " \u2014 " + player1Name + " vs " + player2Name);
      hideStatus();
    } else if (!matchmakingInBackground) {
      showGameStatus("Room " + currentRoomId + " \u2014 Waiting for opponent...");
    }

    // ── Try AI button visibility ──
    const tryBtn = document.getElementById("tryAIBtn");
    if (tryBtn) {
      tryBtn.style.display = (matchmakingActive && !hasP2 && !matchmakingInBackground) ? "inline-flex" : "none";
    }

    // ── Host: start game when player2 joins ──
    if (playerRole === "player1") {
      if (hasP2 && (!gameOver || matchmakingInBackground)) {
        if (matchmakingInBackground) {
          // Player found while playing AI! Switch to online
          console.log("[Room] P2 joined during background AI! Switching to online...");
          clearAiTimer();
          clearGameTimer();
          matchmakingInBackground = false;
          matchmakingActive = false;
          if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
          clearPollInterval();
          mode = "online";
          player2Name = (roomPlayers.player2 && roomPlayers.player2.name) || "P2";
          updatePlayerLegend();
          resetGameState();
          interval = setInterval(hostGameLoop, GAME_SPEED);
          startBGM();
          syncRoomState();
          // Update UI
          const mmBar = document.getElementById("matchmakingBar");
          if (mmBar) mmBar.style.display = "none";
          showGame(true, false);
          showCopyBtn(currentRoomId);
          showToast("Opponent found! Game starting...");
          sfxJoin();
        } else if (!interval) {
          console.log("[Room] P2 joined via listener! Starting game loop.");
          matchmakingActive = false;
          if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
          clearPollInterval();
          resetGameState();
          interval = setInterval(hostGameLoop, GAME_SPEED);
          startBGM();
          syncRoomState();
        }
      } else if (!hasP2 && !matchmakingInBackground) {
        clearGameTimer();
      }
    }

    // ── Restart votes ──
    const votes = room.restartVotes || {};
    if (votes.player1 && votes.player2) {
      if (playerRole === "player2") {
        gameOver = false; winner = null;
        showToast("Game restarted!");
        startBGM();
      }
    } else if (votes.player1 && playerRole === "player2") {
      showGameStatus(currentRoomId + " \u2014 Opponent wants to restart.");
    } else if (votes.player2 && playerRole === "player1") {
      showGameStatus(currentRoomId + " \u2014 Opponent wants to restart.");
    }

    draw();
  };

  roomRef.on("value", roomListener);
  console.log("[Room] Listener registered successfully");
}

// ══════════════════════════════════════════════════════════
//  GAME MODE STARTERS
// ══════════════════════════════════════════════════════════
function startLocal() {
  let gmInput = document.getElementById("gameModeInput");
  const preliminaryMode = gmInput ? gmInput.value : "normal";
  if (preliminaryMode === "last_man") {
    alert("Last Man Standing mode is purely for Online Multiplayer (3+ players). Please select a different mode.");
    return;
  }
  
  sfxClick();
  stopCurrentSession();
  gameModeSetting = preliminaryMode;
  
  mode = "local";
  player1Name = getPlayerName("P1");
  player2Name = "P2";
  initGame(gameLoop);
  showGame(false, true);
  showGameStatus("Local 2P");
}

function startAI() {
  sfxClick();
  document.getElementById("aiModal").style.display = "flex";
}
function closeAIModal() {
  document.getElementById("aiModal").style.display = "none";
}

function startAIWithDiff(diff) {
  sfxClick();
  closeAIModal();
  
  if (matchmakingInBackground) {
    aiDifficulty = diff;
    clearAiTimer();
    const speeds = { easy: 350, medium: 250, hard: 150, impossible: 90 };
    aiInterval = setInterval(aiTick, speeds[diff] || 200);
    showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")");
    updateAIDifficultyBtn(diff);
    showToast("AI difficulty changed to " + diff);
    return;
  }
  
  if (_aiModalForMatchmaking) {
    _aiModalForMatchmaking = false;
    startAIWhileMatchmaking(diff);
    return;
  }
  
  // If already in AI mode, just update speed without resetting state if possible
  if (mode === "ai" && interval && !gameOver) {
    aiDifficulty = diff;
    clearAiTimer();
    const speeds = { easy: 350, medium: 250, hard: 150, impossible: 90 };
    aiInterval = setInterval(aiTick, speeds[diff] || 200);
    showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")");
    updateAIDifficultyBtn(diff);
    showToast("AI difficulty changed to " + diff);
    return;
  }

  stopCurrentSession();
  let gmInput = document.getElementById("gameModeInput");
  const preliminaryMode = gmInput ? gmInput.value : "normal";
  if (preliminaryMode === "last_man") {
    alert("Last Man Standing mode is purely for Online Multiplayer (3+ players).");
    return;
  }
  
  gameModeSetting = preliminaryMode;
  mode = "ai";
  aiDifficulty = diff;
  player1Name = getPlayerName("P1");
  player2Name = "AI";
  initGame(gameLoop);
  showGame(true, false);
  const speeds = { easy: 350, medium: 250, hard: 150, impossible: 90 };
  aiInterval = setInterval(aiTick, speeds[diff] || 200);
  showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")");
  updateAIDifficultyBtn(diff);
}

function tryAIWhileWaiting() {
  sfxClick();
  _aiModalForMatchmaking = true;
  document.getElementById("aiModal").style.display = "flex";
}

function startAIWhileMatchmaking(diff) {
  // Start AI game but keep room listener alive for background matchmaking
  matchmakingInBackground = true;
  aiDifficulty = diff;
  player2Name = "AI";
  updatePlayerLegend();

  // Stop existing waiting state timers but NOT the room listener
  clearGameTimer();
  clearAiTimer();
  resetGameState();

  // Start AI game loop (local only, no Firebase sync)
  interval = setInterval(gameLoop, GAME_SPEED);
  const speeds = { easy: 350, medium: 250, hard: 150, impossible: 90 };
  aiInterval = setInterval(aiTick, speeds[diff] || 200);

  // Update UI
  showGame(true, false);
  showCopyBtn(currentRoomId);
  const tryBtn = document.getElementById("tryAIBtn");
  if (tryBtn) tryBtn.style.display = "none";
  const mmBar = document.getElementById("matchmakingBar");
  if (mmBar) mmBar.style.display = "flex";
  showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")");
  updateAIDifficultyBtn(diff);

  startBGM();
  draw();
}

function cancelBackgroundMatchmaking() {
  sfxClick();
  matchmakingInBackground = false;
  matchmakingActive = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }

  // Clean up room in Firebase
  if (roomRef && playerRole === "player1") {
    const refToKill = roomRef;
    roomRef = null; // null early to prevent listener activity
    refToKill.remove().catch(() => {});
  }
  
  detachRoom();

  // Keep AI game running as standalone
  mode = "ai";
  const mmBar = document.getElementById("matchmakingBar");
  if (mmBar) mmBar.style.display = "none";
  hideCopyBtn();
  const pcEl = document.getElementById("playerCount");
  if (pcEl) pcEl.style.display = "none";
  showGameStatus("vs AI (" + aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1) + ")");
  showToast("Matchmaking cancelled. AI game continues.");
}

// ══════════════════════════════════════════════════════════
//  ONLINE: CREATE ROOM
// ══════════════════════════════════════════════════════════
function createRoom(isPublic) {
  sfxClick();
  const roomId = isPublic ? genRoomId() : (getRoomId() || genRoomId());
  const pName = getPlayerName("P1");

  stopCurrentSession();
  mode = "online";
  currentRoomId = roomId;
  playerRole = "player1";
  player1Name = pName;
  player2Name = "Waiting...";
  if (roomInp) roomInp.value = roomId;
  resetGameState();

  console.log("[Create] Room:", roomId, "Player:", pName);

  const ref = db.ref("rooms/" + roomId);
  roomRef = ref;

  // Fire-and-forget write
  let gmInput = document.getElementById("gameModeInput");
  gameModeSetting = gmInput ? gmInput.value : "normal";

  ref.set({
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    status: "waiting",
    roomType: isPublic ? "public" : "private",
    gameMode: gameModeSetting,
    players: {
      player1: { name: pName, direction: "RIGHT", joinedAt: Date.now() }
    },
    game: serState()
  }).then(() => {
    console.log("[Create] Write confirmed by server");
  }).catch(e => {
    console.error("[Create] Write FAILED:", e);
    showToast("Room creation failed: " + e.message);
  });

  // Only clean up player1 on disconnect (don't delete entire room)
  ref.child("players/player1").onDisconnect().remove().catch(() => {});
  ref.child("status").onDisconnect().set("abandoned").catch(() => {});

  // Show UI immediately
  showGame(true, false);
  showGameStatus("Room: " + roomId + " \u2014 Waiting for opponent...");
  showCopyBtn(roomId);
  hideStatus();
  bindRoomListener();
  // Start polling as a cross-device fallback
  startPollForPlayer2();
  draw();
}

// ══════════════════════════════════════════════════════════
//  ONLINE: JOIN ROOM
// ══════════════════════════════════════════════════════════
function joinRoom() {
  sfxClick();
  const roomId = getRoomId();
  if (!roomId) { showStatus("Enter a room code first."); return; }
  const pName = getPlayerName("Guest");

  showStatus("Joining room " + roomId + "...");
  console.log("[Join] Room:", roomId, "Player:", pName);

  const ref = db.ref("rooms/" + roomId);

  ref.once("value").then(snap => {
    if (!snap.exists()) {
      showStatus("Room " + roomId + " does not exist.");
      return;
    }
    const roomData = snap.val();
    const rp = roomData.players || {};
    
    // Find empty slot (p1 is always host)
    const slots = ["player2", "player3", "player4"];
    let joinSlot = "";
    for (const s of slots) {
      if (!rp[s]) { joinSlot = s; break; }
    }
    
    if (!joinSlot) {
      showStatus("Room " + roomId + " is full (4/4).");
      return;
    }

    // Room is open — join it
    stopCurrentSession();
    mode = "online";
    currentRoomId = roomId;
    playerRole = joinSlot;
    roomRef = ref;
    
    // Default directions for different slots
    const slotConfigs = {
      player2: { dir: "LEFT", nameVar: "player2Name" },
      player3: { dir: "DOWN", nameVar: "player3Name" },
      player4: { dir: "UP",   nameVar: "player4Name" }
    };
    
    const config = slotConfigs[joinSlot];
    if (joinSlot === "player2") player2Name = pName;
    else if (joinSlot === "player3") player3Name = pName;
    else if (joinSlot === "player4") player4Name = pName;
    
    player1Name = (rp.player1 && rp.player1.name) || "P1";
    
    resetGameState();

    const updateData = {};
    updateData["players/" + joinSlot] = { name: pName, direction: config.dir, joinedAt: Date.now() };
    
    // If we have 2+ players, game is technically active
    updateData["status"] = "waiting"; 

    ref.update(updateData).then(() => {
      console.log("[Join] Assigned slot:", joinSlot);
    }).catch(e => {
      console.error("[Join] Write failed:", e);
      showToast("Join failed: " + e.message);
    });

    ref.child("players/" + joinSlot).onDisconnect().remove().catch(() => {});

    // Show UI immediately
    showGame(true, false);
    showCopyBtn(roomId);
    hideStatus();
    startBGM();
    bindRoomListener();
    console.log("[Join] UI shown, listener bound");
  }).catch(e => {
    console.error("[Join] Read failed:", e);
    showStatus("Cannot read room: " + e.message);
  });
}

// ══════════════════════════════════════════════════════════
//  ONLINE: MATCHMAKING (Play Online)
// ══════════════════════════════════════════════════════════
function startMatchmaking() {
  sfxClick();
  matchmakingActive = true;
  showStatus("Searching for opponent...");
  const cmBtn = document.getElementById("cancelMatchBtn");
  if (cmBtn) cmBtn.style.display = "inline-flex";
  console.log("[Match] Starting matchmaking...");

  // Start suggestion timer (fires after 8s if still waiting)
  matchmakingTimeout = setTimeout(() => {
    if (matchmakingActive && !interval && !gameOver && currentRoomId) {
      db.ref("rooms/" + currentRoomId + "/players").once("value").then(snap => {
        const pObj = snap.val() || {};
        const count = Object.keys(pObj).length;
        // Only show if still alone (host only)
        if (count < 2 && playerRole === "player1") {
          showGameStatus(currentRoomId + " \u2014 No players found yet. Try AI while waiting?");
          showToast("No players found yet. Try AI mode?");
        }
      });
    }
  }, 8000);

  db.ref("rooms")
    .orderByChild("status")
    .equalTo("waiting")
    .limitToFirst(10)
    .once("value")
    .then(snap => {
      if (!matchmakingActive) return; // cancelled
      const rooms = snap.val();
      console.log("[Match] Rooms found:", rooms ? Object.keys(rooms).length : 0);

      if (rooms) {
        for (const [id, room] of Object.entries(rooms)) {
          if (room.roomType !== "public") continue;
          
          // Count players in room
          const pCount = room.players ? Object.keys(room.players).length : 0;
          if (pCount > 0 && pCount < 4) {
            const age = room.createdAt ? Date.now() - room.createdAt : 0;
            if (age > 300000) {
              db.ref("rooms/" + id).remove().catch(() => {});
              continue;
            }
            console.log("[Match] Found public room with slots:", id, "Players:", pCount);
            if (roomInp) roomInp.value = id;
            joinRoom();
            return;
          }
        }
      }

      // No public room found — create a public one
      console.log("[Match] No public rooms available, creating new");
      showStatus("No opponents found. Creating room...");
      if (roomInp) roomInp.value = "";
      createRoom(true);
    }).catch(e => {
      console.error("[Match] Query failed:", e);
      // Fallback: create a public room
      showStatus("Search failed. Creating room...");
      if (roomInp) roomInp.value = "";
      createRoom(true);
    });
}

function cancelMatchmaking() {
  sfxClick();
  matchmakingActive = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
  const cmBtn = document.getElementById("cancelMatchBtn");
  if (cmBtn) cmBtn.style.display = "none";
  hideStatus();
  if (mode === "online" && roomRef) {
    goBack();
  } else {
    showMenu();
  }
}

// ══════════════════════════════════════════════════════════
//  UI FUNCTIONS
// ══════════════════════════════════════════════════════════
function goBack() {
  sfxClick();
  // Cancel matchmaking if active
  matchmakingActive = false;
  matchmakingInBackground = false;
  _aiModalForMatchmaking = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
  const cmBtn = document.getElementById("cancelMatchBtn");
  if (cmBtn) cmBtn.style.display = "none";
  const mmBar = document.getElementById("matchmakingBar");
  if (mmBar) mmBar.style.display = "none";
  // Clean up room in Firebase
  if ((mode === "online" || matchmakingInBackground) && roomRef) {
    if (playerRole === "player1") {
      roomRef.remove().catch(() => {});
    } else {
      roomRef.child("players/player2").remove().catch(() => {});
    }
  }
  stopCurrentSession();
  clearAiTimer();
  stopBGM();
  mode = "";
  gameOver = false;
  winner = null;
  hideCopyBtn();
  hideRestartBtn();
  showMenu();
}

// ── Rules Modal ───────────────────────────────────────────
function showRules() {
  sfxClick();
  document.getElementById("rulesModal").style.display = "flex";
}
function closeRules() {
  sfxClick();
  document.getElementById("rulesModal").style.display = "none";
}

// ── Copy Room Code ────────────────────────────────────────
function showCopyBtn(code) {
  const btn = document.getElementById("copyCodeBtn");
  if (btn) {
    btn.style.display = "inline-flex";
    btn.setAttribute("data-code", code);
  }
  // Make game status bar clickable to copy room code
  if (gameStatEl) {
    gameStatEl.classList.add("has-room");
    gameStatEl.title = "Tap to copy room code: " + code;
    gameStatEl.onclick = function() { doCopy(code); };
    gameStatEl.ontouchend = function(e) { e.preventDefault(); doCopy(code); };
  }
}
function hideCopyBtn() {
  const btn = document.getElementById("copyCodeBtn");
  if (btn) btn.style.display = "none";
  if (gameStatEl) {
    gameStatEl.classList.remove("has-room");
    gameStatEl.title = "";
    gameStatEl.onclick = null;
    gameStatEl.ontouchend = null;
  }
}
function copyRoomCode() {
  sfxClick();
  const btn = document.getElementById("copyCodeBtn");
  const code = btn ? btn.getAttribute("data-code") : currentRoomId;
  if (code) doCopy(code);
}
function doCopy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("Copied: " + text)).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch(e) {}
  document.body.removeChild(ta);
  showToast("Copied: " + text);
}

// ── Restart ───────────────────────────────────────────────
function showRestartBtn() {
  const btn = document.getElementById("restartBtn");
  if (btn) btn.style.display = "inline-flex";
}
function hideRestartBtn() {
  const btn = document.getElementById("restartBtn");
  if (btn) btn.style.display = "none";
}

function restartGame() {
  sfxClick();
  if (mode === "ai" || mode === "local" || matchmakingInBackground) {
    if (mode === "ai" || matchmakingInBackground) {
      const diff = aiDifficulty;
      clearAiTimer(); clearGameTimer();
      resetGameState();
      interval = setInterval(gameLoop, GAME_SPEED);
      const speeds = { easy: 350, medium: 250, hard: 150, impossible: 90 };
      aiInterval = setInterval(aiTick, speeds[diff] || 200);
    } else {
      clearGameTimer();
      resetGameState();
      interval = setInterval(gameLoop, GAME_SPEED);
    }
    startBGM(); draw();
    showToast("Game restarted!");
  } else if (mode === "online" && roomRef) {
    roomRef.child("restartVotes/" + playerRole).set(true);
    showToast("Restart vote cast.");
    roomRef.child("restartVotes").once("value").then(snap => {
      const votes = snap.val() || {};
      if (votes.player1 && votes.player2) {
        roomRef.child("restartVotes").remove();
        if (playerRole === "player1") {
          resetGameState();
          clearGameTimer();
          interval = setInterval(hostGameLoop, GAME_SPEED);
          syncRoomState();
          startBGM(); draw();
        }
        showToast("Game restarted!");
      }
    });
  }
}

// ── Bug Report ────────────────────────────────────────────
function showBugReport() {
  sfxClick();
  document.getElementById("bugModal").style.display = "flex";
}
function closeBugReport() {
  sfxClick();
  document.getElementById("bugModal").style.display = "none";
}
function sendBugReport() {
  sfxClick();
  const ta = document.getElementById("bugText");
  const text = ta ? ta.value.trim() : "";
  if (!text) { showToast("Please describe the bug first."); return; }

  // Use AJAX instead of form submission to prevent opening a new tab
  fetch("https://formsubmit.co/ajax/harshitrawat3125@gmail.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      _subject: "Snake Battle Bug Report",
      message: text,
      _captcha: "false"
    })
  })
  .then(res => res.json())
  .then(data => {
    ta.value = "";
    closeBugReport();
    showToast("Bug report sent!");
  })
  .catch(e => {
    console.error("Bug report failed:", e);
    showToast("Failed to send report. Please try again later.");
  });
}

// ── Input Handling ────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  const k = e.key;

  if (mode === "online") {
    // Online: ALL keys control YOUR snake
    const p = playerRole === "player2" ? "p2" : "p1";
    if (k === "w" || k === "W" || k === "ArrowUp")    { e.preventDefault(); applyDirection(p, "UP"); }
    if (k === "s" || k === "S" || k === "ArrowDown")  { e.preventDefault(); applyDirection(p, "DOWN"); }
    if (k === "a" || k === "A" || k === "ArrowLeft")  { e.preventDefault(); applyDirection(p, "LEFT"); }
    if (k === "d" || k === "D" || k === "ArrowRight") { e.preventDefault(); applyDirection(p, "RIGHT"); }
  } else if (mode === "ai") {
    // AI mode: ALL keys control YOUR snake (P1)
    if (k === "w" || k === "W" || k === "ArrowUp")    { e.preventDefault(); applyDirection("p1", "UP"); }
    if (k === "s" || k === "S" || k === "ArrowDown")  { e.preventDefault(); applyDirection("p1", "DOWN"); }
    if (k === "a" || k === "A" || k === "ArrowLeft")  { e.preventDefault(); applyDirection("p1", "LEFT"); }
    if (k === "d" || k === "D" || k === "ArrowRight") { e.preventDefault(); applyDirection("p1", "RIGHT"); }
  } else {
    // Local 2P: WASD = P1, Arrows = P2
    if (k === "w" || k === "W") applyDirection("p1", "UP");
    if (k === "s" || k === "S") applyDirection("p1", "DOWN");
    if (k === "a" || k === "A") applyDirection("p1", "LEFT");
    if (k === "d" || k === "D") applyDirection("p1", "RIGHT");
    if (k === "ArrowUp")    { e.preventDefault(); applyDirection("p2", "UP"); }
    if (k === "ArrowDown")  { e.preventDefault(); applyDirection("p2", "DOWN"); }
    if (k === "ArrowLeft")  { e.preventDefault(); applyDirection("p2", "LEFT"); }
    if (k === "ArrowRight") { e.preventDefault(); applyDirection("p2", "RIGHT"); }
  }
});

// Mobile d-pad
let _lastMobileDir = 0;
function mobileDir(pIdx, dir) {
  const now = Date.now();
  if (now - _lastMobileDir < 60) return;
  _lastMobileDir = now;
  sfxClick();
  if (pIdx === 0) {
    if (mode === "online") applyDirection(playerRole === "player2" ? "p2" : "p1", dir);
    else applyDirection("p1", dir);
  } else if (pIdx === 1) {
    applyDirection("p1", dir);
  } else if (pIdx === 2) {
    applyDirection("p2", dir);
  }
}

// ── Initialization ────────────────────────────────────────
resetGameState();
draw();
showMenu();
updateSoundBtns();
console.log("[Init] Snake Battle v4 loaded. DB:", firebaseConfig.databaseURL);
