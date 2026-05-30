# Multiply Match 🐸

A two-panel multiplication memory game. Pick two factor cards on the left,
then find their product on the right. Wrong answers flip everything back — 
so memory matters!

## How to play

1. Click **two number cards** on the left panel (the factors).
2. Click a **product card** on the right panel.
3. If `factor1 × factor2 = product` — all three stay face-up (matched ✅).
4. If wrong — the two factor cards and any previously revealed product card
   flip back face-down. Remember where they were!
5. Match all pairs to win. 🎉

## Levels

| Level | Pairs | Factor cards | Product cards |
|-------|-------|--------------|---------------|
| 1     | 4     | 8            | 4             |
| 2     | 9     | 18           | 9             |
| 3     | 16    | 32           | 16            |
| 4     | 25    | 50           | 25            |

Complete a level to unlock the next one.

## Files

| File                 | 🧿 | Description                                       |
|----------------------|----|---------------------------------------------------|
| index.html           | 🌐 | Game shell — two panels, controls bar, win banner |
| makefile             | 🚂 | Deploy targets (GitHub orphan-push)               |
| script.js            | 🥨 | All game logic (pair gen, state machine, timer)   |
| styles.css           | 🎨 | Two-panel layout, card states, animations         |
