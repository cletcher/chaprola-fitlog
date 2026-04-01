# Fix Auth Headers in All HTML Pages

**Source:** Vogel eval v1 (2026-03-30)
**Status:** REWORK SECTION

## Problem

Dashboard (index.html) makes raw `fetch()` calls without auth headers (lines 52-75), causing 401 errors. Other pages (log.html, exercise.html, history.html) likely have the same bug.

api.js defines FITLOG_API helper with correct headers (lines 7-16), but HTML pages don't use it.

## What to Fix

1. **index.html line 52-75:** Replace raw fetch() with FITLOG_API.query()
2. **Audit log.html, exercise.html, history.html:** Check for same pattern
3. **Test dashboard loads:** Verify models and workouts appear

## Other Issues from Eval

- Empty README (18 bytes) — write what HULDRA does, what app demonstrates
- No sample data loader — add button to seed demo workouts
- Build log said "rate limit" — may be incomplete, verify all features exist
- Verify HULDRA optimization is server-side (check Network tab for /optimize calls)

## Filed

2026-03-31 04:00 UTC, Tawni
