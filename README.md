# Bug Race 🕹️

A retro arcade browser game where four pixel-art bugs race across a Pac-Man style track and you try to guess the winner. Built with plain HTML, CSS and JavaScript — no frameworks, no animation libraries, no image or audio files, no build step.

**[Play it here](https://danielguzman.github.io/bug-race/)** *(update this link after enabling GitHub Pages)*

## How to play

1. Pick a bug sprite for each lane and give it a name (or don't — they'll fall back to "Bug 1" through "Bug 4").
2. Choose a race speed: Slow, Normal, or Fast.
3. Click a lane number on the track to bet on your winner.
4. Hit **START RACE!** and watch them munch their way to the finish line.

The winner does a victory bounce under a blinking WINNER! tag. The losers flip onto their backs and gray out, because bugs are dramatic.

## Features

- Config panel with per-lane bug sprites and names
- Warning when two lanes use the same bug (they'll still race), and a hard error when two bugs share a name
- Three speed settings — each bug gets a random speed within the chosen range, plus a bit of per-frame wobble so races stay unpredictable to the end
- Betting via lane radio buttons, with an error if you try to start without a pick
- 3… 2… 1… GO! countdown overlay with beeps synced to each tick
- Bugs eat a trail of pac-dots as they run, legs flicking in two-frame sprite animation at a rate matched to each bug's speed
- Start button locks out during a race, along with the config panel
- Pixel confetti at the finish; winner bounces, losers flip onto their backs
- All-chiptune audio from the Web Audio API — coin-up jingle at the start, waka-waka while the bugs munch, a level-clear fanfare if your bet hits, and the classic arcade death-glide if it doesn't
- CRT scanline overlay and neon maze styling for the full cabinet feel
- Session stats: total races, plus races/wins/losses per bug

## The sprites are drawn in code

There are no image files. Each bug is a two-frame pixel sprite defined as a grid of characters right in `script.js`:

```
"...l....l....l..",
"....l...l...l...",
"..rrrrrrrrrrr...",
".rrrrrrrrrrrhh..",
".rrkrrrkrrrrhhw.",
```

Each character maps to a palette color and each frame gets rendered into an inline SVG (`shape-rendering: crispEdges`, horizontal runs merged into single rects). The two frames — legs forward, legs back — are flicked with a CSS `steps()` animation, Pac-Man chomp style, so faster bugs visibly scurry faster. Editing the strings edits the bug.

## How the animation works

Movement runs on `requestAnimationFrame`. Each frame, every bug advances by `speed × deltaTime × wobble`, where:

- `speed` is a fraction of the track per second, drawn randomly from the range for the chosen setting (slow: 0.09–0.15, normal: 0.17–0.25, fast: 0.30–0.42 — so a "normal" race takes roughly 4–6 seconds)
- `wobble` is a random multiplier between 0.75 and 1.25, which is what makes bugs surge and stall instead of finishing in the order their speeds were drawn

The first bug to hit progress 1.0 ends the race and everyone else freezes where they are. Dots are "eaten" by comparing each dot's x position against the bug's position as it moves. Bounce, flip, confetti and the countdown are CSS keyframe animations with `steps()` timing to keep everything chunky and era-appropriate.

## Running locally

No build step — just open `index.html` in a browser, or serve the folder if you prefer:

```
python3 -m http.server 8000
```

(The Press Start 2P font loads from Google Fonts, so you'll see the monospace fallback offline.)

## Ideas I might add later

- Power pellet that gives a random bug a speed burst
- Odds/payout system so betting actually costs something
- Persist stats to localStorage as a high-score table
