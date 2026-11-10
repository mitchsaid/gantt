# Gantt

A simple Gantt / project-plan chart maker built for charts you put on slides, proposals and reports.

No build step and no backend: it is a static site. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

## What it does

- **Up to three levels** — areas, tasks and subtasks, plus milestones (kickoff, demo, go-live…). Areas are optional: a plan can be a flat list of tasks.
- **Direct editing** — drag bars to move them, drag their ends to resize, drag the progress edge, drag rows to reorder (in the outline or on the chart labels). Drag a row sideways to nest it: an area dropped under another becomes a task and its tasks become subtasks. Click a bar for its name, dates and duration (in days, weeks, sprints or months); click the title or double-click a label to rename it in place.
- **Add from the chart** — the + Task / + Milestone / + Area buttons under the chart add after the selected row and let you name the new item in place.
- **Timeline first** — click the date header (or use Design → Timeline) to fix the overall span, then spread the tasks across it. An undated list pasted onto a fixed timeline is laid out to fill it.
- **Presentation options** — task names on the left or on the bars; area names as heading rows or down the side spanning their tasks; optional title; days, weeks, sprints (1–4 weeks), months or quarters; calendar dates or numbered periods ("Week 1"); dates at the top, bottom or both.
- **Optional layers** — dependency lines, assignees (tasks, subtasks or both), progress inside bars, a draggable "We are here" line, milestone guide lines.
- **Styling** — primary and optional secondary colour (the palette for each area is derived from them), background colour or transparent, Google Fonts, corner style, row height, gridlines, stripes, and a slide or report format.
- **Import** — paste an outline (tabs, spaces, bullets, numbering, Markdown headings, CSV/TSV, rows copied from a spreadsheet) or upload `.xlsx` / `.csv`. Dates, durations, owners and percentages are detected; undated lists are laid out as a waterfall.
- **Export** — PowerPoint (native, editable shapes), PDF, PNG (3×), copy image to clipboard, and a `.json` project file.
- Zoom with Ctrl/⌘ + scroll or a trackpad pinch; both side panels collapse.
- Autosaves to the browser, with undo/redo.

## Layout

- `js/core.js` — dates, colour, import parsing, and the chart layout (`buildScene`), which produces a renderer-independent list of shapes.
- `js/app.js` — state, the SVG/canvas/PowerPoint renderers, interactions and panels.
- `vendor/` — PptxGenJS, jsPDF and SheetJS, loaded only when an export or sheet import needs them.
