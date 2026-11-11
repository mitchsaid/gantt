# Gantt

A simple Gantt / project-plan chart maker built for charts you put on slides, proposals and reports.

No build step and no backend: it is a static site. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

## What it does

- **Up to three levels** — areas, tasks and subtasks, plus milestones (kickoff, demo, go-live…). Areas are optional: a plan can be a flat list of tasks.
- **Direct editing** — drag bars to move them, drag their ends to resize, drag the progress edge, drag rows to reorder (in the outline or on the chart labels). Drag a bar mostly up or down on the chart to move it between rows and into existing areas — a drag never creates a new area (mostly sideways moves it in time). Drag a row sideways to nest it: an area dropped under another becomes a task and its tasks become subtasks. Click a bar for its name, dates, duration, owner and colour (in days, weeks, sprints or months); click the title or double-click a label to rename it in place.
- **Add from the chart** — the + Task / + Milestone / + Area buttons under the chart add after the selected row and let you name the new item in place.
- **Timeline first** — click the date header (or use Design → Timeline) to fix the overall span, then spread the tasks across it. An undated list pasted onto a fixed timeline is laid out to fill it.
- **Presentation options** — task names on the left or on the bars; area names as heading rows or down the side spanning their tasks; optional title; days, weeks, sprints (1–4 weeks), months or quarters; calendar dates or numbered periods ("Week 1"); dates at the top, bottom or both.
- **Rows** — one row per task, or "in sequence": tasks that follow one another within an area share a row, with names on the bars.
- **Select, copy and paste** — Shift-click selects a range, Ctrl/⌘-click adds or removes items (on the chart or in the Plan panel). Press Enter on a selected item to add a new one under it. A bar appears when several are selected with **Add to new area** (Ctrl/⌘+G). Copy, cut, paste and duplicate (Ctrl/⌘ + C, X, V, D) work on the selection with everything inside it; drag one selected bar to move them all — sideways in time, or up and down into other areas. Copied items are plain indented text, so they paste into a doc or spreadsheet and back again.
- **Add several at once** — paste a multi-line list straight into any name in the Plan panel, or use **Paste a list of tasks** in the Plan panel. Indentation, bullets, dates, durations and owners are understood, and undated items carry on after the selected row.
- **Item types** — switch any item between area, task and milestone; deleting an area or a task with subtasks asks whether to keep what is inside.
- **Optional layers** — dependency lines, assignees (under or beside the bars, with or without an initials avatar; for areas, tasks, subtasks or any mix), progress inside bars (set per bar, or switched off for a single bar; shown as a pale unfinished part or a darker finished part), a draggable date marker (a line with an optional label — solid, dashed or dotted, in any thickness or colour), milestone guide lines.
- **Styling** — colour palettes (bars take the palette in order and milestones all use its last colour; pick a ready-made one, or paste a single colour and choose from matching palettes — every colour is built to keep labels equally readable; recolour any one area, task or milestone from its details — from the palette, or any colour you like, with its label colour adjusted to stay readable), background colour or transparent, Google Fonts with automatic or exact text size (in points), wrapping long names onto two lines and a choice of what happens if they still don't fit (move outside, shrink, truncate), corner style, row height (Auto fills the canvas — short plans get taller bars — with Compact and Roomy as steps either side of it), separate period and month gridlines, stripes, and a canvas — a slide (16:9, 4:3), A4 or Letter page, square or custom size — that exports at exactly that size, with the height either following the plan or fixed.
- **Import** — paste an outline (tabs, spaces, bullets, numbering, Markdown headings, CSV/TSV, rows copied from a spreadsheet) or upload `.xlsx` / `.csv`. Dates, durations, owners and percentages are detected; undated lists are laid out as a waterfall.
- **Export** — PowerPoint (native, editable shapes), PDF, PNG (3×), copy image to clipboard, and a `.json` project file.
- Zoom with Ctrl/⌘ + scroll or a trackpad pinch; both side panels collapse and can be resized (the widths are remembered).
- Autosaves to the browser, with undo/redo.

## Layout

- `js/core.js` — dates, colour, import parsing, and the chart layout (`buildScene`), which produces a renderer-independent list of shapes.
- `js/app.js` — state, the SVG/canvas/PowerPoint renderers, interactions and panels.
- `vendor/` — PptxGenJS, jsPDF and SheetJS, loaded only when an export or sheet import needs them.
