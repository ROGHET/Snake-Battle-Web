/* ═══════════════════════════════════════════════════════════
   SNAKE BATTLE — Game Engine v5
   Fixes: P3/P4 spawn, join lag, mode mismatch
   New: Power-ups, Leaderboard, Blitz mode, Sudden Death polish
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
const CW = 1000;
const CH = 660;
const GAME_SPEED = 120;
const START_SCORE = 30;
const OPPOSITE = { UP:"DOWN", DOWN:"UP", LEFT:"RIGHT", RIGHT:"LEFT" };
const COLORS = [
  { main:"#00ff88", dim:"#009955", glow:"rgba(0,255,136,", name:"Green"  },
  { main:"#ff4466", dim:"#aa1133", glow:"rgba(255,68,102,",name:"Coral"  },
  { main:"#ffcc00", dim:"#aa8800", glow:"rgba(255,204,0,", name:"Gold"   },
  { main:"#aa66ff", dim:"#6633aa", glow:"rgba(170,102,255,",name:"Purple"}
];

const roleToP = { player1:"p1", player2:"p2", player3:"p3", player4:"p4" };

// Sync rate-limiting: push to Firebase every N host ticks (reduces guest lag)
const SYNC_EVERY = 3;
let _syncFrameCount = 0;

// Power-up system constants
const PU_TYPES = ["invisibility", "shield", "double_damage", "double_points", "speed_up"];
const PU_CONFIG = {
  invisibility:  { label:"GHOST", color:"#ffcc00", desc:"Invisibility (Can't eat)" },
  shield:        { label:"SHLD", color:"#00e5ff", desc:"Shield"         },
  double_damage: { label:"2xDMG", color:"#ff4466", desc:"Double Damage"  },
  double_points: { label:"2xPTS", color:"#00ff88", desc:"Double Points"  },
  speed_up:      { label:"SPD",  color:"#ff8800", desc:"Speed Boost"    }
};

// Blitz mode
let blitzSpeedLevel = 0;

// ── King of the Castle State ──────────────────────────────
let crownHolder = null;  // pid or null
let crownPos = null;     // {x,y} when not held
let crownTimer = 0;      // countdown in ms
let crownTimerDuration = 60000; // default 1 minute
let crownTimeHeld = {};  // { p1: ms, p2: ms, ... }
let crownLastTick = 0;

// ── Detective Snake State ─────────────────────────────────
let detectivePlayer = null;  // pid of detective
let detectiveScore = 0;
let imposterScores = {};     // { pid: score }
let npcSnakes = [];          // [{ snake:[{x,y},...], dir, alive, id }]
let detectedPlayers = {};    // { pid: true } — players caught
let scanCharges = 0;         // detective has 3 scans
let scanHighlights = [];     // [{ x, y, radius, endTime }]
let detectiveTimer = 0;      // countdown in ms
let detectiveTimerDuration = 120000; // default 2 min
let teleportCharges = { p1:0, p2:0, p3:0, p4:0 }; 
let teleportFlash = 0;
let _lastTeleportTs = 0;
let _prevProcessedTeleportTs = 0;
let _processedArTs = { player1:0, player2:0, player3:0, player4:0 };

// ── Fullscreen & Swipe ────────────────────────────────────
let isFullscreen = false;
let _swipeStartX = 0, _swipeStartY = 0;

// ── Sound System ──────────────────────────────────────────
let audioCtx = null;
let bgmInterval = null;
let sfxOn = true;
let musicOn = false;
let globalVolume = 0.5;

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
    // Multiply base volume by globalVolume
    g.gain.setValueAtTime((vol || 0.1) * globalVolume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.01);
  } catch (e) {}
}
function sfxClick()    { playTone(800, 0.04, "square", 0.06); }
function sfxEat()      { playTone(400, 0.08, "sine", 0.1); setTimeout(() => playTone(600, 0.08, "sine", 0.1), 50); }
function sfxDamage()   { playTone(120, 0.22, "sawtooth", 0.14, 50); }
function sfxGameOver() { playTone(400, 0.15, "sine", 0.1); setTimeout(() => playTone(300, 0.15, "sine", 0.1), 120); setTimeout(() => playTone(200, 0.4, "sine", 0.1), 240); }
function sfxJoin()     { playTone(523, 0.1, "sine", 0.08); setTimeout(() => playTone(659, 0.12, "sine", 0.08), 90); }
function sfxLeave()    { playTone(659, 0.1, "sine", 0.08); setTimeout(() => playTone(440, 0.15, "sine", 0.08), 90); }
function sfxPowerUp()  { playTone(660, 0.06, "sine", 0.12); setTimeout(() => playTone(880, 0.1, "sine", 0.1), 60); setTimeout(() => playTone(1100, 0.12, "sine", 0.08), 130); }

// Mode-specific BGM note sequences
const BGM_NOTES_NORMAL = [261.63,311.13,349.23,392.00,466.16,392.00,349.23,311.13,261.63,349.23,466.16,349.23,311.13,392.00,523.25,392.00];
const BGM_NOTES_SUDDEN = [196.00,220.00,246.94,220.00,196.00,174.61,196.00,220.00,164.81,196.00,220.00,196.00,174.61,164.81,146.83,164.81];
const BGM_NOTES_BLITZ  = [523.25,587.33,659.25,783.99,880.00,783.99,659.25,587.33,523.25,659.25,880.00,783.99,659.25,523.25,659.25,783.99];
const BGM_NOTES_KING   = [392.00,440.00,493.88,523.25,587.33,523.25,493.88,440.00,392.00,329.63,349.23,392.00,440.00,523.25,493.88,440.00];
const BGM_NOTES_DETECT = [220.00,246.94,261.63,246.94,220.00,196.00,220.00,246.94,293.66,261.63,246.94,220.00,196.00,220.00,261.63,246.94];

function getBGMNotes() {
  if (gameModeSetting === "sudden_death") return BGM_NOTES_SUDDEN;
  if (gameModeSetting === "blitz") return BGM_NOTES_BLITZ;
  if (gameModeSetting === "king_castle") return BGM_NOTES_KING;
  if (gameModeSetting === "detective") return BGM_NOTES_DETECT;
  return BGM_NOTES_NORMAL;
}

function startBGM() {
  stopBGM(); 
  if (!musicOn) return;
  // Only play BGM if game area is visible
  if (gameEl && gameEl.style.display === "none") return;
  try {
    const c = getAudio(); let idx = 0;
    const notes = getBGMNotes();
    const tempo = (gameModeSetting === "blitz") ? 160 : 220;
    bgmInterval = setInterval(() => {
      if (!musicOn) { stopBGM(); return; }
      const freq = notes[idx % notes.length];
      const o = c.createOscillator(); const g = c.createGain();
      o.type = "square"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.04 * globalVolume, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.19); idx++;
    }, tempo);
  } catch (e) {}
}
function stopBGM() {
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}
function toggleMusic() {
  sfxClick();
  stopBGM(); // Always stop first to prevent overlapping audio loops
  musicOn = !musicOn;
  if (musicOn) startBGM();
  updateSoundBtns();
}
function toggleSfx()   { sfxOn = !sfxOn; if (sfxOn) sfxClick(); updateSoundBtns(); }
function updateSoundBtns() {
  const mb = document.getElementById("btnMusic"); const sb = document.getElementById("btnSfx");
  if (mb) { mb.classList.toggle("muted", !musicOn); mb.innerHTML = musicOn ? ICON_MUSIC_ON : ICON_MUSIC_OFF; }
  if (sb) { sb.classList.toggle("muted", !sfxOn);   sb.innerHTML = sfxOn   ? ICON_SFX_ON  : ICON_SFX_OFF;  }
}
function setVolume(v) {
  globalVolume = parseFloat(v);
  // If BGM is playing, it will pick up the new volume on next note
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg) {
  const c = document.getElementById("toastContainer"); if (!c) return;
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); t.classList.add("hide"); setTimeout(() => t.remove(), 500); }, 3000);
}

// ── Visual Effects ────────────────────────────────────────
let floatingTexts = [];
let screenFlash = 0;
function addFloatingText(x, y, text, col, showToPid = null) {
  floatingTexts.push({ x: x + UNIT / 2, y, text, col: col || "#ff4466", alpha: 1, life: 40, showToPid });
}
function updateFloatingTexts() {
  floatingTexts = floatingTexts.filter(t => { t.y -= 1.4; t.alpha -= 1 / t.life; t.life--; return t.life > 0; });
}
function triggerDamageFlash() {
  const el = document.getElementById("damageFlash"); if (!el) return;
  el.style.display = "block"; el.style.animation = "none"; void el.offsetWidth;
  el.style.animation = "flashFade 0.3s ease-out forwards";
  setTimeout(() => { el.style.display = "none"; }, 300);
}

// ── Guest render RAF loop (for smooth display between Firebase updates) ──
let _guestRafId = null;
function startGuestRenderLoop() {
  if (_guestRafId) return;
  const loop = () => {
    if (mode === "online" && playerRole !== "player1") {
      draw();
      _guestRafId = requestAnimationFrame(loop);
    } else {
      _guestRafId = null;
    }
  };
  _guestRafId = requestAnimationFrame(loop);
}
function stopGuestRenderLoop() {
  if (_guestRafId) { cancelAnimationFrame(_guestRafId); _guestRafId = null; }
}

// ── Game State ────────────────────────────────────────────
let mode = "";
let gameModeSetting = "normal"; // normal, sudden_death, last_man, blitz
let suddenDeathBorder = 0;
let gameStartTime = 0;
let activePlayerCount = 0;

function updateAIDifficultyBtn(diff) {
  const span = document.getElementById("currentAIDiff");
  if (span) span.innerText = (diff || "Medium").toUpperCase();
}

let interval = null;
let aiInterval = null;
let roomRef = null;
let roomListener = null;
let currentRoomId = "";
let playerRole = "";
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

// ── Power-up State ────────────────────────────────────────
let boardPowerUps = [];  // [{ x, y, type, id }]
let playerEffects = {};  // { "p1": {type, endTime} | null, ... }
let _puSpawnTimeout = null;

function initPlayerEffects() {
  playerEffects = { p1: null, p2: null, p3: null, p4: null };
}

function getEffect(pid) {
  const e = playerEffects[pid];
  return (e && Date.now() < e.endTime) ? e : null;
}

function setEffect(pid, type, duration) {
  if (playerEffects[pid] && playerEffects[pid].clearTimer) clearTimeout(playerEffects[pid].clearTimer);
  const clearTimer = setTimeout(() => { playerEffects[pid] = null; }, duration);
  playerEffects[pid] = { type, endTime: Date.now() + duration, clearTimer };
}

function consumeEffect(pid) {
  if (playerEffects[pid] && playerEffects[pid].clearTimer) clearTimeout(playerEffects[pid].clearTimer);
  playerEffects[pid] = null;
}

function schedulePowerUpSpawn() {
  if (_puSpawnTimeout) clearTimeout(_puSpawnTimeout);
  if (!interval || gameOver) return;
  if (gameModeSetting === "detective") return; // No power-ups in detective mode
  const delay = 12000 + Math.random() * 8000; // 12-20s
  _puSpawnTimeout = setTimeout(() => {
    if (!interval || gameOver) return;
    if (boardPowerUps.length < 2) {
      let allowedTypes = PU_TYPES;
      if (gameModeSetting === "king_castle") {
        allowedTypes = ["invisibility", "speed_up"]; // Only Ghost + Speed Up
      }
      const type = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
      const pos = randomFoodPos();
      boardPowerUps.push({ x: pos.x, y: pos.y, type, id: Date.now() });
    }
    schedulePowerUpSpawn();
  }, delay);
}

function checkPowerUpPickup(pid, snake) {
  if (!snake || !snake.length) return;
  const head = snake[0];
  for (let i = boardPowerUps.length - 1; i >= 0; i--) {
    const pu = boardPowerUps[i];
    if (head.x === pu.x && head.y === pu.y) {
      if (pid === crownHolder && (pu.type === "speed_up" || pu.type === "double_damage" || pu.type === "double_points" || pu.type === "invisibility")) {
        // Kings consume power-ups on touch even if they don't get the effect (clears the board)
        const p = players.find(player => player.id === pid);
        const now = Date.now();
        if (p && (!p._lastKingCoinMsg || now - p._lastKingCoinMsg > 1500)) {
          addFloatingText(head.x, head.y, "KINGS DON'T PICK COINS!", "#ffcc00", pid);
          p._lastKingCoinMsg = now;
        }
        boardPowerUps.splice(i, 1);
        sfxClick();
        continue; 
      }
      boardPowerUps.splice(i, 1);
      setEffect(pid, pu.type, 10000);
      const cfg = PU_CONFIG[pu.type] || {};
      const pname = pid === "p1" ? player1Name : pid === "p2" ? player2Name : pid === "p3" ? player3Name : player4Name;
      showToast(pname + ": " + (cfg.desc || pu.type) + "!");
      addFloatingText(head.x, head.y, cfg.label || "!", cfg.color || "#fff");
      sfxPowerUp();
      break;
    }
  }
}

function serEffects() {
  // Serialize without timers, just type + endTime
  const out = {};
  ["p1","p2","p3","p4"].forEach(pid => {
    const e = playerEffects[pid];
    out[pid] = (e && Date.now() < e.endTime) ? { type: e.type, endTime: e.endTime } : null;
  });
  return out;
}

function deserEffects(raw) {
  if (!raw) return;
  ["p1","p2","p3","p4"].forEach(pid => {
    const e = raw[pid];
    if (e && e.type && e.endTime && Date.now() < e.endTime) {
      // Restore effect without clearTimer (guest-side effects auto-expire by endTime check)
      playerEffects[pid] = { type: e.type, endTime: e.endTime, clearTimer: null };
    } else {
      playerEffects[pid] = null;
    }
  });
}

let invuln1 = 0, invuln2 = 0, invuln3 = 0, invuln4 = 0;
// ── players[] sync helpers ────────────────────────────────
function syncToPlayers() {
  const isKing = gameModeSetting === "king_castle";
  const isDetective = gameModeSetting === "detective";
  
  // In King mode, players are alive if score >= 0 (since they start at 0)
  // In other modes, they need score > 0
  const checkAlive = (score, snake) => {
    if (isKing) return snake && snake.length > 0;
    return score > 0 && snake && snake.length > 0;
  };

  players[0] = { id:"p1", name:player1Name, snake:snake1, dir:dir1, score:score1, alive:checkAlive(score1, snake1), color:COLORS[0], _prevH:_prevH1, invuln:invuln1 };
  players[1] = { id:"p2", name:player2Name, snake:snake2, dir:dir2, score:score2, alive:checkAlive(score2, snake2), color:COLORS[1], _prevH:_prevH2, invuln:invuln2 };
  players[2] = { id:"p3", name:player3Name, snake:snake3, dir:dir3, score:score3, alive:checkAlive(score3, snake3), color:COLORS[2], _prevH:null, invuln:invuln3 };
  players[3] = { id:"p4", name:player4Name, snake:snake4, dir:dir4, score:score4, alive:checkAlive(score4, snake4), color:COLORS[3], _prevH:null, invuln:invuln4 };
}
function syncFromPlayers() {
  if (players[0]) { snake1=players[0].snake; dir1=players[0].dir; score1=players[0].score; invuln1=players[0].invuln; }
  if (players[1]) { snake2=players[1].snake; dir2=players[1].dir; score2=players[1].score; invuln2=players[1].invuln; }
  if (players[2]) { snake3=players[2].snake; dir3=players[2].dir; score3=players[2].score; invuln3=players[2].invuln; }
  if (players[3]) { snake4=players[3].snake; dir4=players[3].dir; score4=players[3].score; invuln4=players[3].invuln; }
}

let _prevH1 = null, _prevH2 = null;

// ── Grid Pattern ──────────────────────────────────────────
let gridPattern = null;
function ensureGridPattern() {
  if (gridPattern) return;
  const pc = document.createElement("canvas"); pc.width = UNIT; pc.height = UNIT;
  const px = pc.getContext("2d"); px.strokeStyle = "rgba(255,255,255,0.05)"; px.lineWidth = 0.5;
  px.strokeRect(0, 0, UNIT, UNIT); gridPattern = ctx.createPattern(pc, "repeat");
}

// ── Reset / Init ──────────────────────────────────────────
function resetGameState() {
  const isKing = gameModeSetting === "king_castle";
  const isDetective = gameModeSetting === "detective";
  const startLen = isKing ? 2 : (isDetective ? 2 : 3);

  // Build snake arrays based on mode start length
  function makeSnake(x, y, dirX, dirY, len) {
    const s = [];
    for (let i = 0; i < len; i++) s.push({ x: x - dirX * UNIT * i, y: y - dirY * UNIT * i });
    return s;
  }

  snake1 = makeSnake(200, 300, 1, 0, startLen);
  snake2 = makeSnake(700, 300, -1, 0, startLen);
  dir1 = "RIGHT"; dir2 = "LEFT";

  // P3 & P4 only exist online (host spawns on join)
  if (mode !== "online") {
    snake3 = []; snake4 = []; score3 = 0; score4 = 0;
    dir3 = "DOWN"; dir4 = "UP";
  } else {
    if (!previousPlayers.player3) { snake3 = []; score3 = 0; }
    else { snake3 = makeSnake(440, 100, 0, -1, startLen); score3 = isKing ? 0 : (isDetective ? 5 : START_SCORE); }
    if (!previousPlayers.player4) { snake4 = []; score4 = 0; }
    else { snake4 = makeSnake(440, 500, 0, 1, startLen); score4 = isKing ? 0 : (isDetective ? 5 : START_SCORE); }
    dir3 = "DOWN"; dir4 = "UP";
  }

  score1 = isKing ? 0 : (isDetective ? 5 : START_SCORE);
  score2 = isKing ? 0 : (isDetective ? 5 : START_SCORE);

  syncToPlayers();
  activePlayerCount = players.filter(p => p && p.snake && p.snake.length > 0).length;
  food = randomFoodPos();

  // Global Mode State Resets
  detectiveScore = 0;
  imposterScores = {};
  npcSnakes = [];
  detectedPlayers = {};
  scanCharges = 0;
  scanHighlights = [];
  detectiveTimer = isDetective ? detectiveTimerDuration : 0;
  
  crownHolder = null;
  crownPos = isKing ? { x: Math.floor(CW / 2 / UNIT) * UNIT, y: Math.floor(CH / 2 / UNIT) * UNIT } : null;
  crownTimer = isKing ? crownTimerDuration : 0;
  crownTimeHeld = { p1: 0, p2: 0, p3: 0, p4: 0 };
  crownLastTick = Date.now();
  initPlayerEffects();
  teleportCharges = { p1: 2, p2: 2, p3: 2, p4: 2 };
  _processedArTs = { player1:0, player2:0, player3:0, player4:0 };

  if (isDetective) {
    // Assign detective (Host p1 is always detective for stability as requested)
    detectivePlayer = "p1";
    detectiveScore = 5;
    scanCharges = 3;
    const activePids = ["p1"];
    if (mode === "online") {
      if (snake2 && snake2.length) activePids.push("p2");
      if (snake3 && snake3.length) activePids.push("p3");
      if (snake4 && snake4.length) activePids.push("p4");
    } else {
      activePids.push("p2"); 
    }
    activePids.forEach(pid => {
      if (pid !== detectivePlayer) imposterScores[pid] = 0;
    });
    teleportCharges = 2; // Imposters get 2 teleports
    spawnDetectiveNPCs();
  }

  gameOver = false; winner = null;
  crownHolder = null;
  gameStartTime = Date.now();
  suddenDeathBorder = 0;
  blitzSpeedLevel = 0;
  floatingTexts = []; screenFlash = 0;
  _prevH1 = null; _prevH2 = null;
  invuln1 = 0; invuln2 = 0; invuln3 = 0; invuln4 = 0;

  updateRoleInfo();

  if (gameModeSetting === "sudden_death") {
    setTimeout(() => showToast("Sudden Death! Walls close in 10s."), 500);
  }
  if (gameModeSetting === "blitz") {
    setTimeout(() => showToast("BLITZ! Speed will increase every 10s."), 500);
  }
  if (isKing) {
    food = { x: -100, y: -100, id: "none" }; // Hide food in king mode
    setTimeout(() => showToast("King of the Castle! Grab the crown!"), 500);
  }
  if (isDetective) {
    setTimeout(() => {
      if (detectivePlayer) {
        const detName = detectivePlayer === "p1" ? player1Name : detectivePlayer === "p2" ? player2Name : detectivePlayer === "p3" ? player3Name : player4Name;
        showToast("Detective: " + detName + " — Find the imposters!");
      }
    }, 500);
  }
}

function spawnDetectiveNPCs() {
  npcSnakes = [];
  const count = 10 + Math.floor(Math.random() * 6); // 10-15
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * (CW / UNIT - 4) + 2) * UNIT;
    const y = Math.floor(Math.random() * (CH / UNIT - 6) + 3) * UNIT;
    const dirs = ["UP","DOWN","LEFT","RIGHT"];
    const d = dirs[Math.floor(Math.random() * 4)];
    const dx = d === "RIGHT" ? -1 : d === "LEFT" ? 1 : 0;
    const dy = d === "DOWN" ? -1 : d === "UP" ? 1 : 0;
    npcSnakes.push({
      snake: [{ x, y }, { x: x + dx * UNIT, y: y + dy * UNIT }],
      dir: d, alive: true, id: "npc_" + i,
      changeTimer: Math.floor(Math.random() * 20) + 10
    });
  }
}

function initGame(loopFn) {
  hideMenu();
  gameEl.style.display = "flex";
  if (gameStatEl) gameStatEl.style.display = "block";
  if (legendEl) legendEl.style.display = "flex";
  resetGameState();
  showControlsHint(); // Show "R to Restart | M for Menu"
  draw();
  _syncFrameCount = 0;
  interval = setInterval(loopFn, GAME_SPEED);
  startBGM();
  schedulePowerUpSpawn();
}
function hideMenu() {
  menuEl.style.display = "none";
  const mq = document.getElementById("marqueeContainer"); if (mq) mq.style.display = "none";
}

function clearGameTimer() {
  if (interval) { clearInterval(interval); interval = null; }
  if (_puSpawnTimeout) { clearTimeout(_puSpawnTimeout); _puSpawnTimeout = null; }
}
function clearAiTimer() { if (aiInterval) { clearInterval(aiInterval); aiInterval = null; } }

function detachRoom() {
  if (roomRef && roomListener) { try { roomRef.off("value", roomListener); } catch(e) {} }
  clearPollInterval();
  stopGuestRenderLoop();
  roomRef = null; roomListener = null; currentRoomId = ""; playerRole = "";
  previousPlayers = {};
}

let _pollInterval = null;
function clearPollInterval() { if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; } }

function startPollForPlayer2() {
  clearPollInterval();
  if (playerRole !== "player1" || !currentRoomId) return;
  _pollInterval = setInterval(() => {
    if (mode !== "online" || !currentRoomId || playerRole !== "player1" || interval) { clearPollInterval(); return; }
    db.ref("rooms/" + currentRoomId + "/players/player2").once("value").then(snap => {
      if (snap.exists() && !interval && !gameOver) {
        clearPollInterval();
        db.ref("rooms/" + currentRoomId).once("value").then(rs => {
          const room = rs.val();
          if (room && room.players && room.players.player2) {
            player2Name = room.players.player2.name || "P2";
            updatePlayerLegend();
            showGameStatus(currentRoomId + " \u2014 " + player1Name + " vs " + player2Name);
            hideStatus();
            if (!interval && !gameOver) {
              resetGameState();
              _syncFrameCount = 0;
              interval = setInterval(hostGameLoop, GAME_SPEED);
              startBGM(); syncRoomState(); schedulePowerUpSpawn();
            }
          }
        });
      }
    }).catch(() => {});
  }, 2000);
}

function stopCurrentSession() { clearGameTimer(); clearAiTimer(); detachRoom(); }

// ── UI State ──────────────────────────────────────────────
function isMobile() { return "ontouchstart" in window || navigator.maxTouchPoints > 0; }

function showMenu() {
  menuEl.style.display = "flex"; gameEl.style.display = "none";
  pcCtrl.style.display = "none"; mobSingle.style.display = "none"; mobLocal.style.display = "none";
  legendEl.style.display = "none"; hideCopyBtn(); hideRestartBtn(); hideStatus(); hideGameStatus();
  roomDisp.style.display = "none";
  const rm = document.getElementById("rulesMarquee"); if (rm) rm.style.display = "none";
  const rbt = document.getElementById("btnRulesInGame"); if (rbt) rbt.style.display = "none";
  const pcEl = document.getElementById("playerCount"); if (pcEl) pcEl.style.display = "none";
  const cmBtn = document.getElementById("cancelMatchBtn"); if (cmBtn) cmBtn.style.display = "none";
  const tryBtn = document.getElementById("tryAIBtn"); if (tryBtn) tryBtn.style.display = "none";
  const mmBar = document.getElementById("matchmakingBar"); if (mmBar) mmBar.style.display = "none";
  const mq = document.getElementById("marqueeContainer"); if (mq) mq.style.display = "block";
  
  const ri = document.getElementById("roleInfo"); if (ri) ri.innerHTML = "";
  const ch = document.getElementById("gameControlsHint"); if (ch) ch.style.display = "none";

  matchmakingActive = false; matchmakingInBackground = false; _aiModalForMatchmaking = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
  stopGuestRenderLoop();
  updateModeSummary();
  startMenuSnake();
}

function showGame(single, local) {
  menuEl.style.display = "none"; gameEl.style.display = "flex"; legendEl.style.display = "flex";
  const cmBtn = document.getElementById("cancelMatchBtn"); if (cmBtn) cmBtn.style.display = "none";
  showRestartBtn(); updatePlayerLegend();
  const mob = isMobile();
  pcCtrl.style.display    = (!mob && local) ? "flex" : "none";
  mobSingle.style.display = (mob && single) ? "flex" : "none";
  mobLocal.style.display  = (mob && local)  ? "flex" : "none";
  const rm = document.getElementById("rulesMarquee"); if (rm) rm.style.display = "block";
  const rbt = document.getElementById("btnRulesInGame"); if (rbt) rbt.style.display = "inline-flex";
  if (mob) setTimeout(() => gameEl.scrollIntoView({ behavior:"smooth", block:"start" }), 100);
  const diffBtn = document.getElementById("changeAIDiffBtn");
  if (diffBtn) diffBtn.style.display = (mode === "ai" || matchmakingInBackground) ? "inline-flex" : "none";
  
  stopMenuSnake();
}

function showStatus(msg) { statusEl.textContent = msg; statusEl.style.display = msg ? "block" : "none"; }
function hideStatus()    { statusEl.style.display = "none"; }
function showGameStatus(msg) { gameStatEl.textContent = msg; gameStatEl.style.display = msg ? "block" : "none"; }
function hideGameStatus()    { gameStatEl.style.display = "none"; }

// ── Player Helpers ────────────────────────────────────────
function getPlayerName(fallback) { const v = nameInp ? nameInp.value.trim() : ""; return v || fallback; }
function getRoomId() { return roomInp ? roomInp.value.trim().toUpperCase() : ""; }
function genRoomId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function updatePlayerLegend() {
  if (!legendEl) return;
  syncToPlayers();
  legendEl.innerHTML = "";
  const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";
  const isDetMode = gameModeSetting === "detective";
  
  players.forEach(p => {
    if (!p || !p.snake || (p.id !== "p1" && p.id !== "p2" && (!p.snake || !p.snake.length))) return;
    const d = document.createElement("div"); d.className = "legend-item";
    
    let scoreVal = (gameModeSetting === "detective" && p.id === detectivePlayer) ? detectiveScore : p.score;
    let showScore = true;
    
    // Privacy logic for Detective mode
    if (isDetMode) {
      if (p.id !== localPid && p.id !== detectivePlayer) {
        showScore = false; // Hide other imposters' scores/status
      }
    }

    const scoreText = (showScore && scoreVal !== undefined) ? 
      (' <span style="color:var(--cyan);margin-left:4px;font-weight:bold;">[' + scoreVal + ']</span>') : '';
    d.innerHTML = '<span class="legend-dot" style="background:' + p.color.main + '"></span>' + p.name + scoreText;
    legendEl.appendChild(d);
  });
}

function updatePlayerCount(playersRoom) {
  const el = document.getElementById("playerCount"); if (!el) return;
  const count = Object.keys(playersRoom || {}).filter(k => playersRoom[k]).length;
  el.textContent = "Players: " + count + "/4";
  el.style.display = mode === "online" ? "block" : "none";
}

// ── Food ──────────────────────────────────────────────────
function randomFoodPos() {
  const allSnakes = players.map(p => p ? p.snake : null).filter(s => s && s.length > 0);
  for (let i = 0; i < 300; i++) {
    const c = {
      x: Math.floor(Math.random() * (CW / UNIT)) * UNIT,
      y: Math.floor(Math.random() * (CH / UNIT)) * UNIT
    };
    if (c.y < UNIT * 2) continue;
    // Avoid sudden death zone
    if (gameModeSetting === "sudden_death" && suddenDeathBorder > 0) {
      if (c.x < suddenDeathBorder + UNIT || c.x >= CW - suddenDeathBorder - UNIT ||
          c.y < suddenDeathBorder + UNIT || c.y >= CH - suddenDeathBorder - UNIT) continue;
    }
    let ok = true;
    for (const s of allSnakes) { for (const seg of s) { if (seg.x===c.x && seg.y===c.y) { ok=false; break; } } if (!ok) break; }
    if (!ok) continue;
    for (const pu of boardPowerUps) { if (pu.x===c.x && pu.y===c.y) { ok=false; break; } }
    if (ok) return { ...c, id: Date.now() + "_" + Math.floor(Math.random() * 1000) };
  }
  return { x: UNIT * 5, y: UNIT * 5, id: "fixed" };
}
// Legacy alias used in some paths
function randomFood(snakes) { return randomFoodPos(); }

// ── Power-up Rendering ────────────────────────────────────
function drawPowerUps() {
  const t = Date.now();
  boardPowerUps.forEach(pu => {
    const cfg = PU_CONFIG[pu.type] || { color:"#fff", label:"?" };
    const pulse = 0.65 + 0.35 * Math.sin(t / 300);
    ctx.save();
    ctx.shadowColor = cfg.color; ctx.shadowBlur = 10 * pulse;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = cfg.color;
    ctx.fillRect(pu.x + 2, pu.y + 2, UNIT - 4, UNIT - 4);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.font = 'bold 7px "Share Tech Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText(cfg.label, pu.x + UNIT / 2, pu.y + UNIT / 2 + 3);
    ctx.restore();
  });
}

function drawEffectBadge(snake, pid) {
  const eff = getEffect(pid); if (!eff || !snake || !snake.length) return;
  const cfg = PU_CONFIG[eff.type] || { color:"#fff", label:"?" };
  const h = snake[0];
  const remaining = Math.ceil((eff.endTime - Date.now()) / 1000);
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = cfg.color;
  ctx.font = 'bold 8px "Share Tech Mono", monospace';
  ctx.textAlign = "center";
  ctx.shadowColor = cfg.color; ctx.shadowBlur = 6;
  ctx.fillText(cfg.label + (remaining > 0 ? " " + remaining : ""), h.x + UNIT / 2, h.y - 14);
  ctx.restore();
}

// ── Rendering ─────────────────────────────────────────────
function draw() {
  ctx.fillStyle = "#0a0a14"; ctx.fillRect(0, 0, CW, CH);
  ensureGridPattern();
  if (gridPattern) { ctx.fillStyle = gridPattern; ctx.fillRect(0, 0, CW, CH); }

  // Sudden Death border
  if (gameModeSetting === "sudden_death" && suddenDeathBorder > 0) {
    ctx.fillStyle = "rgba(255,0,0,0.35)";
    ctx.fillRect(0, 0, CW, suddenDeathBorder);
    ctx.fillRect(0, CH - suddenDeathBorder, CW, suddenDeathBorder);
    ctx.fillRect(0, suddenDeathBorder, suddenDeathBorder, CH - 2 * suddenDeathBorder);
    ctx.fillRect(CW - suddenDeathBorder, suddenDeathBorder, suddenDeathBorder, CH - 2 * suddenDeathBorder);
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = "rgba(255,0,0,0.75)"; ctx.font = 'bold 18px "Share Tech Mono", monospace';
      ctx.textAlign = "center"; ctx.fillText("SUDDEN DEATH — WALLS CLOSING", CW / 2, CH / 2); ctx.textAlign = "left";
    }
  }

  // Teleport Flash
  if (teleportFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${teleportFlash / 10})`;
    ctx.fillRect(0,0,CW,CH);
    teleportFlash--;
  }

  syncToPlayers();

  // Food (hide in king_castle mode)
  if (gameModeSetting !== "king_castle") {
    const fp = 0.6 + 0.4 * Math.sin(Date.now() / 250);
    ctx.globalAlpha = fp * 0.25; ctx.fillStyle = "#00e5ff";
    ctx.fillRect(food.x - 4, food.y - 4, UNIT + 8, UNIT + 8);
    ctx.globalAlpha = 1; ctx.fillStyle = "#00e5ff";
    ctx.fillRect(food.x + 2, food.y + 2, UNIT - 4, UNIT - 4);
  }

  // Power-ups
  drawPowerUps();

  // Crown (King of the Castle)
  if (gameModeSetting === "king_castle") {
    drawCrown();
  }

  // NPC snakes (Detective mode)
  if (gameModeSetting === "detective") {
    const npcColor = { main:"#88aa88", dim:"#556655", glow:"rgba(136,170,136," };
    npcSnakes.forEach(npc => {
      if (npc.alive && npc.snake && npc.snake.length > 0) {
        drawSnake(npc.snake, npcColor, null);
      }
    });
  }

  // Snakes (in detective mode, use neutral colors for camouflage)
  if (gameModeSetting === "detective") {
    const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";
    const myRole = (localPid === detectivePlayer) ? "detective" : (imposterScores[localPid] !== undefined ? "imposter" : "observer");
    const npcColor = { main:"#88aa88", dim:"#556655", glow:"rgba(136,170,136," };
    players.forEach(p => {
      if (p && p.snake && p.snake.length > 0) {
        if (p.id === detectivePlayer) {
          drawSnake(p.snake, { main:"#4488ff", dim:"#2255aa", glow:"rgba(68,136,255," }, p.name, myRole === "detective");
        } else if (detectedPlayers[p.id]) {
          // Dead/detected — don't draw
        } else {
          const isPImposter = (imposterScores[p.id] !== undefined);
          const showGlow = (myRole === "imposter" && isPImposter);
          // Stronger highlight for teammates
          drawSnake(p.snake, npcColor, showGlow ? p.name : null, showGlow, showGlow ? 2.2 : 1.0);
        }
      }
    });
  } else {
    // Normal snake rendering
    players.forEach(p => { if (p && p.snake && p.snake.length > 0) drawSnake(p.snake, p.color, p.name); });
  }

  // Scan highlights (Detective mode — visible to all)
  if (scanHighlights.length > 0) {
    const now = Date.now();
    scanHighlights = scanHighlights.filter(h => now < h.endTime);
    scanHighlights.forEach(h => {
      const remaining = (h.endTime - now) / 3000;
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.15 * Math.sin(now / 200);
      ctx.strokeStyle = "#ff4466";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(h.x + UNIT / 2, h.y + UNIT / 2, h.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,68,102,0.06)";
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ff4466";
      ctx.font = 'bold 10px "Share Tech Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("SCAN", h.x + UNIT / 2, h.y - h.radius - 5);
      ctx.restore();
    });
  }

  // Detective hat (drawn above detective's head)
  if (gameModeSetting === "detective" && detectivePlayer) {
    const detSnake = detectivePlayer === "p1" ? snake1 : detectivePlayer === "p2" ? snake2 : detectivePlayer === "p3" ? snake3 : snake4;
    if (detSnake && detSnake.length > 0) {
      const h = detSnake[0];
      ctx.save();
      ctx.fillStyle = "#4488ff";
      // Hat brim
      ctx.fillRect(h.x - 2, h.y - 8, UNIT + 4, 3);
      // Hat top
      ctx.fillRect(h.x + 3, h.y - 16, UNIT - 6, 9);
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 6px "Share Tech Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("DET", h.x + UNIT / 2, h.y - 10);
      ctx.restore();
    }
  }

  // Effect badges above heads
  if (snake1 && snake1.length) drawEffectBadge(snake1, "p1");
  if (snake2 && snake2.length) drawEffectBadge(snake2, "p2");
  if (snake3 && snake3.length) drawEffectBadge(snake3, "p3");
  if (snake4 && snake4.length) drawEffectBadge(snake4, "p4");

  // Helper to hide scores in Detective mode
  const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";
  const shouldShow = (p) => {
    if (gameModeSetting !== "detective") return true; 
    return p.id === localPid; // Only see your own score
  };

  // Score HUD
  ctx.fillStyle = "rgba(6,6,15,0.9)"; ctx.fillRect(0, 0, CW, 34);
  ctx.strokeStyle = "rgba(0,229,255,0.12)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(CW, 34); ctx.stroke();
  ctx.font = 'bold 15px "Share Tech Mono", monospace';
  if (players[0] && shouldShow(players[0])) {
    ctx.fillStyle = players[0].color.main; ctx.textAlign = "left";
    ctx.fillText(players[0].name + "  " + players[0].score + " pts", 12, 23);
  }
  if (players[1] && shouldShow(players[1])) {
    ctx.fillStyle = players[1].color.main; ctx.textAlign = "right";
    ctx.fillText(players[1].score + " pts  " + players[1].name, CW - 12, 23);
  }
  // Extra players at bottom
  if (players[2] && players[2].snake && players[2].snake.length > 0 && shouldShow(players[2])) {
    ctx.fillStyle = players[2].color.main; ctx.textAlign = "left"; ctx.font = 'bold 12px "Share Tech Mono", monospace';
    ctx.fillText(players[2].name + "  " + players[2].score + " pts", 12, CH - 6);
  }
  if (players[3] && players[3].snake && players[3].snake.length > 0 && shouldShow(players[3])) {
    ctx.fillStyle = players[3].color.main; ctx.textAlign = "right"; ctx.font = 'bold 12px "Share Tech Mono", monospace';
    ctx.fillText(players[3].score + " pts  " + players[3].name, CW - 12, CH - 6);
  }
  ctx.textAlign = "left";

  // King of the Castle timer HUD
  if (gameModeSetting === "king_castle" && crownTimer > 0) {
    const secs = Math.ceil(crownTimer / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    ctx.fillStyle = "rgba(255,204,0,0.85)"; ctx.font = 'bold 14px "Share Tech Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("\u{1F451} " + mins + ":" + (s < 10 ? "0" : "") + s, CW / 2, 22);
    if (crownHolder) {
      const hName = crownHolder === "p1" ? player1Name : crownHolder === "p2" ? player2Name : crownHolder === "p3" ? player3Name : player4Name;
      ctx.fillStyle = "rgba(255,204,0,0.7)"; ctx.font = 'bold 10px "Share Tech Mono", monospace';
      ctx.fillText("Crown: " + hName, CW / 2, CH - 20);
    }
    ctx.textAlign = "left";
  }

  // Detective mode HUD
  if (gameModeSetting === "detective" && detectiveTimer > 0) {
    const secs = Math.ceil(detectiveTimer / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    ctx.fillStyle = "rgba(68,136,255,0.85)"; ctx.font = 'bold 14px "Share Tech Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("\u{1F50D} " + mins + ":" + (s < 10 ? "0" : "") + s, CW / 2, 22);
    // Show scan charges for detective
    if (scanCharges > 0) {
      ctx.fillStyle = "rgba(255,68,102,0.8)"; ctx.font = 'bold 10px "Share Tech Mono", monospace';
      ctx.fillText("Scans: " + scanCharges, CW / 2 + 80, 22);
    }
    ctx.textAlign = "left";
  }

  // Blitz indicator
  if (gameModeSetting === "blitz" && blitzSpeedLevel > 0) {
    ctx.fillStyle = "rgba(255,100,0,0.7)"; ctx.font = 'bold 11px "Share Tech Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("BLITZ x" + (blitzSpeedLevel + 1), CW / 2, 22);
    ctx.textAlign = "left";
  }

  // Floating texts
  updateFloatingTexts();
  const localRole = (localPid === detectivePlayer) ? "detective" : (imposterScores[localPid] !== undefined ? "imposter" : "observer");
  floatingTexts.forEach(t => {
    // Visibility filter
    if (t.showToPid) {
      if (t.showToPid !== localPid) return;
    }
    // Specific role filtering (e.g. +1 food only for imposters)
    if (t.text === "+1" && localRole === "detective" && gameModeSetting === "detective") return;

    ctx.globalAlpha = Math.max(0, t.alpha);
    ctx.fillStyle = t.col || "#ff4466";
    ctx.font = 'bold 15px "Orbitron", sans-serif';
    ctx.textAlign = "center"; ctx.fillText(t.text, t.x, t.y); ctx.textAlign = "left"; ctx.globalAlpha = 1;
  });

  // Screen flash
  if (screenFlash > 0) {
    ctx.fillStyle = "rgba(255,50,50," + screenFlash + ")"; ctx.fillRect(0, 0, CW, CH);
    screenFlash = Math.max(0, screenFlash - 0.06);
  }

  if (gameOver) {
    let msg = "DRAW!";
    if (gameModeSetting === "king_castle") {
      // King of Castle: show who held crown longest
      let bestPid = null, bestTime = 0;
      for (const [pid, t] of Object.entries(crownTimeHeld)) {
        if (t > bestTime) { bestTime = t; bestPid = pid; }
      }
      if (bestPid) {
        const n = bestPid === "p1" ? player1Name : bestPid === "p2" ? player2Name : bestPid === "p3" ? player3Name : player4Name;
        msg = n + " WINS! (" + (bestTime / 1000).toFixed(1) + "s)";
      } else msg = "NO ONE HELD THE CROWN!";
    } else if (gameModeSetting === "detective") {
      // Detective end screen
      const allDetected = Object.keys(imposterScores).every(pid => detectedPlayers[pid]);
      if (allDetected) {
        const detName = detectivePlayer === "p1" ? player1Name : detectivePlayer === "p2" ? player2Name : detectivePlayer === "p3" ? player3Name : player4Name;
        msg = "Detective " + detName + " WINS!";
      } else {
        let bestPid = null, bestScore = -1;
        for (const [pid, sc] of Object.entries(imposterScores)) {
          if (!detectedPlayers[pid] && sc > bestScore) { bestScore = sc; bestPid = pid; }
        }
        if (bestPid) {
          const n = bestPid === "p1" ? player1Name : bestPid === "p2" ? player2Name : bestPid === "p3" ? player3Name : player4Name;
          msg = "Imposter " + n + " WINS!";
        }
      }
    } else {
      if (winner==="p1") msg = player1Name + " WINS!";
      else if (winner==="p2") msg = player2Name + " WINS!";
      else if (winner==="p3") msg = player3Name + " WINS!";
      else if (winner==="p4") msg = player4Name + " WINS!";
    }
    drawBanner(msg);
  }
}

function drawCrown() {
  const t = Date.now();
  ctx.save();
  if (crownHolder) {
    // Draw crown above holder's head
    const hSnake = crownHolder === "p1" ? snake1 : crownHolder === "p2" ? snake2 : crownHolder === "p3" ? snake3 : crownHolder === "p4" ? snake4 : null;
    if (hSnake && hSnake.length > 0) {
      const h = hSnake[0];
      const bob = Math.sin(t / 200) * 2;
      ctx.shadowColor = "#ffcc00"; ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffcc00";
      ctx.font = 'bold 16px "Orbitron", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("\u{1F451}", h.x + UNIT / 2, h.y - 10 + bob);
    }
  } else if (crownPos) {
    // Draw crown on the ground
    const pulse = 0.7 + 0.3 * Math.sin(t / 250);
    ctx.globalAlpha = pulse;
    ctx.shadowColor = "#ffcc00"; ctx.shadowBlur = 15 * pulse;
    ctx.fillStyle = "#ffcc00";
    ctx.font = 'bold 20px "Orbitron", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("\u{1F451}", crownPos.x + UNIT / 2, crownPos.y + UNIT / 2 + 7);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawSnake(snake, colors, name, forceGlow, glowIntensity = 1.0) {
  if (!snake || snake.length === 0) return;
  const isCrowned = (gameModeSetting === "king_castle" && players.find(p => p.snake === snake && p.id === crownHolder));
  
  const p = players.find(p => p && p.snake === snake);
  const eff = p ? getEffect(p.id) : null;
  const isInvisible = eff && eff.type === "invisibility";
  
  // I-frame blinking
  let blink = 1;
  if (p && p.invuln > Date.now()) {
    blink = Math.floor(Date.now() / 150) % 2 === 0 ? 0.3 : 1;
  }

  let glowColor = (forceGlow || isCrowned) ? colors.glow : null;
  if (eff && eff.type === "shield") glowColor = "rgba(0,229,255,";

  for (let i = snake.length - 1; i >= 0; i--) {
    const seg = snake[i]; const isHead = i === 0;
    const bright = 1 - (i / (snake.length + 5)) * 0.5;
    
    if (isHead && !isInvisible && glowColor) { 
      ctx.shadowBlur = 15 * glowIntensity; ctx.shadowColor = glowColor + "1)";
      ctx.fillStyle = glowColor + "0.4)"; 
      ctx.fillRect(seg.x - 4, seg.y - 4, UNIT + 8, UNIT + 8); 
      ctx.shadowBlur = 0;
    }
    
    ctx.globalAlpha = bright * (isInvisible ? 0.35 : 1) * blink; 
    ctx.fillStyle = isHead ? colors.main : colors.dim;
    ctx.fillRect(seg.x + 1, seg.y + 1, UNIT - 2, UNIT - 2); 
    ctx.globalAlpha = 1;
    
    if (eff && eff.type === "shield" && Math.random() < 0.2) {
      ctx.strokeStyle = "#00e5ff";
      ctx.strokeRect(seg.x, seg.y, UNIT, UNIT);
    }
  }
  if (name && snake.length > 0) {
    const h = snake[0]; ctx.globalAlpha = 0.6; ctx.fillStyle = colors.main;
    ctx.font = '10px "Share Tech Mono", monospace'; ctx.textAlign = "center";
    ctx.fillText(name, h.x + UNIT / 2, h.y - 5); ctx.textAlign = "left"; ctx.globalAlpha = 1;
  }
}

function drawBanner(msg) {
  ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.fillRect(0, CH / 2 - 40, CW, 80);
  
  // Custom Icon Drawing (Gold Trophy/Crown)
  ctx.save();
  ctx.translate(CW / 2 - 180, CH / 2);
  ctx.fillStyle = "#ffcc00";
  ctx.shadowColor = "#ffcc00"; ctx.shadowBlur = 10;
  // Cup
  ctx.beginPath();
  ctx.moveTo(-10, -10); ctx.lineTo(10, -10); ctx.lineTo(6, 4); ctx.lineTo(-6, 4); ctx.fill();
  // Stem & Base
  ctx.fillRect(-2, 4, 4, 4);
  ctx.fillRect(-6, 8, 12, 2);
  // Handles
  ctx.strokeStyle = "#ffcc00"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-10, -4, 4, 1.5 * Math.PI, 0.5 * Math.PI, true); ctx.stroke();
  ctx.beginPath(); ctx.arc(10, -4, 4, 1.5 * Math.PI, 0.5 * Math.PI, false); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#fff"; ctx.font = 'bold 26px "Orbitron", sans-serif';
  ctx.textAlign = "center"; 
  ctx.textBaseline = "middle"; // Better vertical centering
  ctx.fillText(msg, CW / 2, CH / 2); 
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

// ── Snake Movement ────────────────────────────────────────
function nextHead(snake, dir) {
  const h = { ...snake[0] };
  if (dir==="UP") h.y-=UNIT; if (dir==="DOWN") h.y+=UNIT;
  if (dir==="LEFT") h.x-=UNIT; if (dir==="RIGHT") h.x+=UNIT;
  wrap(h); return h;
}
function wrap(p) {
  if (p.x < 0) p.x = CW - UNIT; if (p.x >= CW) p.x = 0;
  if (p.y < 0) p.y = CH - UNIT; if (p.y >= CH) p.y = 0;
}
function hit(a, b) { return a && b && a.x === b.x && a.y === b.y; }
function stepSnake(snake, dir, isInvisible) {
  const head = nextHead(snake, dir); snake.unshift(head);
  const ate = hit(head, food) && !isInvisible; if (!ate) snake.pop(); return ate;
}

// ── Collision System ──────────────────────────────────────
function checkCollisions() {
  if (gameOver) return;
  syncToPlayers();
  const alivePlayers = players.filter(p => p && p.alive && p.snake && p.snake.length > 0);
  if (activePlayerCount > 1 && alivePlayers.length <= 1) {
    if (alivePlayers.length === 1) endGame(alivePlayers[0].id); else endGame("draw"); return;
  }
  if (alivePlayers.length <= 1) return;

  const dmgSet = new Set();
  const attackedBy = {};  // who hit who (for double damage tracking)

  for (const p1 of alivePlayers) {
    if (p1.invuln > Date.now()) continue; // i-frames

    const eff1 = getEffect(p1.id);
    const p1Invisible = eff1 && eff1.type === "invisibility";
    if (p1Invisible) continue; // Invisible snkaes cannot hit or be hit

    const h1 = p1.snake[0];
    for (const p2 of alivePlayers) {
      if (p1.id !== p2.id) {
         const eff2 = getEffect(p2.id);
         if (eff2 && eff2.type === "invisibility") continue;
      }
      
      const start = (p1.id === p2.id) ? 1 : 0;
      let p2Hit = false;
      for (let i = start; i < p2.snake.length; i++) {
        if (hit(h1, p2.snake[i])) {
          // p1's head hit p2's body, p2 takes damage!
          dmgSet.add(p2.id);
          if (p1.id !== p2.id) {
             if (!attackedBy[p2.id]) attackedBy[p2.id] = p1.id;
          }
          p2Hit = true;
          break;
        }
      }
      if (p2Hit) break; // p1's head struck something, move on
    }
  }

  // Head-on head check
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const p1 = alivePlayers[i]; const p2 = alivePlayers[j];
      if (p1.invuln > Date.now() || p2.invuln > Date.now()) continue;

      const eff1 = getEffect(p1.id), eff2 = getEffect(p2.id);
      if ((eff1 && eff1.type === "invisibility") || (eff2 && eff2.type === "invisibility")) continue;

      if (hit(p1.snake[0], p2.snake[0])) {
        dmgSet.add(p1.id); dmgSet.add(p2.id);
        attackedBy[p1.id] = p2.id;
        attackedBy[p2.id] = p1.id;
      }
    }
  }

  // Swap-through detection
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const a = alivePlayers[i]; const b = alivePlayers[j];
      if (a.invuln > Date.now() || b.invuln > Date.now()) continue;

      const eff1 = getEffect(a.id), eff2 = getEffect(b.id);
      if ((eff1 && eff1.type === "invisibility") || (eff2 && eff2.type === "invisibility")) continue;

      if (a._prevH && b._prevH && a.snake.length > 0 && b.snake.length > 0) {
        if (hit(a.snake[0], b._prevH) && hit(b.snake[0], a._prevH)) {
          dmgSet.add(a.id); dmgSet.add(b.id);
        }
      }
    }
  }

  // Sudden Death border
  if (gameModeSetting === "sudden_death" && suddenDeathBorder > 0) {
    for (const p of alivePlayers) {
      if (p.invuln > Date.now()) continue; // i-frames
      const eff = getEffect(p.id);
      if (eff && eff.type === "invisibility") continue; // walk through walls

      const h = p.snake[0];
      if (h.x < suddenDeathBorder || h.x >= CW - suddenDeathBorder ||
          h.y < suddenDeathBorder || h.y >= CH - suddenDeathBorder) {
        dmgSet.add(p.id);
      }
    }
  }

  if (dmgSet.size > 0) {
    for (const id of dmgSet) { applyDamageDynamic(id, attackedBy[id]); }
    syncFromPlayers();
    syncToPlayers();
    const surviving = players.filter(p => p && p.alive && p.snake && p.snake.length > 0);
    if (activePlayerCount > 1 && surviving.length <= 1) {
      if (surviving.length === 1) endGame(surviving[0].id); else endGame("draw"); 
    }
    return true; // Damage was dealt
  }
  return false;
}

function applyDamageDynamic(id, attackerId) {
  const p = players.find(p => p && p.id === id); if (!p) return;

  // Shield blocks damage (consume the shield)
  if (getEffect(id)) {
    const eff = getEffect(id);
    if (eff && eff.type === "shield") {
      consumeEffect(id);
      addFloatingText(p.snake[0].x, p.snake[0].y, "BLOCKED!", "#44ffcc");
      return;
    }
  }

  // Double damage: if attacker has double_damage effect
  let dmgAmount = 10;
  if (attackerId && getEffect(attackerId) && getEffect(attackerId).type === "double_damage") {
    dmgAmount = 20;
  }

  if (p.snake && p.snake.length > 0) p.snake.pop();
  p.score -= dmgAmount;
  p.invuln = Date.now() + 1200; // Trigger I-Frames to prevent instant overlap death
  
  if (p.snake && p.snake.length > 0) addFloatingText(p.snake[0].x, p.snake[0].y, "OUCH!", "#ff4466");
  screenFlash = 0.35; triggerDamageFlash(); sfxDamage();
  if (p.score <= 0 || !p.snake || p.snake.length === 0) p.alive = false;
}

function endGame(result) {
  gameOver = true; winner = result;
  clearGameTimer(); clearAiTimer(); sfxGameOver(); stopBGM();
  boardPowerUps = [];
  draw();

  // Save to leaderboard
  if (!matchmakingInBackground) {
    if (mode === "online") saveOnlineLeaderboard();
    if (mode === "ai" && result === "p1" && aiDifficulty === "impossible") promptImpossibleLeaderboard();
  }

  if (mode === "online" && roomRef && playerRole === "player1" && !matchmakingInBackground) {
    roomRef.child("game").update({
      gameOver:true, winner:result,
      score1, score2, score3, score4,
      snake1: serSnake(snake1), snake2: serSnake(snake2)
    }).catch(e => console.error("[endGame]", e));
  }
}

// ── Game Tick ─────────────────────────────────────────────
function tickGame() {
  if (gameOver) return false;
  syncToPlayers();

  const isKing = gameModeSetting === "king_castle";
  const isDetective = gameModeSetting === "detective";

  // Capture holder state before moves to fix overlap/swap-through issues
  let prevHolderSnake = null;
  if (isKing && crownHolder) {
    const s = crownHolder === "p1" ? snake1 : crownHolder === "p2" ? snake2 : crownHolder === "p3" ? snake3 : crownHolder === "p4" ? snake4 : null;
    prevHolderSnake = s ? s.map(seg => ({...seg})) : null;
  }

  let anyoneAte = false;
  let anyoneHitPU = false;
  players.forEach(p => {
    if (!p || !p.alive || !p.snake || p.snake.length === 0) return;
    p._prevH = { x: p.snake[0].x, y: p.snake[0].y };

    const eff = getEffect(p.id);
    const isInvisible = eff && eff.type === "invisibility";
    const hasSpeedBoost = eff && eff.type === "speed_up";
    const isCrownHolder = isKing && crownHolder === p.id;

    // Determine steps: normal=1, speed_up=2, crown_holder=1.5x (alternating)
    let steps = 1;
    if (hasSpeedBoost) steps = 2;
    if (isCrownHolder) {
      // 1.5x speed: 2 steps on even ticks of the game clock, 1 on odd
      const tick = Math.floor(Date.now() / GAME_SPEED);
      steps = (tick % 2 === 0) ? 2 : 1;
    }

    for (let step = 0; step < steps; step++) {
      if (!p.alive || !p.snake || p.snake.length === 0) break;
      const ate = stepSnake(p.snake, p.dir, isInvisible || isKing || (isDetective && p.id === detectivePlayer)); 
      if (ate) {
        if (isDetective && p.id !== detectivePlayer && !detectedPlayers[p.id]) {
          // Imposter eats food: +1 pt, BUT NO SIZE INCREASE
          imposterScores[p.id] = (imposterScores[p.id] || 0) + 1;
          p.score += 1; anyoneAte = true; sfxEat();
          p.snake.pop(); // Re-pop tail to maintain length
          addFloatingText(p.snake[0].x, p.snake[0].y, "+1", "#00ff88", p.id);
        } else if (!isDetective) {
          // Normal food eating
          const pts = (eff && eff.type === "double_points") ? 20 : 10;
          p.score += pts; anyoneAte = true; sfxEat();
        } else {
          // Detective eats food - just eat it, no special points
          anyoneAte = true; sfxEat();
        }

        // Guest-side: track what we just ate to avoid host echoes
        if (playerRole !== "player1" && p.id === (roleToP[playerRole]||"p1")) {
           lastConsumedFoodId = food.id;
           consumeLockTimer = 10;
        }
      }
    }

    // Power-up pickup (can't pickup if invisible, no power-ups in detective)
    if (!isInvisible && !isDetective) {
      if (checkPowerUpPickup(p.id, p.snake)) anyoneHitPU = true;
    }
  });

  if (anyoneAte) food = randomFoodPos();

  // ── King of the Castle: Crown mechanics ──
  if (isKing) {
    const now = Date.now();
    const dt = now - crownLastTick;
    crownLastTick = now;

    // Crown pickup from ground
    if (!crownHolder && crownPos) {
      for (const p of players) {
        if (!p || !p.alive || !p.snake || p.snake.length === 0) continue;
        if (hit(p.snake[0], crownPos)) {
          crownHolder = p.id;
          crownPos = null;
          const pname = p.id === "p1" ? player1Name : p.id === "p2" ? player2Name : p.id === "p3" ? player3Name : player4Name;
          showToast("\u{1F451} " + pname + " grabbed the crown!");
          sfxPowerUp();
          break;
        }
      }
    }

    // Crown transfer: if another player touches the crowned player
    if (crownHolder) {
      crownTimeHeld[crownHolder] = (crownTimeHeld[crownHolder] || 0) + dt;
      const holderSnake = crownHolder === "p1" ? snake1 : crownHolder === "p2" ? snake2 : crownHolder === "p3" ? snake3 : crownHolder === "p4" ? snake4 : null;
      if (holderSnake && holderSnake.length > 0) {
        let crownStolenThisTick = false;
        // Host only authoritative crown theft logic
        const canTheft = (mode !== "online" || playerRole === "player1");
        
        if (canTheft) {
          for (const p of players) {
            if (!p || !p.alive || p.id === crownHolder || !p.snake || p.snake.length === 0 || crownStolenThisTick) continue;
            const eff = getEffect(p.id);
            if (eff && eff.type === "invisibility") continue;
            
            // Theft on ANY body segment touch (Current and Previous to catch swaps)
            let theft = false;
            const holderEff = getEffect(crownHolder);
            const isHolderInvincible = (holderEff && holderEff.type === "invisibility");

            if (!isHolderInvincible) {
              const hKing = holderSnake[0];
              const hAttacker = p.snake[0];
              // 1. Attacker Head hit King body
              for (let seg of holderSnake) {
                if (hit(hAttacker, seg)) { theft = true; break; }
              }
              // 2. King Head hit Attacker body (Symmetry Fix)
              if (!theft) {
                for (let seg of p.snake) {
                  if (hit(hKing, seg)) { theft = true; break; }
                }
              }
              // 3. High-speed swap prevention (check prev positions)
              if (!theft && prevHolderSnake) {
                for (let seg of prevHolderSnake) {
                  if (hit(hAttacker, seg)) { theft = true; break; }
                }
              }
              // 4. Head-to-Head adjacent overlap (for smoothness in 1-overlap)
              if (!theft) {
                const dist = Math.abs(hAttacker.x - hKing.x) + Math.abs(hAttacker.y - hKing.y);
                // Host allows a slightly larger radius (1.5 units) to compensate for guest lag
                if (dist <= UNIT * 1.5) { theft = true; } 
              }
            }
            
            if (theft) {
              crownHolder = p.id;
              const pname = p.id === "p1" ? player1Name : p.id === "p2" ? player2Name : p.id === "p3" ? player3Name : player4Name;
              showToast("Crown Stolen by " + pname + "!");
              sfxPowerUp();
              updateRoleInfo();
              crownStolenThisTick = true;
              break;
            }
          }
        }
      }
    }

    // Crown timer countdown
    crownTimer = Math.max(0, crownTimerDuration - (now - gameStartTime));
    if (crownTimer <= 0 && !gameOver) {
      endGame("king_timer");
      return true;
    }
  }

  // ── Detective Snake: NPC AI + Timer ──
  if (isDetective) {
    const now = Date.now();
    detectiveTimer = Math.max(0, detectiveTimerDuration - (now - gameStartTime));

    // NPC movement
    tickDetectiveNPCs();

    // Check detective score
    if (detectiveScore <= 0 && detectivePlayer && !gameOver) {
      // Detective loses
      endGame("detective_lose");
      return true;
    }

    // Check if all imposters detected
    const imposterPids = Object.keys(imposterScores);
    if (imposterPids.length > 0 && imposterPids.every(pid => detectedPlayers[pid]) && !gameOver) {
      endGame("detective_win");
      return true;
    }

    // Timer expired
    if (detectiveTimer <= 0 && !gameOver) {
      endGame("detective_timer");
      return true;
    }
  }

  // Sudden Death border progression
  if (gameModeSetting === "sudden_death") {
    const elapsed = Date.now() - gameStartTime;
    if (elapsed > 10000) {
      const phases = Math.floor((elapsed - 10000) / 8000);
      suddenDeathBorder = Math.min(phases * UNIT, Math.min(CW, CH) / 2 - 3 * UNIT);
    }
  }

  // Blitz mode: increase speed every 10s
  if (gameModeSetting === "blitz") {
    const elapsed = Date.now() - gameStartTime;
    const newLevel = Math.min(Math.floor(elapsed / 10000), 6);
    if (newLevel > blitzSpeedLevel) {
      blitzSpeedLevel = newLevel;
      const newSpeed = Math.max(55, GAME_SPEED - blitzSpeedLevel * 10);
      setTimeout(() => {
        if (!interval || gameOver) return;
        clearInterval(interval);
        const isHost = mode === "online" && playerRole === "player1" && !matchmakingInBackground;
        interval = setInterval(isHost ? hostGameLoop : gameLoop, newSpeed);
        if (aiInterval) {
          clearAiTimer();
          const speeds = { easy:350, medium:250, hard:150, impossible:90 };
          aiInterval = setInterval(aiTick, Math.max(55, (speeds[aiDifficulty]||200) - blitzSpeedLevel * 10));
        }
      }, 0);
      showToast("BLITZ! Speed+" + (blitzSpeedLevel) + " (" + (newSpeed) + "ms)");
    }
  }

  syncFromPlayers();
  _prevH1 = players[0] ? players[0]._prevH : null;
  _prevH2 = players[1] ? players[1]._prevH : null;

  // Skip player-player collisions in King of Castle (transfer handles it) 
  // and Detective (camouflage/blending handles it)
  const anyoneDmg = (isKing || isDetective) ? false : checkCollisions();
  return anyoneAte || anyoneHitPU || anyoneDmg;
}

// ── Detective NPC AI ──────────────────────────────────────
function tickDetectiveNPCs() {
  npcSnakes.forEach(npc => {
    if (!npc.alive || !npc.snake || npc.snake.length === 0) return;
    npc.changeTimer--;
    if (npc.changeTimer <= 0) {
      // Randomly change direction
      const dirs = ["UP","DOWN","LEFT","RIGHT"].filter(d => d !== OPPOSITE[npc.dir]);
      npc.dir = dirs[Math.floor(Math.random() * dirs.length)];
      npc.changeTimer = Math.floor(Math.random() * 20) + 10;
    }
    // Step NPC
    const h = { ...npc.snake[0] };
    if (npc.dir==="UP") h.y-=UNIT; if (npc.dir==="DOWN") h.y+=UNIT;
    if (npc.dir==="LEFT") h.x-=UNIT; if (npc.dir==="RIGHT") h.x+=UNIT;
    wrap(h);
    npc.snake.unshift(h);
    npc.snake.pop(); // NPCs always stay length 2
  });
}

// ── Detective Scan / Inspect ──────────────────────────────
function imposterTeleport(forcedPid) {
  if (gameModeSetting !== "detective" || gameOver) return;
  const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";
  const actorPid = forcedPid || localPid;
  if (actorPid === detectivePlayer) return; // Only imposters

  if (mode === "online" && playerRole !== "player1" && !forcedPid) {
    roomRef.child("players/" + playerRole + "/actionRequest").set({ type:"teleport", ts:Date.now() });
    return;
  }

  if (teleportCharges[actorPid] <= 0) { 
    if (!forcedPid) showToast("No teleport charges left!"); 
    return; 
  }

  // Find a random spot far away from detective
  const detSnake = getSnake(detectivePlayer);
  const detHead = detSnake ? detSnake[0] : {x: CW/2, y: CH/2};
  
  let newX, newY, safe = false;
  for (let i = 0; i < 50; i++) {
    newX = Math.floor(Math.random() * (CW / UNIT - 4) + 2) * UNIT;
    newY = Math.floor(Math.random() * (CH / UNIT - 6) + 3) * UNIT;
    let d = Math.abs(newX - detHead.x) + Math.abs(newY - detHead.y);
    if (d > UNIT * 15) { safe = true; break; }
  }

  const mySnake = getSnake(myPid);
  if (mySnake && mySnake.length > 0) {
    const dx = newX - mySnake[0].x;
    const dy = newY - mySnake[0].y;
    for (const seg of mySnake) { seg.x += dx; seg.y += dy; }
  }

  teleportCharges[actorPid]--;
  teleportFlash = 10; // Poof visual local
  sfxPowerUp();
  if (!forcedPid) showToast("TELEPORT! (" + teleportCharges[actorPid] + " left)");
  
  if (playerRole === "player1") {
    _lastTeleportTs = Date.now();
    syncRoomState();
  }
}

function getSnake(pid) {
  if (pid === "p1") return snake1; if (pid === "p2") return snake2;
  if (pid === "p3") return snake3; if (pid === "p4") return snake4;
  return null;
}

function detectiveScan(forcedPid) {
  if (gameModeSetting !== "detective") return;
  const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";
  const actorPid = forcedPid || localPid;
  if (actorPid !== detectivePlayer) { 
    if (!forcedPid) showToast("Only the detective can scan!"); 
    return; 
  }

  if (mode === "online" && playerRole !== "player1" && !forcedPid) {
    roomRef.child("players/" + playerRole + "/actionRequest").set({ type:"scan", ts:Date.now() });
    // Optimistic UI: trigger locally immediately
    scanHighlights.push({
      x: detSnake[0].x, y: detSnake[0].y, // Note: detSnake[0] is used below in the original but we need it here
      radius: UNIT * 5,
      endTime: Date.now() + 3000
    });
    sfxPowerUp();
    showToast("Scan signal sent...");
    return;
  }

  if (scanCharges <= 0) { 
    if (!forcedPid) showToast("No scans remaining!"); 
    return; 
  }

  scanCharges--;
  sfxPowerUp();

  // Find nearest imposter player (within range)
  const detSnake = detectivePlayer === "p1" ? snake1 : detectivePlayer === "p2" ? snake2 : detectivePlayer === "p3" ? snake3 : snake4;
  if (!detSnake || detSnake.length === 0) return;

  // Find any un-detected imposter and highlight their area
  const imposterPids = Object.keys(imposterScores).filter(pid => !detectedPlayers[pid]);
  if (imposterPids.length === 0) { showToast("No imposters left!"); scanCharges++; return; }

  // Pick the closest imposter
  let closestPid = null, closestDist = Infinity;
  for (const pid of imposterPids) {
    const s = pid === "p1" ? snake1 : pid === "p2" ? snake2 : pid === "p3" ? snake3 : snake4;
    if (!s || s.length === 0) continue;
    const dx = s[0].x - detSnake[0].x;
    const dy = s[0].y - detSnake[0].y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist < closestDist) { closestDist = dist; closestPid = pid; }
  }

  if (closestPid) {
    const s = closestPid === "p1" ? snake1 : closestPid === "p2" ? snake2 : closestPid === "p3" ? snake3 : snake4;
    if (s && s.length > 0) {
      scanHighlights.push({
        x: s[0].x, y: s[0].y,
        radius: UNIT * 5,
        endTime: Date.now() + 3000
      });
      if (!forcedPid) showToast("Scan activated! An imposter is nearby...");
      addFloatingText(s[0].x, s[0].y, "EXPOSED AREA!", "#ff4466");
    }
  }
}

function detectiveInspect(forcedPid) {
  if (gameModeSetting !== "detective" || gameOver) return;
  const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";
  const actorPid = forcedPid || localPid;
  if (actorPid !== detectivePlayer) return;

  if (mode === "online" && playerRole !== "player1" && !forcedPid) {
    roomRef.child("players/" + playerRole + "/actionRequest").set({ type:"inspect", ts:Date.now() });
    // Optimistic UI: briefly show a searching effect
    addFloatingText(detSnake[0].x, detSnake[0].y, "INSPECTING...", "#4488ff");
    sfxClick();
    return;
  }

  const detSnake = detectivePlayer === "p1" ? snake1 : detectivePlayer === "p2" ? snake2 : detectivePlayer === "p3" ? snake3 : snake4;
  if (!detSnake || detSnake.length === 0) return;
  const dh = detSnake[0];

  // Check nearby snakes (within 2 tiles)
  const range = UNIT * 2;

  // Check players first
  const imposterPids = Object.keys(imposterScores).filter(pid => !detectedPlayers[pid]);
  for (const pid of imposterPids) {
    const s = pid === "p1" ? snake1 : pid === "p2" ? snake2 : pid === "p3" ? snake3 : snake4;
    if (!s || s.length === 0) continue;
    const dx = Math.abs(s[0].x - dh.x);
    const dy = Math.abs(s[0].y - dh.y);
    if (dx <= range && dy <= range) {
      // Player detected!
      detectedPlayers[pid] = true;
      detectiveScore++;
      // Sync score back to variables for HUD
      if (detectivePlayer === "p1") score1 = detectiveScore;
      else if (detectivePlayer === "p2") score2 = detectiveScore;
      else if (detectivePlayer === "p3") score3 = detectiveScore;
      else if (detectivePlayer === "p4") score4 = detectiveScore;

      const pname = pid === "p1" ? player1Name : pid === "p2" ? player2Name : pid === "p3" ? player3Name : player4Name;
      showToast("\u{1F50D} Imposter " + pname + " CAUGHT!");
      addFloatingText(s[0].x, s[0].y, "CAUGHT!", "#ff4466");
      sfxDamage();
      // Remove the imposter snake
      if (pid === "p1") { snake1 = []; score1 = 0; }
      else if (pid === "p2") { snake2 = []; score2 = 0; }
      else if (pid === "p3") { snake3 = []; score3 = 0; }
      else if (pid === "p4") { snake4 = []; score4 = 0; }
      return;
    }
  }

  // Check NPCs
  for (const npc of npcSnakes) {
    if (!npc.alive || !npc.snake || npc.snake.length === 0) continue;
    const dx = Math.abs(npc.snake[0].x - dh.x);
    const dy = Math.abs(npc.snake[0].y - dh.y);
    if (dx <= range && dy <= range) {
      // It's an NPC — detective loses a point
      detectiveScore--;
      // Sync score back to variables for HUD
      if (detectivePlayer === "p1") score1 = detectiveScore;
      else if (detectivePlayer === "p2") score2 = detectiveScore;
      else if (detectivePlayer === "p3") score3 = detectiveScore;
      else if (detectivePlayer === "p4") score4 = detectiveScore;

      showToast("Wrong! That was an NPC. -1 point (" + detectiveScore + " left)");
      addFloatingText(npc.snake[0].x, npc.snake[0].y, "NPC!", "#ffcc00");
      sfxDamage();
      npc.alive = false; // Remove inspected NPC
      return;
    }
  }

  if (!forcedPid) showToast("No snake nearby to inspect!");
}

function updateRoleInfo() {
  const el = document.getElementById("roleInfo"); if (!el) return;
  const isKingMode = gameModeSetting === "king_castle";
  const isDetectiveMode = gameModeSetting === "detective";
  const localPid = mode === "online" ? (roleToP[playerRole] || "p1") : "p1";

  if (isDetectiveMode) {
    const isDet = (localPid === detectivePlayer);
    el.innerHTML = isDet 
      ? '<span class="role-detective">YOU ARE THE DETECTIVE! Find the imposters.</span>'
      : '<span class="role-imposter">YOU ARE AN IMPOSTER! Blend in and eat food.</span>';
    
    // Mobile buttons for Detective
    const isMeDetective = (localPid === detectivePlayer);
    const inspBtn = document.getElementById("inspectBtn");
    const scanBtn = document.getElementById("scanBtn");
    if (inspBtn) inspBtn.style.display = isMeDetective ? "inline-flex" : "none";
    if (scanBtn) scanBtn.style.display = isMeDetective ? "inline-flex" : "none";
    if (isMeDetective) showToast("You are the Detective!");
  } else if (isKingMode) {
    const isKing = (localPid === crownHolder);
    el.innerHTML = isKing
      ? '<span class="role-king">YOU ARE THE KING! Hold the crown to win!</span>'
      : '<span class="role-king">GET THE CROWN! Capture it from the King.</span>';
  } else {
    el.innerHTML = '<span style="color:#888">BATTLE FOR SURVIVAL!</span>';
  }
}

function showControlsHint() {
  const el = document.getElementById("gameControlsHint");
  if (el) {
    el.textContent = "F11: Fullscreen | R: Restart | M: Menu";
    el.style.display = "block";
  }
}

function gameLoop() { tickGame(); draw(); }

function hostGameLoop() {
  if (!roomRef) return;
  const isInteractive = tickGame(); 
  draw();
  // Rate-limited sync: only write to Firebase every SYNC_EVERY frames OR if interaction occurred
  _syncFrameCount++;
  const syncFreq = (gameModeSetting === "normal" || gameModeSetting === "sudden_death") ? SYNC_EVERY : 2;
  if (isInteractive || _syncFrameCount >= syncFreq) { 
    _syncFrameCount = 0; 
    syncRoomState(); 
  }
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
    if (aiDifficulty === "easy" && Math.random() < 0.6) {
      target = { x: ai.x + (Math.random() - 0.5) * 400, y: ai.y + (Math.random() - 0.5) * 400 };
    }
    if (target) {
      const dx = target.x - ai.x, dy = target.y - ai.y;
      const preferred = [];
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > 0) preferred.push("RIGHT"); else if (dx < 0) preferred.push("LEFT");
        if (dy > 0) preferred.push("DOWN");  else if (dy < 0) preferred.push("UP");
      } else {
        if (dy > 0) preferred.push("DOWN");  else if (dy < 0) preferred.push("UP");
        if (dx > 0) preferred.push("RIGHT"); else if (dx < 0) preferred.push("LEFT");
      }
      for (const d of ["UP","DOWN","LEFT","RIGHT"]) { if (!preferred.includes(d)) preferred.push(d); }
      for (const d of preferred) { if (d !== OPPOSITE[dir2]) { bestDir = d; break; } }
    }
  }
  applyDirection("p2", bestDir);
}

function smartAI(head, goal) {
  const dirs = ["UP","DOWN","LEFT","RIGHT"];
  let target = goal;

  if (aiDifficulty === "impossible") {
    const ph = snake1[0];
    const dToPlayer = Math.abs(head.x - ph.x) + Math.abs(head.y - ph.y);
    // Aggressive: intercept player within 10 cells
    if (dToPlayer < UNIT * 10) {
      // Predict next player position
      const predictedHead = nextHead(snake1, dir1);
      target = predictedHead;
    }
  }

  let bestDir = null; let bestDist = Infinity;
  for (const d of dirs) {
    if (d === OPPOSITE[dir2]) continue;
    const n = { ...head };
    if (d==="UP") n.y-=UNIT; if (d==="DOWN") n.y+=UNIT;
    if (d==="LEFT") n.x-=UNIT; if (d==="RIGHT") n.x+=UNIT;
    wrap(n);

    let blocked = false;
    // Avoid own body
    for (let i = 1; i < snake2.length; i++) { if (hit(n, snake2[i])) { blocked=true; break; } }
    // Avoid opponent
    if (!blocked && aiDifficulty !== "easy") {
      for (const s of snake1) { if (hit(n, s)) { blocked=true; break; } }
    }
    // Avoid sudden death border (all difficulties except easy)
    if (!blocked && gameModeSetting === "sudden_death" && suddenDeathBorder > 0 && aiDifficulty !== "easy") {
      if (n.x < suddenDeathBorder + UNIT || n.x >= CW - suddenDeathBorder - UNIT ||
          n.y < suddenDeathBorder + UNIT || n.y >= CH - suddenDeathBorder - UNIT) {
        blocked = true;
      }
    }
    if (blocked) continue;

    // Impossible: also look 2 steps ahead to avoid traps
    if (aiDifficulty === "impossible") {
      let trapped = false;
      const dirs2 = ["UP","DOWN","LEFT","RIGHT"].filter(d2 => d2 !== OPPOSITE[d]);
      let freePaths = 0;
      for (const d2 of dirs2) {
        const n2 = { ...n };
        if (d2==="UP") n2.y-=UNIT; if (d2==="DOWN") n2.y+=UNIT;
        if (d2==="LEFT") n2.x-=UNIT; if (d2==="RIGHT") n2.x+=UNIT;
        wrap(n2);
        let b2 = false;
        for (let i = 1; i < snake2.length; i++) { if (hit(n2, snake2[i])) { b2=true; break; } }
        if (!b2) for (const s of snake1) { if (hit(n2, s)) { b2=true; break; } }
        if (!b2) freePaths++;
      }
      if (freePaths === 0) trapped = true;
      if (trapped) continue;
    }

    const dist = Math.abs(n.x - target.x) + Math.abs(n.y - target.y);
    if (dist < bestDist) { bestDist = dist; bestDir = d; }
  }
  return bestDir || dir2;
}

// ── Direction Application ─────────────────────────────────
function applyDirection(player, nextDir) {
  if (!nextDir || gameOver || (mode==="online" && winner)) return;
  if (mode === "online" && !matchmakingInBackground) {
    const roleMap = { player1:"p1", player2:"p2", player3:"p3", player4:"p4" };
    const local = roleMap[playerRole] || "p1";
    if (player !== local) return;
  }
  const curMap = { p1:dir1, p2:dir2, p3:dir3, p4:dir4 };
  const cur = curMap[player];
  if (cur === OPPOSITE[nextDir]) return;
  if (player==="p1") dir1=nextDir; else if (player==="p2") dir2=nextDir;
  else if (player==="p3") dir3=nextDir; else if (player==="p4") dir4=nextDir;

  if (mode === "online" && roomRef && !matchmakingInBackground) {
    roomRef.child("players/" + playerRole + "/direction").set(nextDir)
      .catch(e => console.error("[dir]", e));
  }
}

// ── Firebase Serialization ────────────────────────────────
function serSnake(s) { return s && s.length ? s.map(p => ({ x:p.x, y:p.y })) : []; }

function serState() {
  const state = {
    snake1: serSnake(snake1), snake2: serSnake(snake2),
    snake3: serSnake(snake3), snake4: serSnake(snake4),
    food: { x:food.x, y:food.y, id:food.id },
    score1, score2, score3, score4,
    dir1, dir2, dir3, dir4,
    suddenDeathBorder, blitzSpeedLevel,
    gameOver, winner,
    boardPowerUps: boardPowerUps.map(p => ({ x:p.x, y:p.y, type:p.type, id:p.id })),
    playerEffects: serEffects(),
    syncId: hostSyncId
  };
  // King of the Castle data
  if (gameModeSetting === "king_castle") {
    state.crownHolder = crownHolder;
    state.crownPos = crownPos;
    state.crownTimer = crownTimer;
    state.crownTimeHeld = crownTimeHeld;
  }
  // Detective Snake data
  if (gameModeSetting === "detective") {
    state.detectivePlayer = detectivePlayer;
    state.detectiveScore = detectiveScore;
    state.imposterScores = imposterScores;
    state.detectedPlayers = detectedPlayers;
    state.scanCharges = scanCharges;
    state.scanHighlights = scanHighlights.map(h => ({ x:h.x, y:h.y, radius:h.radius, endTime:h.endTime }));
    state.detectiveTimer = detectiveTimer;
    state.npcSnakes = npcSnakes.map(n => ({ snake:n.snake, dir:n.dir, alive:n.alive, id:n.id, changeTimer:n.changeTimer }));
    state.teleportEvent = { ts: _lastTeleportTs };
  }
  return state;
}

let _syncInFlight = false; let _syncPending = false;
let hostSyncId = 1;
let lastGuestSyncId = 0;

// Food locking for guest
let lastConsumedFoodId = null;
let consumeLockTimer = 0;

function syncRoomState() {
  if (!roomRef) return;
  if (_syncInFlight) { _syncPending = true; return; }
  _syncInFlight = true;
  hostSyncId++;
  roomRef.child("game").set(serState())
    .catch(e => console.error("[sync]", e))
    .finally(() => { _syncInFlight = false; if (_syncPending) { _syncPending = false; syncRoomState(); } });
}

// ── Firebase Data Normalization ───────────────────────────
function normSnake(raw, fallback) {
  if (!raw) return fallback;
  const arr = Array.isArray(raw) ? raw : Object.keys(raw).sort((a,b)=>+a-+b).map(k=>raw[k]);
  const segs = arr.filter(s=>s&&typeof s.x==="number"&&typeof s.y==="number").map(s=>({x:s.x,y:s.y}));
  return segs.length > 0 ? segs : fallback;
}
function normPt(p, fallback) {
  return (p && typeof p.x==="number" && typeof p.y==="number") ? {x:p.x,y:p.y, id:p.id} : fallback;
}
function normArr(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.keys(raw).sort((a,b)=>+a-+b).map(k=>raw[k]).filter(Boolean);
}

// ══════════════════════════════════════════════════════════
//  MULTIPLAYER — Room Listener
// ══════════════════════════════════════════════════════════
function bindRoomListener() {
  if (!roomRef) { console.error("[Room] roomRef is null"); return; }
  console.log("[Room] Binding listener:", roomRef.key);

  roomListener = function(snap) {
    const room = snap.val();
    if (!room) { clearGameTimer(); clearPollInterval(); showGameStatus("Room closed."); return; }

    const roomPlayers = room.players || {};
    const g = room.game || {};
    if (room.gameMode) gameModeSetting = room.gameMode;

    // Save "was" flags before updating previousPlayers (needed for P3/P4 spawn)
    const wasP3 = Boolean(previousPlayers.player3);
    const wasP4 = Boolean(previousPlayers.player4);

    // ── Join/Leave toasts ──
    for (const k of Object.keys(roomPlayers)) {
      if (!previousPlayers[k] && roomPlayers[k]) { showToast((roomPlayers[k].name||k) + " joined"); sfxJoin(); }
    }
    for (const k of Object.keys(previousPlayers)) {
      if (!roomPlayers[k] && previousPlayers[k]) { showToast((previousPlayers[k].name||k) + " left"); sfxLeave(); }
    }
    previousPlayers = {};
    for (const k of Object.keys(roomPlayers)) {
      previousPlayers[k] = roomPlayers[k] ? { name: roomPlayers[k].name } : null;
    }

    updatePlayerCount(roomPlayers);

    // Sync names
    player1Name = (roomPlayers.player1 && roomPlayers.player1.name) || "P1";
    if (!matchmakingInBackground) {
      player2Name = (roomPlayers.player2 && roomPlayers.player2.name) || "P2";
      player3Name = (roomPlayers.player3 && roomPlayers.player3.name) || "P3";
      player4Name = (roomPlayers.player4 && roomPlayers.player4.name) || "P4";
    }
    updatePlayerLegend();

    // ── Read opponents' directions & actions ──
    if (playerRole === "player1") {
      if (roomPlayers.player2) {
        if (roomPlayers.player2.direction) dir2 = roomPlayers.player2.direction;
        if (roomPlayers.player2.actionRequest) {
          const ar = roomPlayers.player2.actionRequest;
          if (ar.ts > (_processedArTs.player2 || 0)) {
            _processedArTs.player2 = ar.ts;
            if (ar.type === "inspect") detectiveInspect("p2");
            else if (ar.type === "scan") detectiveScan("p2");
            else if (ar.type === "teleport") imposterTeleport("p2");
          }
        }
      }
      if (roomPlayers.player3) {
        if (roomPlayers.player3.direction) dir3 = roomPlayers.player3.direction;
        if (roomPlayers.player3.actionRequest) {
          const ar = roomPlayers.player3.actionRequest;
          if (ar.ts > (_processedArTs.player3 || 0)) {
            _processedArTs.player3 = ar.ts;
            if (ar.type === "inspect") detectiveInspect("p3");
            else if (ar.type === "scan") detectiveScan("p3");
            else if (ar.type === "teleport") imposterTeleport("p3");
          }
        }
      }
      if (roomPlayers.player4) {
        if (roomPlayers.player4.direction) dir4 = roomPlayers.player4.direction;
        if (roomPlayers.player4.actionRequest) {
          const ar = roomPlayers.player4.actionRequest;
          if (ar.ts > (_processedArTs.player4 || 0)) {
            _processedArTs.player4 = ar.ts;
            if (ar.type === "inspect") detectiveInspect("p4");
            else if (ar.type === "scan") detectiveScan("p4");
            else if (ar.type === "teleport") imposterTeleport("p4");
          }
        }
      }
    } else {
      if (roomPlayers.player1 && roomPlayers.player1.direction) dir1 = roomPlayers.player1.direction;
      const others = { player2:"p2", player3:"p3", player4:"p4" };
      for (const [k, pid] of Object.entries(others)) {
        if (k === playerRole) continue;
        if (roomPlayers[k] && roomPlayers[k].direction) {
          if (pid==="p2") dir2=roomPlayers[k].direction;
          else if (pid==="p3") dir3=roomPlayers[k].direction;
          else if (pid==="p4") dir4=roomPlayers[k].direction;
        }
      }
    }

    // ── Guest: sync full game state ──
    if (playerRole !== "player1") {
      const gSyncId = g.syncId || 0;
      if (gSyncId !== lastGuestSyncId || g.gameOver) {
          lastGuestSyncId = gSyncId;

          // General predictive soft-sync: only hard-snap if lengths diverge (eaten/damaged), dead, or massively drifted.
          const softSync = (localS, hostG, isMe) => {
             if (!hostG) return localS;
             let hostS = normSnake(hostG, localS);
             if (!hostS || hostS.length === 0) return hostS; 
             if (!localS || localS.length === 0) return hostS;
             
             let dx = Math.abs(localS[0].x - hostS[0].x);
             let dy = Math.abs(localS[0].y - hostS[0].y);
             
             // If it's ME, trust local movement more aggressively (larger drift allowed before snapping)
             // This prevents that "teleporting" look when you're moving fast
             let driftLimit = isMe ? UNIT * 15 : UNIT * 6;
             if (dx + dy > driftLimit) return hostS;
             
             // Smooth tail correction if lengths differ seamlessly
             if (localS.length > hostS.length + 2) {
                while(localS.length > hostS.length) localS.pop();
             } else if (localS.length < hostS.length - 2) {
                while(localS.length < hostS.length) localS.push({...localS[localS.length-1]});
             }
             
             return localS; // Trust fast local prediction!
          };

          snake1 = softSync(snake1, g.snake1, false);
          
          // For opponents and local player, selectively soft-sync
          snake2 = softSync(snake2, g.snake2, playerRole === "player2");
          if (g.snake3 || snake3.length>0) snake3 = softSync(snake3, g.snake3, playerRole === "player3");
          if (g.snake4 || snake4.length>0) snake4 = softSync(snake4, g.snake4, playerRole === "player4");

          // Food Sync with Confirmation Locking
          if (consumeLockTimer > 0) {
             consumeLockTimer--;
             // While locked, only accept food if its ID is different from what we just ate
             if (g.food && g.food.id !== lastConsumedFoodId) {
                food = normPt(g.food, food);
                consumeLockTimer = 0; 
             }
          } else {
             food = normPt(g.food, food);
          }

          if (typeof g.score1==="number") score1=g.score1;
          // Local guest score sync logic: Only update local score if not locked (after eating food)
          const pIdxToScore = { player1:"score1", player2:"score2", player3:"score3", player4:"score4" };
          const myScoreVar = pIdxToScore[playerRole];
          
          if (typeof g.score2==="number" && (playerRole!=="player2" || consumeLockTimer===0)) score2=g.score2;
          if (typeof g.score3==="number" && (playerRole!=="player3" || consumeLockTimer===0)) score3=g.score3;
          if (typeof g.score4==="number" && (playerRole!=="player4" || consumeLockTimer===0)) score4=g.score4;
          
          if (typeof g.suddenDeathBorder==="number") suddenDeathBorder=g.suddenDeathBorder;
          if (typeof g.blitzSpeedLevel==="number") blitzSpeedLevel=g.blitzSpeedLevel;
          
          // Sync power-ups
          if (g.boardPowerUps) boardPowerUps = normArr(g.boardPowerUps);
          if (g.playerEffects) deserEffects(g.playerEffects);

          // King of the Castle sync
          if (gameModeSetting === "king_castle") {
            if (g.crownHolder !== undefined) crownHolder = g.crownHolder;
            if (g.crownPos !== undefined) crownPos = g.crownPos;
            if (typeof g.crownTimer === "number") crownTimer = g.crownTimer;
            if (g.crownTimeHeld) crownTimeHeld = g.crownTimeHeld;
          }

          // Detective Snake sync
          if (gameModeSetting === "detective") {
            if (g.detectivePlayer) detectivePlayer = g.detectivePlayer;
            if (typeof g.detectiveScore === "number") detectiveScore = g.detectiveScore;
            if (g.imposterScores) imposterScores = g.imposterScores;
            if (g.detectedPlayers) detectedPlayers = g.detectedPlayers;
            if (typeof g.scanCharges === "number") scanCharges = g.scanCharges;
            if (g.scanHighlights) scanHighlights = normArr(g.scanHighlights);
            if (typeof g.detectiveTimer === "number") detectiveTimer = g.detectiveTimer;
            if (g.npcSnakes) npcSnakes = normArr(g.npcSnakes);
            
            // Global teleport detection
            if (g.teleportEvent && g.teleportEvent.ts > _prevProcessedTeleportTs) {
              _prevProcessedTeleportTs = g.teleportEvent.ts;
              teleportFlash = 10;
              sfxPowerUp();
              showToast("An imposter has teleported!");
            }

            // Show detective buttons for guest if they are the detective
            const localPid = roleToP[playerRole] || "p1";
            const isMeDetective = (localPid === detectivePlayer);
            const inspBtn = document.getElementById("inspectBtn");
            const scanBtn = document.getElementById("scanBtn");
            const telBtn = document.getElementById("teleportBtn");
            if (inspBtn) inspBtn.style.display = isMeDetective ? "inline-flex" : "none";
            if (scanBtn) scanBtn.style.display = isMeDetective ? "inline-flex" : "none";
            if (telBtn) telBtn.style.display = (!isMeDetective && !gameOver) ? "inline-flex" : "none";
          }

          if (g.gameOver && !gameOver) {
            gameOver=true; winner=g.winner||null; clearGameTimer(); sfxGameOver(); stopBGM();
            if (mode === "online") saveOnlineLeaderboard();
          }
      }
    }

    // ── HOST: Spawn P3/P4 that join mid-game (CRITICAL BUG FIX) ──
    if (playerRole === "player1" && interval && !gameOver) {
      if (roomPlayers.player3 && !wasP3 && (!snake3 || snake3.length === 0)) {
        player3Name = roomPlayers.player3.name || "P3";
        snake3 = [{ x:440,y:100 },{ x:440,y:80 },{ x:440,y:60 }];
        dir3 = "DOWN"; score3 = START_SCORE;
        syncToPlayers();
        activePlayerCount = players.filter(p => p && p.snake && p.snake.length > 0).length;
        updatePlayerLegend();
        showToast(player3Name + " joined! Snake spawned.");
        syncRoomState();
      }
      if (roomPlayers.player4 && !wasP4 && (!snake4 || snake4.length === 0)) {
        player4Name = roomPlayers.player4.name || "P4";
        snake4 = [{ x:440,y:500 },{ x:440,y:520 },{ x:440,y:540 }];
        dir4 = "UP"; score4 = START_SCORE;
        syncToPlayers();
        activePlayerCount = players.filter(p => p && p.snake && p.snake.length > 0).length;
        updatePlayerLegend();
        showToast(player4Name + " joined! Snake spawned.");
        syncRoomState();
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

    const tryBtn = document.getElementById("tryAIBtn");
    if (tryBtn) tryBtn.style.display = (matchmakingActive && !hasP2 && !matchmakingInBackground) ? "inline-flex" : "none";

    // ── Host: start game when P2 joins ──
    if (playerRole === "player1") {
      if (hasP2 && (!gameOver || matchmakingInBackground)) {
        if (matchmakingInBackground) {
          clearAiTimer(); clearGameTimer();
          matchmakingInBackground = false; matchmakingActive = false;
          if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
          clearPollInterval();
          mode = "online";
          player2Name = (roomPlayers.player2 && roomPlayers.player2.name) || "P2";
          updatePlayerLegend();
          resetGameState(); _syncFrameCount = 0;
          interval = setInterval(hostGameLoop, GAME_SPEED); startBGM(); syncRoomState(); schedulePowerUpSpawn();
          const mmBar = document.getElementById("matchmakingBar"); if (mmBar) mmBar.style.display = "none";
          showGame(true, false); showCopyBtn(currentRoomId);
          showToast("Opponent found! Game starting..."); sfxJoin();
        } else if (!interval) {
          matchmakingActive = false;
          if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
          clearPollInterval();
          resetGameState(); _syncFrameCount = 0;
          interval = setInterval(hostGameLoop, GAME_SPEED); startBGM(); syncRoomState(); schedulePowerUpSpawn();
        }
      } else if (!hasP2 && !matchmakingInBackground) {
        clearGameTimer();
      }
    }

    // Guest independent loop: If host game is running, guest starts local simulation to fix latency freezes
    if (playerRole !== "player1" && mode === "online") {
      stopGuestRenderLoop();
      if (!g.gameOver && !interval) {
        console.log("Guest establishing predictive engine loop.");
        // We sync exactly the same speed to remain generally parallel to host updates
        interval = setInterval(gameLoop, GAME_SPEED);
      }
    }

    // ── Restart votes & Automatic Re-sync ──
    const votes = room.restartVotes || {};
    
    // 1. Implicit Restart Sync: If Host says !gameOver but Guest is still dead, snap to match Host immediately.
    if (playerRole !== "player1" && gameOver && !g.gameOver) {
       console.log("[Sync] Host restarted match. snapping Guest to new game state.");
       clearGameTimer();
       resetGameState();
       _syncFrameCount = 0;
       showToast("Game restarted!");
       startBGM(); 
       draw(); // Clear leftover banners
    }

    // 2. Explicit Vote Handler (Guest & Host)
    if (votes.player1 && votes.player2) {
      if (playerRole !== "player1") {
        if (gameOver) { // Only reset if we haven't already auto-snapped above
           clearGameTimer();
           resetGameState();
           _syncFrameCount = 0;
           showToast("Game restarted!");
           startBGM();
           draw();
        }
      }
    } else if (votes.player1 && playerRole!=="player1") {
      showGameStatus(currentRoomId + " \u2014 Opponent wants to restart.");
    } else if (votes.player2 && playerRole==="player1") {
      showGameStatus(currentRoomId + " \u2014 Opponent wants to restart.");
    }

    // Guest only draws when NOT in RAF loop (RAF loop handles continuous draw)
    if (playerRole === "player1") draw();
  };

  roomRef.on("value", roomListener);
  console.log("[Room] Listener registered");
}

// ══════════════════════════════════════════════════════════
//  GAME MODE STARTERS
// ══════════════════════════════════════════════════════════
function startLocal() {
  let gmInput = document.getElementById("gameModeInput");
  const preliminaryMode = gmInput ? gmInput.value : "normal";
  if (preliminaryMode === "last_man") { alert("Last Man Standing is Online only."); return; }
  sfxClick();

  // King of Castle: show timer modal first
  if (preliminaryMode === "king_castle") {
    showTimerModal("KING OF THE CASTLE", [
      { label: "1:00", value: 60000 },
      { label: "1:30", value: 90000 },
      { label: "2:00", value: 120000 }
    ], (duration) => {
      stopCurrentSession();
      gameModeSetting = "king_castle";
      crownTimerDuration = duration;
      mode = "local"; player1Name = getPlayerName("P1"); player2Name = "P2";
      initGame(gameLoop); showGame(false, true);
      showGameStatus("Local 2P — KING OF THE CASTLE");
    });
    return;
  }

  // Detective Snake: show timer modal first
  if (preliminaryMode === "detective") {
    showTimerModal("DETECTIVE SNAKE", [
      { label: "1:00", value: 60000 },
      { label: "2:00", value: 120000 },
      { label: "3:00", value: 180000 }
    ], (duration) => {
      stopCurrentSession();
      gameModeSetting = "detective";
      detectiveTimerDuration = duration;
      mode = "local"; player1Name = getPlayerName("P1"); player2Name = "P2";
      initGame(gameLoop); showGame(false, true);
      showGameStatus("Local 2P — DETECTIVE SNAKE");
      // Show detective-specific controls
      const inspBtn = document.getElementById("inspectBtn");
      if (inspBtn) inspBtn.style.display = "inline-flex";
      const scanBtn = document.getElementById("scanBtn");
      if (scanBtn) scanBtn.style.display = "inline-flex";
    });
    return;
  }

  stopCurrentSession();
  gameModeSetting = preliminaryMode;
  mode = "local"; player1Name = getPlayerName("P1"); player2Name = "P2";
  initGame(gameLoop); showGame(false, true);
  showGameStatus("Local 2P" + (gameModeSetting !== "normal" ? " — " + gameModeSetting.replace("_"," ").toUpperCase() : ""));
}

function startAI() { sfxClick(); document.getElementById("aiModal").style.display = "flex"; }
function closeAIModal() { document.getElementById("aiModal").style.display = "none"; }

function startAIWithDiff(diff) {
  sfxClick(); closeAIModal();

  if (matchmakingInBackground) {
    aiDifficulty = diff; clearAiTimer();
    const speeds = { easy:350, medium:250, hard:150, impossible:90 };
    aiInterval = setInterval(aiTick, speeds[diff]||200);
    showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")");
    updateAIDifficultyBtn(diff); showToast("AI difficulty changed to " + diff); return;
  }
  if (_aiModalForMatchmaking) { _aiModalForMatchmaking = false; startAIWhileMatchmaking(diff); return; }
  if (mode === "ai" && interval) {
    aiDifficulty = diff; 
    stopCurrentSession();
    mode = "ai";
    player1Name = getPlayerName("P1"); player2Name = "AI";
    initGame(gameLoop); showGame(true, false);
    const speeds = { easy:350, medium:250, hard:150, impossible:90 };
    aiInterval = setInterval(aiTick, speeds[diff]||200);
    showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")");
    updateAIDifficultyBtn(diff); showToast("Difficulty changed - Restarting!"); return;
  }

  stopCurrentSession();
  let gmInput = document.getElementById("gameModeInput");
  const preliminaryMode = gmInput ? gmInput.value : "normal";
  if (preliminaryMode === "last_man") { alert("Last Man Standing is Online only."); return; }
  if (preliminaryMode === "king_castle") { alert("King of the Castle requires multiplayer. Use Local or Online."); return; }
  if (preliminaryMode === "detective") { alert("Detective Snake requires multiplayer. Use Local or Online."); return; }

  gameModeSetting = preliminaryMode;
  mode = "ai"; aiDifficulty = diff;
  player1Name = getPlayerName("P1"); player2Name = "AI";
  initGame(gameLoop); showGame(true, false);
  const speeds = { easy:350, medium:250, hard:150, impossible:90 };
  aiInterval = setInterval(aiTick, speeds[diff]||200);
  showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ")" +
    (gameModeSetting !== "normal" ? " — " + gameModeSetting.replace("_"," ").toUpperCase() : ""));
  updateAIDifficultyBtn(diff);
}

function tryAIWhileWaiting() { sfxClick(); _aiModalForMatchmaking = true; document.getElementById("aiModal").style.display = "flex"; }

function startAIWhileMatchmaking(diff) {
  matchmakingInBackground = true; aiDifficulty = diff; player2Name = "AI"; updatePlayerLegend();
  clearGameTimer(); clearAiTimer(); resetGameState();
  
  // Force normal mode for practice
  gameModeSetting = "normal";
  
  interval = setInterval(gameLoop, GAME_SPEED);
  const speeds = { easy:350, medium:250, hard:150, impossible:90 };
  aiInterval = setInterval(aiTick, speeds[diff]||200);
  schedulePowerUpSpawn();
  showGame(true, false); showCopyBtn(currentRoomId);
  const tryBtn = document.getElementById("tryAIBtn"); if (tryBtn) tryBtn.style.display = "none";
  const mmBar = document.getElementById("matchmakingBar"); if (mmBar) mmBar.style.display = "flex";
  showGameStatus("vs AI (" + diff.charAt(0).toUpperCase() + diff.slice(1) + ") — PRACTICE");
  updateAIDifficultyBtn(diff); startBGM(); draw();
}

function cancelBackgroundMatchmaking() {
  sfxClick(); matchmakingInBackground = false; matchmakingActive = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
  if (roomRef && playerRole === "player1") { const r = roomRef; roomRef = null; r.remove().catch(()=>{}); }
  detachRoom(); mode = "ai";
  const mmBar = document.getElementById("matchmakingBar"); if (mmBar) mmBar.style.display = "none";
  hideCopyBtn();
  const pcEl = document.getElementById("playerCount"); if (pcEl) pcEl.style.display = "none";
  showGameStatus("vs AI (" + aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1) + ")");
  showToast("Matchmaking cancelled. AI game continues.");
}

// ══════════════════════════════════════════════════════════
//  ONLINE: CREATE ROOM
// ══════════════════════════════════════════════════════════
function createRoom(isPublic) {
  sfxClick();
  let gmInput = document.getElementById("gameModeInput");
  const preliminaryMode = gmInput ? gmInput.value : "normal";

  // King of Castle: show timer modal first
  if (preliminaryMode === "king_castle") {
    showTimerModal("KING OF THE CASTLE", [
      { label: "1:00", value: 60000 },
      { label: "1:30", value: 90000 },
      { label: "2:00", value: 120000 }
    ], (duration) => {
      crownTimerDuration = duration;
      gameModeSetting = "king_castle";
      _doCreateRoom(isPublic);
    });
    return;
  }
  if (preliminaryMode === "detective") {
    showTimerModal("DETECTIVE SNAKE", [
      { label: "1:00", value: 60000 },
      { label: "2:00", value: 120000 },
      { label: "3:00", value: 180000 }
    ], (duration) => {
      detectiveTimerDuration = duration;
      gameModeSetting = "detective";
      _doCreateRoom(isPublic);
    });
    return;
  }

  gameModeSetting = preliminaryMode;
  _doCreateRoom(isPublic);
}

function _doCreateRoom(isPublic) {
  const roomId = isPublic ? genRoomId() : (getRoomId() || genRoomId());
  const pName = getPlayerName("P1");
  stopCurrentSession(); mode = "online"; currentRoomId = roomId; playerRole = "player1";
  player1Name = pName; player2Name = "Waiting...";
  if (roomInp) roomInp.value = roomId;
  resetGameState(); _syncFrameCount = 0;

  const ref = db.ref("rooms/" + roomId);
  roomRef = ref;
  ref.set({
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    status: "waiting",
    roomType: isPublic ? "public" : "private",
    gameMode: gameModeSetting,
    crownTimerDuration: crownTimerDuration,
    detectiveTimerDuration: detectiveTimerDuration,
    players: { player1: { name:pName, direction:"RIGHT", joinedAt:Date.now() } },
    game: serState()
  }).catch(e => showToast("Room creation failed: " + e.message));

  ref.child("players/player1").onDisconnect().remove().catch(()=>{});
  ref.child("status").onDisconnect().set("abandoned").catch(()=>{});

  showGame(true, false);
  showGameStatus("Room: " + roomId + " \u2014 Waiting for opponent...");
  showCopyBtn(roomId); hideStatus(); bindRoomListener(); startPollForPlayer2(); draw();
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

  db.ref("rooms/" + roomId).once("value").then(snap => {
    if (!snap.exists()) { showStatus("Room " + roomId + " does not exist."); return; }
    const roomData = snap.val();
    const rp = roomData.players || {};
    const slots = ["player2","player3","player4"];
    let joinSlot = ""; for (const s of slots) { if (!rp[s]) { joinSlot = s; break; } }
    if (!joinSlot) { showStatus("Room " + roomId + " is full (4/4)."); return; }

    stopCurrentSession();
    mode = "online"; currentRoomId = roomId; playerRole = joinSlot; roomRef = db.ref("rooms/" + roomId);
    if (roomData.gameMode) gameModeSetting = roomData.gameMode;
    if (typeof roomData.crownTimerDuration === "number") crownTimerDuration = roomData.crownTimerDuration;
    if (typeof roomData.detectiveTimerDuration === "number") detectiveTimerDuration = roomData.detectiveTimerDuration;

    const dirMap = { player2:"LEFT", player3:"DOWN", player4:"UP" };
    if (joinSlot==="player2") player2Name=pName;
    else if (joinSlot==="player3") player3Name=pName;
    else if (joinSlot==="player4") player4Name=pName;
    player1Name = (rp.player1 && rp.player1.name) || "P1";
    resetGameState(); _syncFrameCount = 0;

    const updateData = {};
    updateData["players/" + joinSlot] = { name:pName, direction:dirMap[joinSlot]||"LEFT", joinedAt:Date.now() };
    updateData["status"] = "waiting";
    roomRef.update(updateData).catch(e => showToast("Join failed: " + e.message));
    roomRef.child("players/" + joinSlot).onDisconnect().remove().catch(()=>{});

    showGame(true, false); showCopyBtn(roomId); hideStatus(); startBGM(); bindRoomListener();
  }).catch(e => showStatus("Cannot read room: " + e.message));
}

// ══════════════════════════════════════════════════════════
//  ONLINE: MATCHMAKING
// ══════════════════════════════════════════════════════════
function startMatchmaking() {
  sfxClick(); matchmakingActive = true;
  showStatus("Searching for opponent...");
  const cmBtn = document.getElementById("cancelMatchBtn"); if (cmBtn) cmBtn.style.display = "inline-flex";

  // Get selected game mode — MODE MISMATCH FIX
  const gmInput = document.getElementById("gameModeInput");
  const selectedMode = gmInput ? gmInput.value : "normal";

  matchmakingTimeout = setTimeout(() => {
    if (matchmakingActive && !interval && !gameOver && currentRoomId) {
      db.ref("rooms/" + currentRoomId + "/players").once("value").then(snap => {
        const pObj = snap.val() || {};
        if (Object.keys(pObj).length < 2 && playerRole === "player1") {
          showGameStatus(currentRoomId + " \u2014 No players found. Try AI while waiting?");
          showToast("No players found yet. Try AI mode?");
        }
      });
    }
  }, 8000);

  db.ref("rooms").orderByChild("status").equalTo("waiting").limitToFirst(10)
    .once("value").then(snap => {
      if (!matchmakingActive) return;
      const rooms = snap.val();
      if (rooms) {
        for (const [id, room] of Object.entries(rooms)) {
          if (room.roomType !== "public") continue;
          // MODE MISMATCH FIX: only join rooms with matching game mode
          if ((room.gameMode || "normal") !== selectedMode) continue;
          const pCount = room.players ? Object.keys(room.players).length : 0;
          if (pCount > 0 && pCount < 4) {
            const age = room.createdAt ? Date.now() - room.createdAt : 0;
            if (age > 300000) { db.ref("rooms/" + id).remove().catch(()=>{}); continue; }
            if (roomInp) roomInp.value = id;
            joinRoom(); return;
          }
        }
      }
      showStatus("No opponents found. Creating room...");
      if (roomInp) roomInp.value = "";
      createRoom(true);
    }).catch(e => { showStatus("Search failed. Creating room..."); if (roomInp) roomInp.value = ""; createRoom(true); });
}

function cancelMatchmaking() {
  sfxClick(); matchmakingActive = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
  const cmBtn = document.getElementById("cancelMatchBtn"); if (cmBtn) cmBtn.style.display = "none";
  hideStatus();
  if (mode === "online" && roomRef) goBack(); else showMenu();
}

// ══════════════════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════════════════
let _lbLastSave = 0;

function saveOnlineLeaderboard() {
  if (!gameOver || mode !== "online") return;
  // Prevent spam saves (1 save per session)
  if (Date.now() - _lbLastSave < 5000) return;
  _lbLastSave = Date.now();

  const roleMap = { player1:"p1", player2:"p2", player3:"p3", player4:"p4" };
  const myPid = roleMap[playerRole] || "p1";
  const myScore = myPid==="p1"?score1 : myPid==="p2"?score2 : myPid==="p3"?score3 : score4;
  const myName = myPid==="p1"?player1Name : myPid==="p2"?player2Name : myPid==="p3"?player3Name : player4Name;

  if (!myName || myScore <= 0) return;
  db.ref("leaderboard/online").push({
    name: myName, score: myScore, ts: firebase.database.ServerValue.TIMESTAMP
  }).catch(() => {});
}

function promptImpossibleLeaderboard() {
  const modal = document.getElementById("lbNameModal");
  if (modal) {
    const sc = document.getElementById("lbNameScore");
    if (sc) sc.textContent = "You beat Impossible AI with " + score1 + " pts!";
    const inp = document.getElementById("lbNameInput");
    if (inp) inp.value = (nameInp ? nameInp.value.trim() : "") || "";
    modal.style.display = "flex";
  }
}

function submitImpossibleScore() {
  sfxClick();
  const inp = document.getElementById("lbNameInput");
  const name = inp ? inp.value.trim() : "";
  if (!name) { showToast("Enter your name first!"); return; }
  db.ref("leaderboard/ai_impossible").push({
    name, score: score1, ts: firebase.database.ServerValue.TIMESTAMP
  }).then(() => { showToast("Score saved! " + name + ": " + score1); closeImpossibleModal(); })
  .catch(() => { showToast("Save failed. Try again."); });
}

function closeImpossibleModal() {
  const m = document.getElementById("lbNameModal"); if (m) m.style.display = "none";
}

function showLeaderboard() {
  sfxClick();
  const modal = document.getElementById("lbModal"); if (!modal) return;
  modal.style.display = "flex";
  loadLbTab("online");
}

function closeLeaderboard() {
  sfxClick();
  const m = document.getElementById("lbModal"); if (m) m.style.display = "none";
}

function loadLbTab(tab) {
  const online = document.getElementById("lbTabOnline");
  const ai = document.getElementById("lbTabAI");
  const body = document.getElementById("lbBody");
  if (!body) return;

  if (online) online.classList.toggle("active", tab === "online");
  if (ai) ai.classList.toggle("active", tab === "ai_impossible");

  body.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#555;padding:12px">Loading...</td></tr>';

  db.ref("leaderboard/" + tab).orderByChild("score").limitToLast(10).once("value").then(snap => {
    const entries = [];
    snap.forEach(c => { const v = c.val(); if (v) entries.push(v); });
    entries.sort((a,b) => (b.score||0) - (a.score||0));
    if (!entries.length) {
      body.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#555;padding:12px">No entries yet — play a game!</td></tr>';
      return;
    }
    const medals = ["🥇","🥈","🥉"];
    body.innerHTML = entries.slice(0,10).map((e,i) => {
      const rank = medals[i] || ("#" + (i+1));
      const color = i===0?"#ffcc00":i===1?"#aaa":i===2?"#cd7f32":"#666";
      return `<tr><td style="color:${color};font-size:14px">${rank}</td><td style="color:#ddd">${escHtml(e.name||"?")}</td><td style="color:var(--green);font-weight:bold">${e.score||0}</td></tr>`;
    }).join("");
  }).catch(() => {
    body.innerHTML = '<tr><td colspan="3" style="color:#ff4466;text-align:center">Load failed</td></tr>';
  });
}

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ══════════════════════════════════════════════════════════
//  UI FUNCTIONS
// ══════════════════════════════════════════════════════════
function goBack() {
  sfxClick();
  matchmakingActive = false; matchmakingInBackground = false; _aiModalForMatchmaking = false;
  if (matchmakingTimeout) { clearTimeout(matchmakingTimeout); matchmakingTimeout = null; }
  const cmBtn = document.getElementById("cancelMatchBtn"); if (cmBtn) cmBtn.style.display = "none";
  const mmBar = document.getElementById("matchmakingBar"); if (mmBar) mmBar.style.display = "none";
  if ((mode === "online" || matchmakingInBackground) && roomRef) {
    if (playerRole === "player1") roomRef.remove().catch(()=>{});
    else roomRef.child("players/" + playerRole).remove().catch(()=>{});
  }
  stopCurrentSession(); clearAiTimer(); stopBGM();
  mode = ""; gameOver = false; winner = null;
  // Hide detective buttons
  const inspBtn = document.getElementById("inspectBtn"); if (inspBtn) inspBtn.style.display = "none";
  const scanBtn = document.getElementById("scanBtn"); if (scanBtn) scanBtn.style.display = "none";
  hideCopyBtn(); hideRestartBtn(); showMenu();
}

function setRulesPage(p) {
  sfxClick();
  for (let i = 1; i <= 4; i++) {
    const pg = document.getElementById("rulesPage" + i);
    if (pg) pg.style.display = (i === p) ? "block" : "none";
  }
}
function showRules() { setRulesPage(1); sfxClick(); document.getElementById("rulesModal").style.display = "flex"; }
function closeRules() { sfxClick(); document.getElementById("rulesModal").style.display = "none"; }

function showCopyBtn(code) {
  const btn = document.getElementById("copyCodeBtn");
  if (btn) { btn.style.display = "inline-flex"; btn.setAttribute("data-code", code); }
  if (gameStatEl) {
    gameStatEl.classList.add("has-room"); gameStatEl.title = "Tap to copy: " + code;
    gameStatEl.onclick = () => doCopy(code);
    gameStatEl.ontouchend = e => { e.preventDefault(); doCopy(code); };
  }
}
function hideCopyBtn() {
  const btn = document.getElementById("copyCodeBtn"); if (btn) btn.style.display = "none";
  if (gameStatEl) { gameStatEl.classList.remove("has-room"); gameStatEl.title = ""; gameStatEl.onclick = null; gameStatEl.ontouchend = null; }
}
function copyRoomCode() { sfxClick(); const btn = document.getElementById("copyCodeBtn"); const code = btn ? btn.getAttribute("data-code") : currentRoomId; if (code) doCopy(code); }
function doCopy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => showToast("Copied: " + text)).catch(() => fallbackCopy(text)); }
  else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand("copy"); } catch(e) {}
  document.body.removeChild(ta); showToast("Copied: " + text);
}

function showRestartBtn() { const b = document.getElementById("restartBtn"); if (b) b.style.display = "inline-flex"; }
function hideRestartBtn() { const b = document.getElementById("restartBtn"); if (b) b.style.display = "none"; }

function restartGame() {
  sfxClick();
  if (mode === "ai" || mode === "local" || matchmakingInBackground) {
    if (mode === "ai" || matchmakingInBackground) {
      const diff = aiDifficulty; clearAiTimer(); clearGameTimer();
      resetGameState(); _syncFrameCount = 0;
      interval = setInterval(gameLoop, GAME_SPEED);
      const speeds = { easy:350, medium:250, hard:150, impossible:90 };
      aiInterval = setInterval(aiTick, speeds[diff]||200);
      schedulePowerUpSpawn();
    } else { 
      clearGameTimer(); resetGameState(); _syncFrameCount = 0; 
      interval = setInterval(gameLoop, GAME_SPEED); schedulePowerUpSpawn(); 
    }
    startBGM(); draw(); showToast("Game restarted!");
  } else if (mode === "online" && roomRef) {
    // Cast the vote only. The roomListener handles the actual reset.
    roomRef.child("restartVotes/" + playerRole).set(true);
    showToast("Restart vote cast.");
    
    roomRef.child("restartVotes").once("value").then(snap => {
      const v = snap.val() || {};
      if (v.player1 && v.player2 && playerRole === "player1") {
           roomRef.child("restartVotes").remove();
           clearGameTimer();
           resetGameState();
           _syncFrameCount = 0;
           interval = setInterval(hostGameLoop, GAME_SPEED);
           syncRoomState();
           startBGM(); draw();
           schedulePowerUpSpawn();
      }
    });
  }
}

// ── Bug Report ────────────────────────────────────────────
function showBugReport() { sfxClick(); document.getElementById("bugModal").style.display = "flex"; }
function closeBugReport() { sfxClick(); document.getElementById("bugModal").style.display = "none"; }

function sendBugReport(e) {
  sfxClick();
  const ta = document.getElementById("bugText"); const text = ta ? ta.value.trim() : "";
  if (!text) { showToast("Describe the bug first."); return; }

  const btn = e?.target?.closest("button") || document.querySelector("#bugModal .diff-easy");
  const oldText = btn ? btn.textContent : "SEND REPORT";
  if (btn) { btn.disabled = true; btn.textContent = "SENDING..."; btn.style.opacity = "0.5"; }

  fetch("https://formsubmit.co/ajax/harshitrawat3125@gmail.com", {
    method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"},
    body: JSON.stringify({ _subject:"Snake Battle Bug Report", message:text, _captcha:"false" })
  }).then(r=>r.json()).then(()=>{ 
    ta.value=""; hideBugReport(); showToast("Bug report sent!"); 
  })
  .catch(()=>showToast("Failed to send. Try again."))
  .finally(() => {
    if (btn) { btn.disabled = false; btn.textContent = oldText; btn.style.opacity = "1"; }
  });
}

function hideBugReport() { document.getElementById("bugModal").style.display = "none"; }

// ── Input Handling ────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;
  
  const k = e.key;
  const roleToP = { player1:"p1", player2:"p2", player3:"p3", player4:"p4" };

  if (mode === "online") {
    const p = roleToP[playerRole] || "p1";
    if (k==="w"||k==="W"||k==="ArrowUp")    { e.preventDefault(); applyDirection(p,"UP"); }
    if (k==="s"||k==="S"||k==="ArrowDown")  { e.preventDefault(); applyDirection(p,"DOWN"); }
    if (k==="a"||k==="A"||k==="ArrowLeft")  { e.preventDefault(); applyDirection(p,"LEFT"); }
    if (k==="d"||k==="D"||k==="ArrowRight") { e.preventDefault(); applyDirection(p,"RIGHT"); }
  } else if (mode === "ai") {
    if (k==="w"||k==="W"||k==="ArrowUp")    { e.preventDefault(); applyDirection("p1","UP"); }
    if (k==="s"||k==="S"||k==="ArrowDown")  { e.preventDefault(); applyDirection("p1","DOWN"); }
    if (k==="a"||k==="A"||k==="ArrowLeft")  { e.preventDefault(); applyDirection("p1","LEFT"); }
    if (k==="d"||k==="D"||k==="ArrowRight") { e.preventDefault(); applyDirection("p1","RIGHT"); }
  } else {
    if (k==="w"||k==="W") applyDirection("p1","UP");
    if (k==="s"||k==="S") applyDirection("p1","DOWN");
    if (k==="a"||k==="A") applyDirection("p1","LEFT");
    if (k==="d"||k==="D") applyDirection("p1","RIGHT");
    if (k==="ArrowUp")    { e.preventDefault(); applyDirection("p2","UP"); }
    if (k==="ArrowDown")  { e.preventDefault(); applyDirection("p2","DOWN"); }
    if (k==="ArrowLeft")  { e.preventDefault(); applyDirection("p2","LEFT"); }
    if (k==="ArrowRight") { e.preventDefault(); applyDirection("p2","RIGHT"); }
  }

  // Detective / Imposter keys
  if (k === "e" || k === "E") detectiveInspect();
  if (k === "f" || k === "F") {
    const isDetective = (mode === "online" ? (roleToP[playerRole]||"p1") : "p1") === detectivePlayer;
    if (isDetective) detectiveScan();
    else imposterTeleport();
  }
});

let _lastMobileDir = 0;
function mobileDir(pIdx, dir) {
  const now = Date.now(); if (now - _lastMobileDir < 55) return;
  _lastMobileDir = now; sfxClick();
  if (pIdx === 0) {
    if (mode === "online") applyDirection(roleToP[playerRole]||"p1", dir);
    else applyDirection("p1", dir);
  } else if (pIdx===1) applyDirection("p1", dir);
  else if (pIdx===2) applyDirection("p2", dir);
  else if (pIdx===3) applyDirection("p3", dir);
  else if (pIdx===4) applyDirection("p4", dir);
}

// ── Initialization ────────────────────────────────────────
// ══════════════════════════════════════════════════════════
//  TITLE MARQUEE LOGIC
// ══════════════════════════════════════════════════════════
const MARQUEE_MSGS = [
  "Project by Harshit Rawat",
  "Try the new modes: King of the Castle and Detective Snake!",
  "Tips: Use WASD/Arrows to move. E to Inspect, F to Scan in Detective mode.",
  "Hint: Press F11 for Fullscreen or click the top-right button!",
  "New: Imposters can teleport twice using F or mobile button!",
  "Follow me on GitHub",
  "Report bugs in the menu",
  "Press R to Restart and Press M for menu",
  "Good luck, have fun!"
];
let _mqIdx = 0;
function updateMarquee() {
  const mq = document.getElementById("marqueeText");
  const mqRules = document.getElementById("rulesMarqueeText");
  if (!mq) return;
  _mqIdx = (_mqIdx + 1) % MARQUEE_MSGS.length;
  const msg = MARQUEE_MSGS[_mqIdx];
  mq.textContent = msg;
  if (mqRules) mqRules.textContent = msg;

  // Restart animation
  mq.style.animation = "none";
  mq.offsetHeight; // trigger reflow
  mq.style.animation = "marquee 15s linear infinite";

  if (mqRules) {
    mqRules.style.animation = "none";
    mqRules.offsetHeight;
    mqRules.style.animation = "marquee-fast 7s linear infinite";
  }
}
setInterval(updateMarquee, 15000);

// Initialization moved to the end of file to ensure all constants (like MODE_SUMMARIES) are defined

// ══════════════════════════════════════════════════════════
//  FULLSCREEN + SWIPE CONTROLS
// ══════════════════════════════════════════════════════════
function toggleFullscreen() {
  sfxClick();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener("fullscreenchange", () => {
  isFullscreen = !!document.fullscreenElement;
  const btn = document.getElementById("btnFullscreen");
  if (btn) {
    btn.innerHTML = isFullscreen
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>';
  }
});

// Swipe controls on canvas
canvas.addEventListener("touchstart", function(e) {
  if (e.touches.length === 1) {
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
  }
}, { passive: true });

canvas.addEventListener("touchend", function(e) {
  if (e.changedTouches.length !== 1) return;
  const dx = e.changedTouches[0].clientX - _swipeStartX;
  const dy = e.changedTouches[0].clientY - _swipeStartY;
  const minSwipe = 30;
  if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

  let dir;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = dx > 0 ? "RIGHT" : "LEFT";
  } else {
    dir = dy > 0 ? "DOWN" : "UP";
  }

  if (mode === "online") {
    applyDirection(roleToP[playerRole] || "p1", dir);
  } else {
    applyDirection("p1", dir);
  }
}, { passive: true });

// ══════════════════════════════════════════════════════════
//  TIMER MODAL (King of Castle / Detective)
// ══════════════════════════════════════════════════════════
let _timerModalCallback = null;
function showTimerModal(modeName, options, callback) {
  _timerModalCallback = callback;
  const modal = document.getElementById("timerModal");
  if (!modal) return;
  const title = document.getElementById("timerModalTitle");
  const btns = document.getElementById("timerModalBtns");
  if (title) title.textContent = modeName + " - SELECT TIMER";
  if (btns) {
    btns.innerHTML = "";
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "diff-btn diff-medium";
      btn.textContent = opt.label;
      btn.onclick = () => {
        sfxClick();
        modal.style.display = "none";
        if (_timerModalCallback) _timerModalCallback(opt.value);
      };
      btns.appendChild(btn);
    });
    const cancel = document.createElement("button");
    cancel.className = "diff-btn";
    cancel.style.cssText = "border-color:#555;color:#666;margin-top:4px";
    cancel.textContent = "CANCEL";
    cancel.onclick = () => { sfxClick(); modal.style.display = "none"; };
    btns.appendChild(cancel);
  }
  modal.style.display = "flex";
}

// ══════════════════════════════════════════════════════════
//  NEW MODE STARTERS
// ══════════════════════════════════════════════════════════
function checkModeRestriction(modeName) {
  if (modeName === "king_castle" || modeName === "detective") {
    return true; // These require a modal for timer selection
  }
  if (modeName === "last_man") {
    return true; // Online only
  }
  return false;
}

// ── Rules extra pages ──────────────────────────────────
function setRulesPage(p) {
  sfxClick();
  for (let i = 1; i <= 4; i++) {
    const pg = document.getElementById("rulesPage" + i);
    if (pg) pg.style.display = (i === p) ? "block" : "none";
  }
}

// ── Mode summary updater ───────────────────────────────
const MODE_SUMMARIES = {
  normal: "Classic snake battle. Eat food, grow, and outlast your opponent!",
  sudden_death: "Walls close in after 10s. Survive the shrinking arena!",
  blitz: "Speed increases every 10s. How fast can you go?",
  last_man: "Online only. Last snake alive wins!",
  king_castle: "Grab the crown! Holder moves 3x fast. Most hold time wins.",
  detective: "One detective, others hide as NPCs. Find the imposters!"
};

function updateModeSummary() {
  const sel = document.getElementById("gameModeInput");
  const sumEl = document.getElementById("modeSummary");
  if (!sel || !sumEl) return;
  sumEl.textContent = MODE_SUMMARIES[sel.value] || "";
}

// Attach listener for mode dropdown
document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("gameModeInput");
  if (sel) {
    sel.addEventListener("change", updateModeSummary);
    updateModeSummary();
  }
});
// Also call immediately in case DOMContentLoaded already fired
try { updateModeSummary(); } catch(e) {}

// ── Keyboard Shortcuts ────────────────────────────────────
window.addEventListener("keydown", (e) => {
  const k = e.key.toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  if (k === "R") restartGame();
  if (k === "M") goBack();
});

// ── Realistic Menu Snake Animation ───────────────────────
let menuSnakeCanvas = null, menuSnakeCtx = null;
let menuSnakeReq = null;
let menuSnakePoints = [];
const MENU_SNAKE_LEN = 18;

function startMenuSnake() {
  if (menuSnakeReq) return;
  if (!menuSnakeCanvas) {
    menuSnakeCanvas = document.createElement("canvas");
    menuSnakeCanvas.id = "menuSnakeCanvas";
    menuSnakeCanvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:-1;opacity:0.4;";
    document.body.appendChild(menuSnakeCanvas);
    menuSnakeCtx = menuSnakeCanvas.getContext("2d");
    window.addEventListener("resize", () => {
      if (menuSnakeCanvas) { menuSnakeCanvas.width = window.innerWidth; menuSnakeCanvas.height = window.innerHeight; }
    });
  }
  menuSnakeCanvas.width = window.innerWidth; menuSnakeCanvas.height = window.innerHeight;
  
  // Init points
  menuSnakePoints = [];
  const startX = Math.random() * menuSnakeCanvas.width;
  const startY = Math.random() * menuSnakeCanvas.height;
  for(let i=0; i<MENU_SNAKE_LEN; i++) menuSnakePoints.push({x:startX, y:startY});
  
  let angle = Math.random() * Math.PI * 2;
  let speed = 2.5;
  
  const loop = () => {
    menuSnakeCtx.clearRect(0,0,menuSnakeCanvas.width, menuSnakeCanvas.height);
    
    // Smooth movement
    angle += (Math.random() - 0.5) * 0.15;
    const head = menuSnakePoints[0];
    let nextX = head.x + Math.cos(angle) * speed;
    let nextY = head.y + Math.sin(angle) * speed;
    
    // Bounds check
    if(nextX < -50) nextX = menuSnakeCanvas.width + 50;
    if(nextX > menuSnakeCanvas.width + 50) nextX = -50;
    if(nextY < -50) nextY = menuSnakeCanvas.height + 50;
    if(nextY > menuSnakeCanvas.height + 50) nextY = -50;
    
    menuSnakePoints.unshift({x:nextX, y:nextY});
    menuSnakePoints.pop();
    
    // Draw realistic smooth snake
    drawSmoothSnake(menuSnakePoints);
    
    menuSnakeReq = requestAnimationFrame(loop);
  };
  menuSnakeReq = requestAnimationFrame(loop);
}

function stopMenuSnake() {
  if (menuSnakeReq) { cancelAnimationFrame(menuSnakeReq); menuSnakeReq = null; }
  if (menuSnakeCtx) menuSnakeCtx.clearRect(0,0,menuSnakeCanvas.width, menuSnakeCanvas.height);
}

function drawSmoothSnake(pts) {
  const ctx = menuSnakeCtx;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  // Draw glowing body with gradient
  for (let i = pts.length - 1; i > 0; i--) {
    const p1 = pts[i];
    const p2 = pts[i-1];
    const size = 18 * (1 - (i / pts.length) * 0.6);
    const alpha = (1 - (i / pts.length)) * 0.8;
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;
    ctx.lineWidth = size;
    ctx.stroke();
    
    // Inner core
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha * 0.5})`;
    ctx.lineWidth = size * 0.4;
    ctx.stroke();
  }
  
  // Draw head
  const h = pts[0];
  ctx.fillStyle = "#00ff88";
  ctx.beginPath();
  ctx.arc(h.x, h.y, 10, 0, Math.PI * 2);
  ctx.fill();
  
  // Eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(h.x - 3, h.y - 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(h.x + 3, h.y - 3, 2, 0, Math.PI * 2); ctx.fill();
}

// ── Global Initialization ─────────────────────────────────
resetGameState(); draw(); showMenu(); updateSoundBtns();
console.log("[Init] Snake Battle v6.3 loaded.");
