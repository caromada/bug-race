# Bug Race 🐞🦗🕷️

A little browser game where four bugs race across a track and you try to guess the winner. Built with plain HTML, CSS and JavaScript — no frameworks, no animation libraries, no build step.

**[Play it here](https://danielguzman.github.io/bug-race/)** *(update this link after enabling GitHub Pages)*

## How to play

1. Pick a bug icon for each lane and give it a name (or don't — they'll fall back to "Bug 1" through "Bug 4").
2. Choose a race speed: Slow, Normal, or Fast.
3. Click a lane number on the track to bet on your winner.
4. Hit **Start Race!** and watch it play out.

The winner does a victory bounce. The losers flip onto their backs, because bugs are dramatic.

## Features

- Config panel with per-lane bug icons and names
- Warning when two lanes use the same bug (they'll still race), and a hard error when two bugs share a name
- Three speed settings — each bug gets a random speed within the chosen range, plus a bit of per-frame wobble so races stay unpredictable to the end
- Betting via lane radio buttons, with an error if you try to start without a pick
- 3… 2… 1… GO! countdown overlay with beeps synced to each tick
- Bugs scurry (leg-wiggle rate matched to each bug's speed) and kick up dust as they run
- Start button locks out during a race, along with the config panel
- Confetti drop at the finish; the winner does a victory bounce while the losers flip onto their backs
- Different finish sounds depending on whether your bet came in — a victory arpeggio or a sad little womp — all generated with the Web Audio API (no audio files)
- Session stats: total races, plus races/wins/losses per bug

## How the animation works

Movement runs on `requestAnimationFrame`. Each frame, every bug advances by `speed × deltaTime × wobble`, where:

- `speed` is a fraction of the track per second, drawn randomly from the range for the chosen setting (slow: 0.09–0.15, normal: 0.17–0.25, fast: 0.30–0.42 — so a "normal" race takes roughly 4–6 seconds)
- `wobble` is a random multiplier between 0.75 and 1.25, which is what makes bugs surge and stall instead of finishing in the order their speeds were drawn

The first bug to hit progress 1.0 ends the race and everyone else freezes where they are. The bounce, flip, and running-scurry effects are all CSS keyframe animations toggled with classes.

## Running locally

No build step — just open `index.html` in a browser, or serve the folder if you prefer:

```
python3 -m http.server 8000
```

## Ideas I might add later

- Photo-finish slow motion when two bugs are close
- Odds/payout system so betting actually costs something
- Persist stats to localStorage
