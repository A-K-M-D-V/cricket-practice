# Cricket Vision Trainer

A batter's-eye ball-tracking trainer. A bowler runs in and bowls at you. Your job is to pick the ball up in the hand and stay on it until it passes the crease. There is no bat, and nothing to click on the ball.

Plain HTML, CSS, and JavaScript on an HTML5 canvas. No build step, no framework, no database.

> A visual tracking exercise. It does not measure eye movement, it does not prove any improvement in eyesight, and no camera is used.

## Quick start

Open `index.html` in a browser. Double-click works: the scripts are classic scripts, not ES modules, so `file://` is fine.

Or serve the folder:

```bash
python3 -m http.server 8080
```

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080).

**Space** bowls. **F** toggles fullscreen. Clicking the pitch also bowls.

## Features

- Bowler run-up, delivery stride, release, and follow-through, drawn from the batting end
- Real flight time from release speed (40–160 km/h)
- Swing, seam, and spin, with a bounce and a change of direction after the pitch
- Red ball on a white sightscreen, or white ball on a black sightscreen
- Right-arm and left-arm over the wicket
- Session log: overs, average speed, fastest ball, and reaction-training calls
- Last settings are remembered in the browser
- Optional bounce sound, synthesized in the browser (no audio files)

## Controls

| Control | What it does |
|---|---|
| Bowl | Bowls one delivery with the current settings |
| Next ball | Starts a new delivery immediately, even mid-ball |
| Auto bowling | Bowls again after the auto gap (2–10 s) once a ball is finished |
| Fullscreen | Distraction-free view. Falls back to a full-window view if the browser blocks fullscreen |
| Space | Bowl |
| F | Toggle fullscreen |

Clicking the pitch also bowls the next ball.

### Settings

| Setting | Options |
|---|---|
| Bowling type | Fast, medium, off-spin, leg-spin |
| Bowler | Right-arm over, left-arm over |
| Speed | 40–160 km/h |
| Movement | Outswing, inswing, straight |
| Length | Yorker, full, good length, short, bouncer, random |
| Ball | Red (Test) or white (limited overs) |
| Auto gap | 2–10 seconds between balls when auto bowling is on |

## Training modes

1. **Normal tracking.** You choose the delivery. It is announced before the ball, and a faint path and pitch mark appear afterwards.
2. **Random delivery.** Speed, movement, and length change every ball, and are revealed only after the ball has gone past. Bowling type and arm still apply.
3. **Reaction training.** No guides and no advance information. After each ball, call the length and the movement. Calls are scored in the session panel.

## Project layout

```
index.html              page, controls, training screen
css/style.css           layout and theme
js/app.js               delivery state machine, auto bowling, animation loop, sound, fullscreen
js/controls.js          settings panel; remembers the last settings
js/session.js           overs, speeds, calls, delivery log
js/ballPhysics.js       speed, trajectory, bounce, swing, seam, spin
js/bowler.js            run-up, delivery stride, release, follow-through
js/renderer.js          pitch, stadium, bowler, ball, perspective
assets/                 reserved for sprites, pitch textures, and recorded sounds
```

Version 1 draws everything procedurally. The `assets/` folders are placeholders.

## How the simulation works

**Coordinates.** `z` is metres from the batter's popping crease toward the bowler (batting stumps at −1.22 m, bowling stumps at 18.90 m, on a 20.12 m pitch). `x` is lateral (`+x` is the off side for a right-hander) and `y` is height. A fixed camera sits behind the crease at eye height (1.62 m) and projects those points onto the canvas.

**Ball flight.** The release point is read from the bowler's hand at the release frame, about 17.7 m from the batter, not the full 20.12 m. Speed sets the flight time: a 140 km/h good-length ball reaches the batter in about 0.47 s. Before the bounce the ball follows gravity plus a constant lateral acceleration (swing, or drift for spinners). The bounce uses a coefficient of restitution, and after it a deflection angle adds seam or spin. Fuller balls swing more because they spend longer in the air.

**After the ball.** The scene holds for a moment once the ball has passed, so the eyes can finish the track, before the speed and the arrival height and line are shown.

To move the drawing to Three.js later, replace `renderer.js` only. It already receives the bowler's joint positions and the ball position in world coordinates each frame, so the physics, controls, and session code can stay as they are.

## Hosting

Upload the whole folder. Nothing to build and nothing to configure.

- [Netlify](https://www.netlify.com/) or [Cloudflare Pages](https://pages.cloudflare.com/): set the publish directory to the project root
- Shared hosting: put the files in `public_html`

## Keyboard

| Key | Action |
|---|---|
| Space | Bowl |
| F | Fullscreen |
