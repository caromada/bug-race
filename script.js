// Bug Race — retro arcade edition
// Everything runs off one bit of shared state (`lanes` + `racesRun`) and a
// requestAnimationFrame loop. No libraries, no image files: the bugs are
// pixel-art sprites defined as text grids below and rendered to inline SVG.

const LANE_COUNT = 4;
const SVG_NS = "http://www.w3.org/2000/svg";

// Each sprite is two animation frames (legs forward / legs back, flicked
// like Pac-Man's chomp) drawn on a 16-wide pixel grid. '.' is transparent,
// every other character is a palette key. Editing these strings edits the bug.
const SPRITES = {
  ladybug: {
    palette: { r: "#ff3b30", k: "#251515", h: "#4a4a58", w: "#ffffff", l: "#cfcfcf" },
    frames: [
      [
        "...l....l....l..",
        "....l...l...l...",
        "..rrrrrrrrrrr...",
        ".rrrrrrrrrrrhh..",
        ".rrkrrrkrrrrhhw.",
        ".rrrrrrrrrkrhhw.",
        ".rrkrrrkrrrrhh..",
        "..rrrrrrrrrrr...",
        "....l...l...l...",
        "...l....l....l..",
      ],
      [
        "....l...l...l...",
        "...l....l....l..",
        "..rrrrrrrrrrr...",
        ".rrrrrrrrrrrhh..",
        ".rrkrrrkrrrrhhw.",
        ".rrrrrrrrrkrhhw.",
        ".rrkrrrkrrrrhh..",
        "..rrrrrrrrrrr...",
        "...l....l....l..",
        "....l...l...l...",
      ],
    ],
  },
  cricket: {
    palette: { g: "#30e850", d: "#0f7a2a", w: "#ffffff", l: "#cfcfcf" },
    frames: [
      [
        "..............l.",
        "....dd.......l..",
        "...d..d.....l...",
        "...d...d........",
        "..ggggggggggg...",
        "..gggggggggggdw.",
        "..ggggggggggg...",
        "...l...l...l....",
        "....l...l...l...",
      ],
      [
        ".............l..",
        "....dd......l...",
        "...d..d.....l...",
        "...d...d........",
        "..ggggggggggg...",
        "..gggggggggggdw.",
        "..ggggggggggg...",
        "....l...l...l...",
        "...l...l...l....",
      ],
    ],
  },
  spider: {
    palette: { p: "#c85cff", d: "#7a2ea8", w: "#ffffff", l: "#cfcfcf" },
    frames: [
      [
        "..l..l...l..l...",
        ".l...l...l...l..",
        "...pppppppp.....",
        "..ppppppppppdd..",
        "..ppdppdpppdddw.",
        "..ppppppppppdd..",
        "...pppppppp.....",
        ".l...l...l...l..",
        "..l..l...l..l...",
      ],
      [
        ".l...l...l...l..",
        "..l..l...l..l...",
        "...pppppppp.....",
        "..ppppppppppdd..",
        "..ppdppdpppdddw.",
        "..ppppppppppdd..",
        "...pppppppp.....",
        "..l..l...l..l...",
        ".l...l...l...l..",
      ],
    ],
  },
};

const BUGS = [
  { id: "ladybug", label: "Ladybug" },
  { id: "cricket", label: "Cricket" },
  { id: "spider", label: "Spider" },
];

// Speed = fraction of the track covered per second, picked at random from the
// range for whatever setting the user chose. So on "normal" a bug finishes in
// roughly 4-6 seconds, "slow" drags it out, "fast" is over quick.
const SPEED_RANGES = {
  slow: [0.09, 0.15],
  normal: [0.17, 0.25],
  fast: [0.3, 0.42],
};

const CONFETTI_COLORS = ["#ff3b30", "#30e850", "#00e5ff", "#ffcc00", "#c85cff", "#ff8f1f"];

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

// ---------------------------------------------------------------- sprites

// Turn a text-grid frame pair into an <svg>. Horizontal runs of the same
// color collapse into one rect to keep the DOM light.
function makeSprite(bugId) {
  const { palette, frames } = SPRITES[bugId];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${frames[0][0].length} ${frames[0].length}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("sprite");

  frames.forEach((rows, i) => {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", i === 0 ? "frame-a" : "frame-b");

    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] === ".") {
          x++;
          continue;
        }
        let end = x;
        while (end < row.length && row[end] === row[x]) end++;

        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", end - x);
        rect.setAttribute("height", 1);
        rect.setAttribute("fill", palette[row[x]]);
        g.appendChild(rect);
        x = end;
      }
    });
    svg.appendChild(g);
  });

  return svg;
}

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
      dots: [],
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
  legend.textContent = `LANE ${lane.index + 1}`;
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

    label.append(radio, makeSprite(bug.id));
    icons.appendChild(label);
  }
  row.appendChild(icons);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "name-input";
  nameInput.placeholder = `NAME (DEFAULT: BUG ${lane.index + 1})`;
  nameInput.maxLength = 14;
  nameInput.addEventListener("input", () => {
    lane.name = nameInput.value.trim();
    syncLane(lane);
    checkDuplicateNames();
  });
  row.appendChild(nameInput);

  laneConfigEl.appendChild(row);
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

  const bug = document.createElement("div");
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
  lane.bugEl.replaceChildren(makeSprite(lane.bugId));
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
    showRaceMsg("PICK A WINNER FIRST! CLICK A LANE NUMBER.", "error");
    return;
  }
  if (checkDuplicateNames()) {
    showRaceMsg("FIX THE DUPLICATE BUG NAMES BEFORE RACING.", "error");
    return;
  }

  const speedSetting = document.querySelector('input[name="speed"]:checked').value;
  const [min, max] = SPEED_RANGES[speedSetting];

  racing = true;
  startBtn.disabled = true;
  startBtn.textContent = "RACING…";
  setConfigDisabled(true);
  showRaceMsg("GET READY…");
  ensureAudio(); // grab the audio context while we still count as a user gesture
  playStartJingle();

  document.querySelectorAll(".winner-tag").forEach((tag) => tag.remove());

  for (const lane of lanes) {
    lane.progress = 0;
    lane.x = 0;
    lane.dustTimer = 0;
    lane.speed = randBetween(min, max);
    lane.bugEl.classList.remove("winner", "loser");
    // quicker bugs flick their legs faster
    lane.bugEl.style.setProperty("--step", `${(0.035 / lane.speed).toFixed(3)}s`);
    layDots(lane);
    moveBug(lane);
  }

  runCountdown(beginRace);
}

