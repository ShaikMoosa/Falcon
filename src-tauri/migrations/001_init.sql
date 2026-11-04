CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  date             TEXT    NOT NULL,          -- YYYY-MM-DD
  title            TEXT    NOT NULL,
  start_min        INTEGER NOT NULL,          -- minutes from midnight, 0..1440
  end_min          INTEGER NOT NULL,
  estimate_sec     INTEGER,                   -- NULL = no estimate
  time_spent_sec   INTEGER NOT NULL DEFAULT 0,
  timer_started_at INTEGER,                   -- epoch ms while the timer runs
  completed        INTEGER NOT NULL DEFAULT 0,
  expanded         INTEGER NOT NULL DEFAULT 0,
  series_id        TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);

CREATE TABLE IF NOT EXISTS subtasks (
  id        TEXT PRIMARY KEY,
  task_id   TEXT    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title     TEXT    NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

CREATE TABLE IF NOT EXISTS series (
  id             TEXT PRIMARY KEY,
  freq           TEXT    NOT NULL,          -- daily | weekdays | weekly | monthly
  start_date     TEXT    NOT NULL,
  till_date      TEXT,
  title          TEXT    NOT NULL,
  start_min      INTEGER NOT NULL,
  end_min        INTEGER NOT NULL,
  estimate_sec   INTEGER,
  subtask_titles TEXT    NOT NULL DEFAULT '[]'  -- JSON array of strings
);

-- Dates where a single occurrence of a series was deleted.
CREATE TABLE IF NOT EXISTS series_exceptions (
  series_id TEXT NOT NULL,
  date      TEXT NOT NULL,
  PRIMARY KEY (series_id, date)
);
