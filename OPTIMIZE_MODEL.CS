// OPTIMIZE_MODEL — fit 1RM = slope * day + base for one user/exercise.
// Closed-form ordinary-least-squares. Two passes over the user's workouts:
//   pass 1 computes sums for slope/base (one-shot, no HULDRA iteration).
//   pass 2 computes r² from residuals.
// Output (one line each):
//   slope|<float>
//   base|<float>
//   r_squared|<float>
//   n|<count>
// Caller (FITLOG_API.refitModel) parses these and upserts models.DA.
//
// PARAM.exercise — which exercise to fit (bench_press, squat, etc.)
// PARAM.user_id  — required. Fit uses only this user's workouts.
//
// Exercise match uses EQ not CONTAINS so "bench_press" does not also match
// a future "incline_bench_press" (reasoning carried from HISTORY_STATS).

OPEN PRIMARY "workouts"

QUERY workouts INTO match WHERE exercise EQ PARAM.exercise AND user_id EQ PARAM.user_id

LET n = 0
LET sx = 0
LET sy = 0
LET sxx = 0
LET sxy = 0
LET day = 0
LET y = 0
LET prod = 0
LET rec = 1

100 READ match rec
    IF EOF GOTO 200
    GET day FROM match.day_number
    GET y FROM match.estimated_1rm
    IF day LE 0 GOTO 150
    IF y LE 0 GOTO 150
    LET n = n + 1
    LET sx = sx + day
    LET sy = sy + y
    LET prod = day * day
    LET sxx = sxx + prod
    LET prod = day * y
    LET sxy = sxy + prod

150 LET rec = rec + 1
    GOTO 100

200 IF n LT 2 GOTO 900

    LET denom = n * sxx
    LET prod = sx * sx
    LET denom = denom - prod
    IF denom EQ 0 GOTO 900

    LET slope = n * sxy
    LET prod = sx * sy
    LET slope = slope - prod
    LET slope = slope / denom

    LET base = slope * sx
    LET base = sy - base
    LET base = base / n

    LET ymean = sy / n

    LET ssr = 0
    LET tss = 0
    LET pred = 0
    LET resid = 0
    LET dev = 0
    LET rec = 1

300 READ match rec
    IF EOF GOTO 400
    GET day FROM match.day_number
    GET y FROM match.estimated_1rm
    IF day LE 0 GOTO 350
    IF y LE 0 GOTO 350
    LET pred = slope * day
    LET pred = pred + base
    LET resid = y - pred
    LET prod = resid * resid
    LET ssr = ssr + prod
    LET dev = y - ymean
    LET prod = dev * dev
    LET tss = tss + prod

350 LET rec = rec + 1
    GOTO 300

400 LET r2 = 1
    IF tss LE 0 GOTO 500
    LET frac = ssr / tss
    LET r2 = r2 - frac
    IF r2 LT 0 LET r2 = 0 ;

500 PRINT "slope|" + slope
    PRINT "base|" + base
    PRINT "r_squared|" + r2
    PRINT "n|" + n
    END

// Insufficient data (n < 2 or degenerate denom) — print n so the caller can
// detect and skip the upsert. slope/base/r_squared deliberately omitted.
900 PRINT "n|" + n