// a trail of pac-dots for each bug to munch through
function layDots(lane) {
  for (const dot of lane.dots) dot.el.remove();
  lane.dots = [];
  lane.dotIndex = 0;

  const width = lane.runwayEl.clientWidth;
  for (let x = 70; x < width - 40; x += 28) {
    const el = document.createElement("span");
    el.className = "dot";
    el.style.left = `${x}px`;
    lane.runwayEl.appendChild(el);
    lane.dots.push({ el, x });
  }
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
        playTone(784, 0, 0.4);
        setTimeout(() => countdownEl.classList.remove("show", "pop"), 450);
        onGo();
      } else {
        playTone(392, 0, 0.15);
      }
    }, i * 700);
  });
}

function beginRace() {
  showRaceMsg("THEY'RE OFF!");
  for (const lane of lanes) lane.bugEl.classList.add("running");
  startWaka();
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

  // munch any dots the bug has reached
  while (
    lane.dotIndex < lane.dots.length &&
    lane.dots[lane.dotIndex].x < lane.x + 34
  ) {
    lane.dots[lane.dotIndex].el.classList.add("eaten");
    lane.dotIndex++;
  }
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
    piece.addEventListener("animationend", () => piece.remove());
    trackEl.appendChild(piece);
  }
}

function showWinnerTag(lane) {
  const tag = document.createElement("span");
  tag.className = "winner-tag blink";
  tag.textContent = "WINNER!";
  tag.style.left = `${Math.max(8, lane.x - 40)}px`;
  lane.runwayEl.appendChild(tag);
}

function finishRace(winner) {
  racing = false;
  racesRun++;
  stopWaka();

  const pickedIndex = Number(
    document.querySelector('input[name="winner-pick"]:checked').value
  );

  for (const lane of lanes) {
    lane.bugEl.classList.remove("running");
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
  showWinnerTag(winner);

  const guessedRight = pickedIndex === winner.index;
  if (guessedRight) {
    playWinSound();
    showRaceMsg(`🏆 ${displayName(winner)} TAKES IT — GREAT CALL!`, "success");
  } else {
    playLoseSound();
    showRaceMsg(
      `🏆 ${displayName(winner)} WINS. YOUR PICK, ${displayName(lanes[pickedIndex])}, DIDN'T HAVE IT.`,
      "error"
    );
  }

  renderStats();
  setConfigDisabled(false);
  startBtn.disabled = false;
  startBtn.textContent = "START RACE!";
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

    const laneCell = document.createElement("td");
    laneCell.textContent = lane.index + 1;

    const bugCell = document.createElement("td");
    bugCell.className = "stats-bug";
    bugCell.append(makeSprite(lane.bugId), document.createTextNode(displayName(lane)));

    row.append(laneCell, bugCell);
    for (const value of [lane.stats.races, lane.stats.wins, lane.stats.losses]) {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    }
    statsBodyEl.appendChild(row);
  }
}

// ---------------------------------------------------------------- sound

// Chiptune blips via the Web Audio API, so there are no audio files to lug
// around. The context can't be created until the user interacts with the
// page, hence the lazy init.
let audioCtx = null;
let wakaId = null;
let wakaHigh = false;

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

// a tone that slides between two pitches, for the sad-death glide
function playSlide(from, to, startAt, duration, volume = 0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime + startAt;

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

// coin-up arpeggio when the race is queued
function playStartJingle() {
  [262, 330, 392, 523].forEach((freq, i) => playTone(freq, i * 0.09, 0.09));
}

// the waka-waka munching loop while bugs eat their way down the track
function startWaka() {
  stopWaka();
  wakaId = setInterval(() => {
    playTone(wakaHigh ? 300 : 220, 0, 0.07, "square", 0.05);
    wakaHigh = !wakaHigh;
  }, 140);
}

function stopWaka() {
  clearInterval(wakaId);
  wakaId = null;
}

// you called it: level-clear fanfare
function playWinSound() {
  [523, 659, 784, 1047, 784, 1047].forEach((freq, i) =>
    playTone(freq, i * 0.11, 0.12, "square", 0.1)
  );
}

// you didn't: the classic arcade death glide
function playLoseSound() {
  playSlide(650, 130, 0, 0.7);
  playTone(98, 0.75, 0.15, "square", 0.09);
  playTone(98, 0.95, 0.25, "square", 0.09);
}

// ---------------------------------------------------------------- go

buildLanes();
checkDuplicateIcons(); // 4 lanes, 3 bugs — there's always a duplicate at first
renderStats();
lanes.forEach(layDots); // dress the track before the first race
startBtn.addEventListener("click", startRace);
