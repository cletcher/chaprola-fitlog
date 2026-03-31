// OPTIMIZE_MODEL - Use HULDRA to fit linear model to workout data
// Minimizes sum of squared residuals
// Model: 1RM = R1 * day + R2
// where R1 = slope (daily gain), R2 = base 1RM
// Exercise is passed via PARAM.exercise

DEFINE VARIABLE REC R41
DEFINE VARIABLE DAY R42
DEFINE VARIABLE OBS R43
DEFINE VARIABLE PRED R44
DEFINE VARIABLE RESID R45
DEFINE VARIABLE SSR R46
DEFINE VARIABLE CNT R47

// Calculate SSR for current R1 (slope) and R2 (base)
LET SSR = 0
LET CNT = 0
LET REC = 1

// Read through workouts file and calculate residuals
100 SEEK REC
    IF EOF GOTO 200
    // Check if this workout matches the exercise parameter
    MOVE BLANKS U.100 40
    MOVE PARAM.exercise U.100 40
    MOVE BLANKS U.150 40
    MOVE P.exercise U.150 40
    IF EQUAL U.100 U.150 40 GOTO 110
    GOTO 150

110 GET DAY FROM P.day_number
    GET OBS FROM P.estimated_1rm
    IF DAY LE 0 GOTO 150
    IF OBS LE 0 GOTO 150

    // Calculate predicted value: R1 * day + R2
    LET PRED = R1 * DAY
    LET PRED = PRED + R2

    // Calculate squared residual
    LET RESID = OBS - PRED
    LET RESID = RESID * RESID
    LET SSR = SSR + RESID
    LET CNT = CNT + 1

150 LET REC = REC + 1
    GOTO 100

// Store SSR in R21 for HULDRA to minimize
200 LET R21 = SSR

    // Print results (for debugging)
    MOVE BLANKS U.1 80
    MOVE "Slope: " U.1 7
    PUT R1 INTO U.8 10 F 4
    PRINT 0
    MOVE BLANKS U.1 80
    MOVE "Base: " U.1 6
    PUT R2 INTO U.7 10 F 2
    PRINT 0
    MOVE BLANKS U.1 80
    MOVE "SSR: " U.1 5
    PUT SSR INTO U.6 12 F 2
    PRINT 0
    MOVE BLANKS U.1 80
    MOVE "Count: " U.1 7
    PUT CNT INTO U.8 6 I 0
    PRINT 0

    END
