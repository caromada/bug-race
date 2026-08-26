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

// the betting economy
const BET_COST = 10;
const COIN_VALUE = 100; // what INSERT COIN buys you
const ODDS_CHOICES = [2, 3, 4, 5]; // per-lane payout multipliers, rerolled each race

// the power pellet
const BOOST_DURATION = 1.1; // seconds
const BOOST_MULTIPLIER = 1.65;

const STORAGE_KEY = "bug-race-save";

const lanes = []; // { bugId, name, speed, progress, stats, ...dom refs }
let racesRun = 0;
let racing = false;
let lastFrame = 0;
let timeScale = 1; // drops below 1 for the photo-finish slow-mo
let photoTagEl = null;

// tournament bracket: two semifinals feed a final.
// null means single-race mode.
let tourney = null;

// credits, all-time races and the high-score table survive page reloads.
// localStorage can throw in private windows, so every touch is wrapped.
function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to a fresh save
  }
  return null;
}

const save = loadSave() || { credits: COIN_VALUE, racesAllTime: 0, highScores: [] };

function persistSave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // no storage available — the game still works, it just forgets
  }
}

const laneConfigEl = document.getElementById("lane-config");
const trackEl = document.getElementById("track");
const countdownEl = document.getElementById("countdown");
const startBtn = document.getElementById("start-btn");
const coinBtn = document.getElementById("coin-btn");
const raceMsgEl = document.getElementById("race-msg");
const iconWarningEl = document.getElementById("icon-warning");
const nameErrorEl = document.getElementById("name-error");
const creditsEl = document.getElementById("credits");
const bankEl = document.getElementById("bank-amount");
const betNoteEl = document.getElementById("bet-note");
const hiScoreEl = document.getElementById("hi-score");
const raceCountEl = document.getElementById("race-count");
const allTimeCountEl = document.getElementById("all-time-count");
const statsBodyEl = document.querySelector("#stats-table tbody");
const highScoreBodyEl = document.querySelector("#highscore-table tbody");

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
      boostTimer: 0,
      dots: [],
      pellet: null,
      odds: 2,
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
  radio.addEventListener("change", updateBetPreview);

  const number = document.createElement("span");
  number.textContent = lane.index + 1;

  const odds = document.createElement("span");
  odds.className = "odds";

  pick.append(radio, number, odds);
  lane.oddsEl = odds;

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

  lane.laneEl = laneEl;
  lane.pickRadio = radio;
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

// ---------------------------------------------------------------- tournament

const stageMsgEl = document.getElementById("stage-msg");

function racersNow() {
  return tourney ? tourney.matches[tourney.index].map((i) => lanes[i]) : lanes;
}

function stageName() {
  return ["SEMIFINAL 1", "SEMIFINAL 2", "THE FINAL"][tourney.index];
}

function setMode(mode) {
  if (mode === "tournament") {
    tourney = { matches: [[0, 1], [2, 3], null], index: 0, winners: [] };
    prepRound();
  } else {
    tourney = null;
    unbenchAll();
    updateStageUI();
  }
}

// dim the lanes that sit this round out and lock their bet radios
function prepRound() {
  const active = tourney.matches[tourney.index];
  for (const lane of lanes) {
    const benched = !active.includes(lane.index);
    lane.laneEl.classList.toggle("benched", benched);
    lane.pickRadio.disabled = benched;
    lane.pickRadio.checked = false;
  }
  updateStageUI();
  updateBetPreview();
}

function unbenchAll() {
  for (const lane of lanes) {
    lane.laneEl.classList.remove("benched");
    lane.pickRadio.disabled = false;
  }
}

function updateStageUI() {
  if (tourney) {
    const [a, b] = tourney.matches[tourney.index];
    startBtn.textContent = `START ${stageName()}`;
    stageMsgEl.textContent =
      `${stageName()}: ${displayName(lanes[a])} VS ${displayName(lanes[b])}`;
  } else {
    startBtn.textContent = "START RACE!";
    stageMsgEl.textContent = "";
  }
}

