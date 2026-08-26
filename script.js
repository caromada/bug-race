// Bug Race
// Everything runs off one bit of shared state (`lanes` + `racesRun`) and a
// requestAnimationFrame loop. No libraries.

const LANE_COUNT = 4;

const BUGS = [
  { id: "ladybug", icon: "🐞", label: "Ladybug" },
  { id: "cricket", icon: "🦗", label: "Cricket" },
  { id: "spider", icon: "🕷️", label: "Spider" },
];

// Speed = fraction of the track covered per second, picked at random from the
// range for whatever setting the user chose. So on "normal" a bug finishes in
// roughly 4-6 seconds, "slow" drags it out, "fast" is over quick.
const SPEED_RANGES = {
  slow: [0.09, 0.15],
  normal: [0.17, 0.25],
  fast: [0.3, 0.42],
};

const CONFETTI_COLORS = ["#e63946", "#f4a261", "#ffd166", "#7aa653", "#457b9d", "#b56dc4"];

const lanes = []; // { bugId, name, speed, progress, stats, ...dom refs }
let racesRun = 0;
let racing = false;
let lastFrame = 0;

const laneConfigEl = document.getElementById("lane-config");
const trackEl = document.getElementById("track");
const countdownEl = document.getElementById("countdown");
const startBtn = document.getElementById("start-btn");
const raceMsgEl = document.getElementById("race-msg");
const iconWarningEl = document.getElementById("icon-warning");
const nameErrorEl = document.getElementById("name-error");
const raceCountEl = document.getElementById("race-count");
const statsBodyEl = document.querySelector("#stats-table tbody");

// ---------------------------------------------------------------- setup

function buildLanes() {
  for (let i = 0; i < LANE_COUNT; i++) {
    const lane = {
      index: i,
      bugId: BUGS[i % BUGS.length].id, // spread the defaults around
      name: "",
      speed: 0,
      progress: 0,
      x: 0,
      dustTimer: 0,
      stats: { races: 0, wins: 0, losses: 0 },
    };

    buildConfigRow(lane);
    buildTrackLane(lane);
    lanes.push(lane);
  }
}

function buildConfigRow(lane) {
  const row = document.createElement("fieldset");
  row.className = "lane-row";

  const legend = document.createElement("legend");
  legend.textContent = `Lane ${lane.index + 1}`;
  row.appendChild(legend);

  const icons = document.createElement("div");
  icons.className = "icon-choices";

  for (const bug of BUGS) {
    const label = document.createElement("label");
    label.title = bug.label;

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `icon-${lane.index}`;
    radio.value = bug.id;
    radio.checked = bug.id === lane.bugId;
    radio.addEventListener("change", () => {
      lane.bugId = bug.id;
      syncLane(lane);
      checkDuplicateIcons();
    });

    const span = document.createElement("span");
    span.textContent = bug.icon;

    label.append(radio, span);
    icons.appendChild(label);
  }
  row.appendChild(icons);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "name-input";
  nameInput.placeholder = `Name your bug (default: Bug ${lane.index + 1})`;
  nameInput.maxLength = 14;
  nameInput.addEventListener("input", () => {
    lane.name = nameInput.value.trim();
    syncLane(lane);
    checkDuplicateNames();
  });
  row.appendChild(nameInput);

  laneConfigEl.appendChild(row);
  lane.configRow = row;
}

function buildTrackLane(lane) {
  const laneEl = document.createElement("div");
  laneEl.className = "lane";

  const pick = document.createElement("label");
  pick.className = "pick";
  pick.title = "Bet on this lane";

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "winner-pick";
  radio.value = lane.index;
  pick.append(radio, document.createTextNode(String(lane.index + 1)));

  const runway = document.createElement("div");
  runway.className = "runway";

  const bugWrap = document.createElement("div");
  bugWrap.className = "bug-wrap";

  const bug = document.createElement("span");
  bug.className = "bug";
  bugWrap.appendChild(bug);

  const nameTag = document.createElement("span");
  nameTag.className = "bug-name";

  runway.append(bugWrap, nameTag);
  laneEl.append(pick, runway);
  trackEl.appendChild(laneEl);

  lane.runwayEl = runway;
  lane.bugWrapEl = bugWrap;
  lane.bugEl = bug;
  lane.nameTagEl = nameTag;
  lane.pickRadio = radio;

  syncLane(lane);
}

