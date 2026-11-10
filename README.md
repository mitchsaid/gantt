# Gantt

A simple Gantt / project-plan chart maker built for charts you put on slides, proposals and reports.

No build step and no backend: it is a static site. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

## What it does

- **Three levels** — areas, tasks and subtasks, plus milestones (kickoff, demo, go-live…).
- **Direct editing** — drag bars to move them, drag their ends to resize, drag the progress edge, drag rows to reorder (in the outline or on the chart labels). Dragging an area moves everything inside it.
- **Presentation options** — task names on the left or on the bars; days, weeks, sprints (1–4 weeks), months or quarters; calendar dates or numbered periods ("Week 1"); dates at the top, bottom or both.
- **Optional layers** — dependency lines, assignees (tasks, subtasks or both), progress inside bars, a draggable "We are here" line, milestone guide lines.
- **Styling** — primary and optional secondary colour (the palette for each area is derived from them), background colour or transparent, Google Fonts, corner style, row height, gridlines, stripes, and a slide or report format.
- **Import** — paste an outline (tabs, spaces, bullets, numbering, Markdown headings, CSV/TSV, rows copied from a spreadsheet) or upload `.xlsx` / `.csv`. Dates, durations, owners and percentages are detected; undated lists are laid out as a waterfall.
- **Export** — PowerPoint (native, editable shapes), PDF, PNG (3×), copy image to clipboard, and a `.json` project file.
- Autosaves to the browser, with undo/redo.

## Layout

- `js/core.js` — dates, colour, import parsing, and the chart layout (`buildScene`), which produces a renderer-independent list of shapes.
- `js/app.js` — state, the SVG/canvas/PowerPoint renderers, interactions and panels.
- `vendor/` — PptxGenJS, jsPDF and SheetJS, loaded only when an export or sheet import needs them.
