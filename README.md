# Falcon

A local, offline day planner for Windows. Tasks sit on a day timeline with start and end times, estimates, subtasks, a start/pause timer and repeats. Everything is stored on your PC; there is no account and no network use.

User stories: [Falcon To-Do — User Stories](https://claude.ai/artifact/PYW1RFqwtiPY9C4odbYhbm)

## Features (release 1)

- Day view with previous/next day, a date picker and a daily progress bar
- Timeline whose labels are each card's start and end time
- Add and edit tasks: title, date, start/end time (24-hour), estimated time, subtasks, repeat (every day, weekdays, weekly, monthly) with an optional end date
- Overlapping tasks are blocked everywhere; back-to-back tasks are fine
- Complete tasks and subtasks; a task completes itself when its last subtask is ticked
- One start/pause timer at a time; time spent can be corrected in Edit Task
- Drag a card to move it to a new time, or stretch its top/bottom edge to change its start/end, with live preview and overlap blocking
- Delete, move and stretch show a 5-second Undo
- Keeps running in the system tray when the window is closed; optional "Start with Windows" in the tray menu

## Keyboard

| Action | Keys |
| --- | --- |
| Add task | Ctrl+N |
| Previous / next day | Ctrl+← / Ctrl+→ |
| Go to today | Ctrl+T |
| Complete focused card | Space |
| Edit focused card | Enter |
| Delete focused card | Delete |
| Move focused card up/down a slot | Alt+↑ / Alt+↓ |
| End time 15 minutes earlier/later | Shift+↑ / Shift+↓ |
| Submit the form | Ctrl+Enter |
| Close a form, menu or drag | Esc |

## Develop

Requirements: Node 20+, Rust (stable) with the MSVC toolchain, and WebView2 (preinstalled on Windows 10/11).

```bash
npm install
npm run tauri dev      # the desktop app with hot reload
npm run dev            # UI only in a browser at http://localhost:1420 (data in localStorage)
npm test               # logic tests
npm run tauri build    # installer in src-tauri/target/release/bundle/nsis
```

Data lives in `%APPDATA%\com.falcon.todo\falcon.db` (SQLite).

## Project layout

- `src/lib` — pure logic: time formats, overlap and slot rules, timeline labels, repeats (covered by `logic.test.ts`)
- `src/data/repo.ts` — SQLite storage in the app, localStorage in the browser
- `src/store.ts` — app state and actions (zustand)
- `src/components` — day view (timeline, cards, drag/stretch), task form, header, toasts
- `src-tauri` — Rust shell: tray, close-to-tray, single instance, autostart, database migrations
