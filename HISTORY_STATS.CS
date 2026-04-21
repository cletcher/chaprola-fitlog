// HISTORY_STATS — aggregate stats over workouts, scoped to one user.
// PARAM.exercise — filter; empty matches every exercise (CONTAINS "" trick).
// PARAM.user_id  — required. Scopes every stat to one user's workouts.
// Output (one line each):
//   total_sets|<count>
//   max_1rm|<int>
//   total_volume|<int>
//   avg_reps|<float>
//
// Exercise filter keeps CONTAINS "" for the match-all trick (rule 15) —
// the four exercise names have no substring overlap so CONTAINS is safe
// here. If "incline_bench_press" is added later, swap to EQ + branch.

OPEN PRIMARY "workouts"

QUERY workouts INTO hist WHERE exercise CONTAINS PARAM.exercise AND user_id EQ PARAM.user_id

LET total_sets = 0
LET max_1rm = 0
LET total_volume = 0
LET total_reps = 0
LET w = 0
LET r = 0
LET est = 0
LET vol = 0
LET avg_reps = 0
LET rec = 1

100 READ hist rec
    IF EOF GOTO 200
    GET w FROM hist.weight
    GET r FROM hist.reps
    GET est FROM hist.estimated_1rm
    LET total_sets = total_sets + 1
    LET vol = w * r
    LET total_volume = total_volume + vol
    LET total_reps = total_reps + r
    IF est LE max_1rm GOTO 150
    LET max_1rm = est
150 LET rec = rec + 1
    GOTO 100

200 IF total_sets EQ 0 GOTO 300
    LET avg_reps = total_reps / total_sets

300 PRINT "total_sets|" + total_sets
    PRINT "max_1rm|" + max_1rm
    PRINT "total_volume|" + total_volume
    PRINT "avg_reps|" + avg_reps
