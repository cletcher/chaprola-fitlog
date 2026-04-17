// OPTIMIZE_MODEL — HULDRA VALUE program: fit linear model to workout data
// Model: 1RM = R1 * day + R2
// R1 = slope (daily gain), R2 = base 1RM (set by HULDRA)
// R21 = SSR (read by HULDRA)
// Parameter: exercise (e.g., "bench_press")

OPEN PRIMARY "workouts"

LET ssr = 0
LET count = 0
LET day = 0
LET obs = 0
LET pred = 0
LET resid = 0
LET rec = 1
MOVE PARAM.exercise U.100 40

100 SEEK rec
    IF EOF GOTO 200 ;
    MOVE P.exercise U.50 40
    IF EQUAL U.100 U.50 40 GOTO 110 ;
    GOTO 150

110 GET day FROM P.day_number
    GET obs FROM P.estimated_1rm
    IF day LE 0 GOTO 150 ;
    IF obs LE 0 GOTO 150 ;

    // predicted = R1 * day + R2
    LET pred = R1 * day
    LET pred = pred + R2

    // squared residual
    LET resid = obs - pred
    LET resid = resid * resid
    LET ssr = ssr + resid
    LET count = count + 1

150 LET rec = rec + 1
    GOTO 100

200 LET R21 = ssr
