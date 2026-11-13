# Gantt chart tool

A static, no-build web app for making slide- and report-ready Gantt / project-plan charts: areas → tasks → subtasks plus milestones,
drag editing, palettes, assignees, progress, a date marker, baselines, and exports (PNG, PDF, PPTX, copy). Desktop-first.
`README.md` is the feature list and is kept in sync with the app: update it when behaviour a user would notice changes.

## Run and test
- Serve the folder statically: `python3 -m http.server 8765` (no install, no bundler). Open `http://localhost:8765/`.
- Browser tests: `bash tests/run.sh` (see `tests/README.md`). They need Playwright; Chromium is pre-installed in cloud sessions.
- A background server dies after two hours; restart it when a script suddenly times out.

## Layout
- `index.html` — shell; scripts and CSS are loaded with `?v=N` for cache busting.
- `js/core.js` — renderer-independent engine: `DEFAULT_SETTINGS`, palettes, `derive(rows)` (hierarchy, rolled-up dates / progress /
  status), `buildScene(state, opts)` (turns the plan into a flat list of drawable items), date helpers, `APP_VERSION`.
- `js/app.js` — UI and state: `sanitize()`, the `DESIGN` control list (right-hand panel), plan outline, popover (`popHtml`, `syncPop`),
  keyboard handling, selection, exports (`sceneToSvg`, canvas `drawScene`, PptxGenJS in `exportPptx`).
- `css/style.css`, `vendor/` (jsPDF, PptxGenJS, SheetJS — do not edit).
- Storage: localStorage `gantt:v1` (plan + settings) and `gantt:ui` (panel state, saved palettes, accordion state).

## Conventions
- One scene, three renderers. Anything drawn must be expressed as scene items (`rect`, `line`, `text`, `diamond`, `poly`) so the
  screen (SVG), PNG/PDF (canvas) and PPTX all agree. Renderers do not support `fill: 'none'` outside UI-only items, so draw an outline
  as a larger shape behind the real one (see the critical path and the status dots).
- New design option: add the default in `DEFAULT_SETTINGS`, a control in `DESIGN` (it appears in the panel automatically), use it in
  `buildScene`. Plans already saved keep their stored settings, so changing a default only affects new plans.
- New per-item flag: validate it in `sanitize()`, add a section in `popHtml()` (accordion `acc(...)`), and handle it in `rowChange` /
  `rowInput`. Areas are items too (`n.isArea`); an area's own dates and progress are derived from what is inside it.
- Bump `APP_VERSION` (core.js) and every `?v=` in `index.html` together for each shipped change.

## Gotchas
- `$$(sel, null)` falls back to `document` — never pass a possibly-null root.
- `syncPop` does not rebuild the popover while a text field inside it has focus; anything that must follow edits live has to be
  updated directly (see the accordion summaries).
- Date inputs fire while a year is half-typed: `plausibleDay` and the min/max attributes guard that.
- Comparing before/after dates (spread, baseline) must look at leaf items only; area rows change as their children change.
- Layout y positions are laid out top-down before the time scale exists; anything needing the x scale in that phase uses an estimate.
- Long inline Python or shell one-liners can trip the sandbox safety check; put patch scripts in a file instead.

## Workflow
- Develop on the branch the session names (currently `claude/gantt-chart-tool-7vbp7n`); commit, push, and don't open a pull request unless asked.
- Test in the browser (screenshots for anything visual) before reporting something done; run `bash tests/run.sh` before committing.