function getBug(lane) {
  return BUGS.find((b) => b.id === lane.bugId);
}

function displayName(lane) {
  return lane.name || `Bug ${lane.index + 1}`;
}

// keep the track in step with the config panel
function syncLane(lane) {
  lane.bugEl.textContent = getBug(lane).icon;
  lane.nameTagEl.textContent = displayName(lane);
}

// ---------------------------------------------------------------- validation

function checkDuplicateIcons() {
  const seen = new Set();
  let duplicate = false;
  for (const lane of lanes) {
    if (seen.has(lane.bugId)) duplicate = true;
    seen.add(lane.bugId);
  }
  iconWarningEl.hidden = !duplicate;
  return duplicate;
}

function checkDuplicateNames() {
  const seen = new Set();
  let duplicate = false;
  for (const lane of lanes) {
    if (!lane.name) continue; // blank names fall back to "Bug N", always unique
    const key = lane.name.toLowerCase();
    if (seen.has(key)) duplicate = true;
    seen.add(key);
  }
  nameErrorEl.hidden = !duplicate;
  return duplicate;
}

function showRaceMsg(text, kind) {
  raceMsgEl.textContent = text;
  raceMsgEl.className = "msg" + (kind ? " " + kind : "");
}

// ---------------------------------------------------------------- racing

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function startRace() {
  if (racing) return;

  const pick = document.querySelector('input[name="winner-pick"]:checked');
  if (!pick) {
    showRaceMsg("Pick a winner first! Click a lane number on the track.", "error");
    return;
  }
  if (checkDuplicateNames()) {
    showRaceMsg("Fix the duplicate bug names before racing.", "error");
    return;
  }

  const speedSetting = document.querySelector('input[name="speed"]:checked').value;
  const [min, max] = SPEED_RANGES[speedSetting];

  racing = true;
  startBtn.disabled = true;
  setConfigDisabled(true);
  showRaceMsg("On your marks…");
  ensureAudio(); // grab the audio context while we still count as a user gesture

  for (const lane of lanes) {
    lane.progress = 0;
    lane.x = 0;
    lane.dustTimer = 0;
    lane.speed = randBetween(min, max);
    lane.bugEl.classList.remove("winner", "loser");
    // quicker bugs scuttle their legs faster
    lane.bugEl.style.animationDuration = `${(0.035 / lane.speed).toFixed(3)}s`;
    moveBug(lane);
  }

  runCountdown(beginRace);
}

// 3… 2… 1… GO! with a beep on each tick
function runCountdown(onGo) {
  const steps = ["3", "2", "1", "GO!"];
  countdownEl.classList.add("show");

  steps.forEach((step, i) => {
    setTimeout(() => {
      countdownEl.textContent = step;
      // restart the pop animation for every number
      countdownEl.classList.remove("pop");
      void countdownEl.offsetWidth;
      countdownEl.classList.add("pop");

      if (step === "GO!") {
        playTone(659, 0, 0.4);
        setTimeout(() => countdownEl.classList.remove("show", "pop"), 450);
        onGo();
      } else {
        playTone(392, 0, 0.15);
      }
    }, i * 700);
  });
}

function beginRace() {
  showRaceMsg("They're off!");
  for (const lane of lanes) lane.bugEl.classList.add("running");
  lastFrame = performance.now();
  requestAnimationFrame(raceFrame);
}

function raceFrame(now) {
  if (!racing) return; // guard against a stray frame after the finish

  const dt = Math.min((now - lastFrame) / 1000, 0.1); // cap dt if the tab hiccups
  lastFrame = now;

  let winner = null;

  for (const lane of lanes) {
    // small per-frame wobble so the race isn't decided at the starting gun
    const wobble = randBetween(0.75, 1.25);
    lane.progress += lane.speed * dt * wobble;

    if (lane.progress >= 1) {
      lane.progress = 1;
      if (!winner) winner = lane;
    }
    moveBug(lane);

    // kick up a little dust every so often
    lane.dustTimer += dt;
    if (lane.dustTimer > 0.13 && lane.progress < 1) {
      lane.dustTimer = 0;
      spawnDust(lane);
    }
  }

  if (winner) {
    finishRace(winner);
  } else {
    requestAnimationFrame(raceFrame);
  }
}

