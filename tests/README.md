# Browser tests

Playwright scripts that drive the real app in headless Chromium: they set up a plan, click and type like a person, and print
what they observe (positions, stored values, scene contents). They are smoke and behaviour checks, not strict assertions:
a script fails if it throws, times out, logs a page error, or finds a popover button cut off.

```bash
bash tests/run.sh            # all of them (starts a local server on :8765)
bash tests/run.sh popover    # only scripts whose file name contains "popover"
node tests/reset-defaults.js # one script, with the server already running: python3 -m http.server 8765
```

Needs Node and `playwright` resolvable (`npm i -g playwright`, or set `NODE_PATH`). Screenshots go to a temp folder printed at the end.

When you change the UI on purpose, expect scripts that touch the changed control to need updating. Each file starts with a
one-line description of what it covers.