// ---------------------------------------------------------------- racing

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function startRace() {
  if (racing) return;

  const racers = racersNow();
  const pick = document.querySelector('input[name="winner-pick"]:checked');
  if (!pick) {
    showRaceMsg("PICK A WINNER FIRST! CLICK A LANE NUMBER.", "error");
    return;
  }
  if (tourney && !racers.some((l) => l.index === Number(pick.value))) {
    showRaceMsg("THAT BUG SITS THIS RACE OUT — PICK AN ACTIVE LANE.", "error");
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

  save.credits -= BET_COST; // pay to play
  persistSave();
  updateBank();
  showCreditDelta(-BET_COST);

  document.querySelectorAll(".winner-tag").forEach((tag) => tag.remove());
  trackEl.classList.remove("party");

  for (const lane of lanes) {
    lane.progress = 0;
    lane.x = 0;
    lane.dustTimer = 0;
    lane.boostTimer = 0;
    lane.laneEl.classList.remove("party");
    lane.bugEl.classList.remove("winner", "loser", "boosted");
    moveBug(lane);
    // spectators don't get a dot trail
    for (const dot of lane.dots) dot.el.remove();
    lane.dots = [];
  }
  for (const lane of racers) {
    lane.speed = randBetween(min, max);
    // quicker bugs flick their legs faster
    lane.bugEl.style.setProperty("--step", `${(0.035 / lane.speed).toFixed(3)}s`);
    layDots(lane);
  }
  layPellet(racers);

  runCountdown(beginRace);
}

// one blinking power pellet lands in a random racing lane — first bug to
// reach it gets a short speed burst
function layPellet(racers) {
  document.querySelectorAll(".pellet").forEach((p) => p.remove());
  for (const lane of lanes) lane.pellet = null;

  const lane = racers[Math.floor(Math.random() * racers.length)];
  const width = lane.runwayEl.clientWidth;
  const x = randBetween(width * 0.35, width * 0.7);

  const el = document.createElement("span");
  el.className = "pellet";
  el.style.left = `${x}px`;
  lane.runwayEl.appendChild(el);
  lane.pellet = { el, x, taken: false };
}

// fresh payout odds for every lane, shown in the pick column
function rollOdds() {
  for (const lane of lanes) {
    lane.odds = ODDS_CHOICES[Math.floor(Math.random() * ODDS_CHOICES.length)];
    lane.oddsEl.textContent = `×${lane.odds}`;
  }
}

function updateBank() {
  creditsEl.textContent = save.credits;
  bankEl.textContent = save.credits;
  hiScoreEl.textContent = save.highScores[0]?.payout ?? 0;
  allTimeCountEl.textContent = save.racesAllTime;

  const broke = save.credits < BET_COST;
  coinBtn.hidden = !broke;
  if (!racing) startBtn.disabled = broke;
}

// a green +N or red -N that floats up off the bank readout
function showCreditDelta(delta) {
  const float = document.createElement("span");
  float.className = "credit-float " + (delta < 0 ? "neg" : "pos");
  float.textContent = (delta > 0 ? "+" : "") + delta;
  float.addEventListener("animationend", () => float.remove());
  bankEl.parentElement.appendChild(float);

  for (const el of [creditsEl, bankEl]) {
    el.classList.remove("bump");
    void el.offsetWidth; // restart the animation
    el.classList.add("bump");
  }
}

// tell the player exactly what their current pick pays before they commit
function updateBetPreview() {
  const picked = document.querySelector('input[name="winner-pick"]:checked');
  if (picked) {
    const lane = lanes[Number(picked.value)];
    betNoteEl.textContent =
      `BET ${BET_COST} · WIN ${BET_COST * lane.odds} CREDITS IF LANE ${lane.index + 1} TAKES IT`;
  } else {
    betNoteEl.textContent = `${BET_COST} CREDITS PER RACE · PICK A LANE TO SEE YOUR PAYOUT`;
  }
}

function insertCoin() {
  save.credits += COIN_VALUE;
  persistSave();
  playCoinSound();
  updateBank();
  showCreditDelta(COIN_VALUE);
  showRaceMsg(`+${COIN_VALUE} CREDITS. PLACE YOUR BET!`, "success");
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

// 3… 2… 1… GO! with a beep on each tick. Tournament races lead with the
// stage name so you know what's on the line.
function runCountdown(onGo) {
  const steps = tourney
    ? [stageName(), "3", "2", "1", "GO!"]
    : ["3", "2", "1", "GO!"];
  countdownEl.classList.add("show");

  steps.forEach((step, i) => {
    setTimeout(() => {
      countdownEl.textContent = step;
      countdownEl.classList.toggle("label", step.length > 3);
      // restart the pop animation for every number
      countdownEl.classList.remove("pop");
      void countdownEl.offsetWidth;
      countdownEl.classList.add("pop");

      if (step === "GO!") {
        playTone(784, 0, 0.4);
        setTimeout(() => countdownEl.classList.remove("show", "pop"), 450);
        onGo();
      } else {
        playTone(step.length > 3 ? 523 : 392, 0, 0.15);
      }
    }, i * 700);
  });
}

function beginRace() {
  showRaceMsg("THEY'RE OFF!");
  for (const lane of racersNow()) lane.bugEl.classList.add("running");
  startWaka();
  lastFrame = performance.now();
  requestAnimationFrame(raceFrame);
}

function raceFrame(now) {
  if (!racing) return; // guard against a stray frame after the finish

  // cap dt if the tab hiccups; timeScale drags everything into slow motion
  const dt = Math.min((now - lastFrame) / 1000, 0.1) * timeScale;
  lastFrame = now;

  const racers = racersNow();
  let winner = null;
  let lead = 0;

  for (const lane of racers) {
    // small per-frame wobble so the race isn't decided at the starting gun
    const wobble = randBetween(0.75, 1.25);
    const boost = lane.boostTimer > 0 ? BOOST_MULTIPLIER : 1;
    lane.progress += lane.speed * boost * dt * wobble;

    if (lane.boostTimer > 0) {
      lane.boostTimer -= dt;
      if (lane.boostTimer <= 0) lane.bugEl.classList.remove("boosted");
    }

    if (lane.progress >= 1) {
      lane.progress = 1;
      if (!winner) winner = lane;
    }
    lead = Math.max(lead, lane.progress);
    moveBug(lane);

    // kick up a little dust every so often
    lane.dustTimer += dt;
    if (lane.dustTimer > 0.13 && lane.progress < 1) {
      lane.dustTimer = 0;
      spawnDust(lane);
    }
  }

  // the run to the line always plays out in photo-finish slow motion
  if (!winner && timeScale === 1 && lead > 0.86) enterSlowMo();

  if (winner) {
    finishRace(winner);
  } else {
    requestAnimationFrame(raceFrame);
  }
}

function enterSlowMo() {
  timeScale = 0.35;
  trackEl.classList.add("slowmo");
  startWaka(320); // the munching slows down with the world

  photoTagEl = document.createElement("span");
  photoTagEl.className = "photo-tag blink";
  photoTagEl.textContent = "PHOTO FINISH!";
  trackEl.appendChild(photoTagEl);
}

function exitSlowMo() {
  timeScale = 1;
  trackEl.classList.remove("slowmo");
  if (photoTagEl) {
    photoTagEl.remove();
    photoTagEl = null;
  }

  // the camera fires as the winner crosses
  const flash = document.createElement("span");
  flash.className = "photo-flash";
  flash.addEventListener("animationend", () => flash.remove());
  trackEl.appendChild(flash);
  playShutterSound();
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

  // grab the power pellet if this lane has one
  const pellet = lane.pellet;
  if (racing && pellet && !pellet.taken && pellet.x < lane.x + 34) {
    pellet.taken = true;
    pellet.el.classList.add("eaten");
    lane.boostTimer = BOOST_DURATION;
    lane.bugEl.classList.add("boosted");
    playPowerSound();
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
  save.racesAllTime++;
  stopWaka();
  exitSlowMo();

  const racers = racersNow();
  const pickedIndex = Number(
    document.querySelector('input[name="winner-pick"]:checked').value
  );

  for (const lane of racers) {
    lane.bugEl.classList.remove("running", "boosted");
    lane.boostTimer = 0;
    lane.stats.races++;
    if (lane === winner) {
      lane.stats.wins++;
      lane.bugEl.classList.add("winner"); // the winner dance
    } else {
      lane.stats.losses++;
      lane.bugEl.classList.add("loser");
    }
  }

  spawnConfetti();
  showWinnerTag(winner);
  throwParty(winner.laneEl);

  const guessedRight = pickedIndex === winner.index;
  if (guessedRight) {
    const payout = BET_COST * winner.odds;
    save.credits += payout;
    recordHighScore(displayName(winner), winner.odds, payout);
    showCreditDelta(payout);
    playWinSound();
    showRaceMsg(`🏆 ${displayName(winner)} TAKES IT! +${payout} CREDITS`, "success");
  } else {
    playLoseSound();
    showRaceMsg(
      `🏆 ${displayName(winner)} WINS. YOUR PICK, ${displayName(lanes[pickedIndex])}, DIDN'T HAVE IT. -${BET_COST} CREDITS`,
      "error"
    );
  }

  persistSave();
  rollOdds(); // fresh odds for the next race
  updateBank();
  renderStats();
  renderHighScores();
  setConfigDisabled(false);

  // one bet per race — clear the pick so the next race needs a fresh one
  document
    .querySelectorAll('input[name="winner-pick"]')
    .forEach((radio) => (radio.checked = false));

  if (tourney) {
    advanceTournament(winner);
  } else {
    updateStageUI();
    updateBetPreview();
  }
}

function advanceTournament(winner) {
  tourney.winners.push(winner.index);

  if (tourney.index === 2) {
    // that was the final — crown the champion
    crownChampion(winner);
    return;
  }

  tourney.index++;
  if (tourney.index === 2) tourney.matches[2] = [...tourney.winners];
  prepRound();
  stageMsgEl.textContent =
    `${displayName(winner)} ADVANCES! ${stageMsgEl.textContent}`;
}

// the full dance party: track-wide disco lights, a longer jingle, and the
// champion boogying under a CHAMPION! tag
function crownChampion(winner) {
  tourney = null;
  unbenchAll();
  document.querySelector('input[name="mode"][value="single"]').checked = true;

  trackEl.classList.add("party");
  spawnConfetti();
  playChampionJingle();

  const tag = winner.runwayEl.querySelector(".winner-tag");
  if (tag) tag.textContent = "CHAMPION!";

  updateStageUI();
  updateBetPreview();
  stageMsgEl.textContent = `👑 ${displayName(winner)} IS THE CHAMPION! 👑`;
}

// disco lights on one lane after a regular win
function throwParty(laneEl) {
  laneEl.classList.add("party");
  setTimeout(() => laneEl.classList.remove("party"), 3200);
}

function recordHighScore(name, odds, payout) {
  save.highScores.push({
    name,
    odds,
    payout,
    date: new Date().toLocaleDateString(),
  });
  save.highScores.sort((a, b) => b.payout - a.payout);
  save.highScores = save.highScores.slice(0, 5);
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

function renderHighScores() {
  highScoreBodyEl.innerHTML = "";

  if (save.highScores.length === 0) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "NO SCORES YET — WIN A BET!";
    row.appendChild(td);
    highScoreBodyEl.appendChild(row);
    return;
  }

  save.highScores.forEach((score, i) => {
    const row = document.createElement("tr");
    for (const value of [i + 1, score.name, `×${score.odds}`, score.payout, score.date]) {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    }
    highScoreBodyEl.appendChild(row);
  });
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
function startWaka(intervalMs = 140) {
  stopWaka();
  wakaId = setInterval(() => {
    playTone(wakaHigh ? 300 : 220, 0, 0.07, "square", 0.05);
    wakaHigh = !wakaHigh;
  }, intervalMs);
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

// power pellet grabbed: a rising zap
function playPowerSound() {
  playSlide(220, 990, 0, 0.3, 0.08);
  playTone(1319, 0.28, 0.12, "square", 0.08);
}

// the classic coin drop
function playCoinSound() {
  ensureAudio();
  playTone(988, 0, 0.08);
  playTone(1319, 0.09, 0.3);
}

// the camera taking the photo-finish shot
function playShutterSound() {
  playTone(1568, 0, 0.04, "square", 0.09);
  playTone(1245, 0.05, 0.04, "square", 0.09);
}

// crowning the tournament champion deserves a whole melody
function playChampionJingle() {
  [523, 659, 784, 1047, 880, 1047, 1319, 1568].forEach((freq, i) =>
    playTone(freq, i * 0.13, 0.15, "square", 0.11)
  );
}

// ---------------------------------------------------------------- go

buildLanes();
checkDuplicateIcons(); // 4 lanes, 3 bugs — there's always a duplicate at first
rollOdds();
updateBank();
updateBetPreview();
renderStats();
renderHighScores();
lanes.forEach(layDots); // dress the track before the first race
startBtn.addEventListener("click", startRace);
coinBtn.addEventListener("click", insertCoin);
document
  .querySelectorAll('input[name="mode"]')
  .forEach((radio) =>
    radio.addEventListener("change", () => setMode(radio.value))
  );