function moveBug(lane) {
  const distance = Math.max(
    0,
    lane.runwayEl.clientWidth - lane.bugWrapEl.offsetWidth - 18
  );
  lane.x = lane.progress * distance;
  lane.bugWrapEl.style.transform = `translateY(-50%) translateX(${lane.x}px)`;
}

function spawnDust(lane) {
  const dust = document.createElement("span");
  dust.className = "dust";
  dust.style.left = `${lane.x + randBetween(-4, 4)}px`;
  dust.style.top = `${randBetween(55, 75)}%`;
  dust.addEventListener("animationend", () => dust.remove());
  lane.runwayEl.appendChild(dust);
}

function spawnConfetti() {
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${randBetween(2, 98)}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = `${randBetween(1.2, 2.4)}s`;
    piece.style.animationDelay = `${randBetween(0, 0.4)}s`;
    piece.style.transform = `rotate(${randBetween(0, 360)}deg)`;
    piece.addEventListener("animationend", () => piece.remove());
    trackEl.appendChild(piece);
  }
}

function finishRace(winner) {
  racing = false;
  racesRun++;

  const pickedIndex = Number(
    document.querySelector('input[name="winner-pick"]:checked').value
  );

  for (const lane of lanes) {
    lane.bugEl.classList.remove("running");
    lane.bugEl.style.animationDuration = "";
    lane.stats.races++;
    if (lane === winner) {
      lane.stats.wins++;
      lane.bugEl.classList.add("winner");
    } else {
      lane.stats.losses++;
      lane.bugEl.classList.add("loser");
    }
  }

  spawnConfetti();

  const guessedRight = pickedIndex === winner.index;
  if (guessedRight) {
    playWinSound();
    showRaceMsg(`🏆 ${displayName(winner)} takes it — great call!`, "success");
  } else {
    playLoseSound();
    showRaceMsg(
      `🏆 ${displayName(winner)} wins. Your pick, ${displayName(lanes[pickedIndex])}, didn't have it today.`,
      "error"
    );
  }

  renderStats();
  setConfigDisabled(false);
  startBtn.disabled = false;
}

function setConfigDisabled(disabled) {
  const inputs = document.querySelectorAll(
    '#setup-panel input, input[name="winner-pick"]'
  );
  for (const input of inputs) input.disabled = disabled;
}

// ---------------------------------------------------------------- stats

function renderStats() {
  raceCountEl.textContent = racesRun;
  statsBodyEl.innerHTML = "";

  for (const lane of lanes) {
    const row = document.createElement("tr");
    const cells = [
      lane.index + 1,
      `${getBug(lane).icon} ${displayName(lane)}`,
      lane.stats.races,
      lane.stats.wins,
      lane.stats.losses,
    ];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    }
    statsBodyEl.appendChild(row);
  }
}

// ---------------------------------------------------------------- sound

// Little chiptune blips via the Web Audio API, so there are no audio files
// to lug around. The context can't be created until the user interacts with
// the page, hence the lazy init.
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playTone(freq, startAt, duration, type = "square", volume = 0.12) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime + startAt;

  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

// you called it: rising victory arpeggio
function playWinSound() {
  playTone(523, 0, 0.12, "triangle");
  playTone(659, 0.12, 0.12, "triangle");
  playTone(784, 0.24, 0.12, "triangle");
  playTone(1047, 0.36, 0.4, "triangle");
}

// you didn't: sad descending womp
function playLoseSound() {
  playTone(392, 0, 0.2, "sawtooth", 0.08);
  playTone(330, 0.22, 0.2, "sawtooth", 0.08);
  playTone(262, 0.44, 0.45, "sawtooth", 0.08);
}

// ---------------------------------------------------------------- go

buildLanes();
checkDuplicateIcons(); // 4 lanes, 3 bugs — there's always a duplicate at first
renderStats();
startBtn.addEventListener("click", startRace);
