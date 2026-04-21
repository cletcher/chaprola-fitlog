// OPTIMIZE_MODEL — HULDRA fitness function: 1RM = R1 * day + R2
// R1 = slope (daily gain), R2 = base 1RM (both HULDRA-controlled)
// R21 = SSR (read by HULDRA)
// PARAM.exercise — which exercise to fit (bench_press, squat, etc.)
// PARAM.user_id  — required. Fit uses only this user's workouts.

OPEN PRIMARY "workouts"

QUERY workouts INTO match WHERE exercise CONTAINS PARAM.exercise AND user_id EQ PARAM.user_id

LET ssr = 0
LET day = 0
LET obs = 0
LET pred = 0
LET resid = 0
LET rec = 1

100 READ match rec
    IF EOF GOTO 200
    GET day FROM match.day_number
    GET obs FROM match.estimated_1rm
    IF day LE 0 GOTO 150
    IF obs LE 0 GOTO 150
    LET pred = R1 * day
    LET pred = pred + R2
    LET resid = obs - pred
    LET resid = resid * resid
    LET ssr = ssr + resid

150 LET rec = rec + 1
    GOTO 100

200 LET R21 = ssr
