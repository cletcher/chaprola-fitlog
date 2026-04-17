# FitLog

Fitness workout tracker built on [Chaprola](https://chaprola.org). Logs strength training workouts (bench press, squat, deadlift, overhead press) and uses HULDRA nonlinear optimization to fit linear regression models for 1RM predictions.

**Live app:** https://chaprola.org/apps/chaprola-fitlog/chaprola-fitlog/

## Architecture

- **Frontend:** Static HTML/CSS/JS hosted on Chaprola CDN (`frontend/`)
- **Backend:** Chaprola data platform — workout data in `workouts.DA`, fitted model parameters in `models.DA`
- **Optimization:** HULDRA fits `1RM = slope × day + base` per exercise, minimizing sum of squared residuals

## Pages

- **Dashboard** — Overview cards for all 4 exercises with current 1RM estimates, weekly gains, and 30-day projections
- **Log Workout** — Record sets (exercise, weight, reps) with automatic Epley 1RM calculation
- **Exercise Detail** — Per-exercise progress chart with fitted model curve and projections
- **History** — Filterable workout history with pagination

## Chaprola userid/project

- **userid:** `chaprola-fitlog`
- **project:** `fitlog`
