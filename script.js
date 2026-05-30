// Multiply Match
//
// Layout: [Keypads (stacked)] | [Product cards]
//
// Game flow:
//   1. The game auto-reveals a random face-down product card each turn.
//   2. Player taps one number on the LEFT keypad (Factor A).
//      — If it can't divide the product cleanly, the button flashes red;
//        player stays in the Factor A step.
//   3. Player taps one number on the RIGHT keypad (Factor B).
//   4. Correct (A × B = product): card stays face-up, turns matched green;
//      game reveals the next card automatically.
//      Wrong: card flips back after a brief pause; next card is revealed.
//
// Any valid A×B factoring counts — commutativity is respected.
//
// Hint button: shows the N×N multiplication table for the current level
// for 3 seconds, with selected factors highlighted.

(function () {
    "use strict";

    // ── Levels ────────────────────────────────────────────────────────────────
    // maxFactor : highest number on the keypads (1 … maxFactor)
    // kpCols    : columns in each keypad grid
    // cardSize  : product card side length (px)
    // cardFont  : product card font size (px)

    const LEVELS = [
        { maxFactor:  4, kpCols: 2, cardSize: 68, cardFont: 20 },
        { maxFactor:  6, kpCols: 3, cardSize: 56, cardFont: 17 },
        { maxFactor:  9, kpCols: 3, cardSize: 48, cardFont: 14 },
        { maxFactor: 12, kpCols: 3, cardSize: 42, cardFont: 13 },
    ];

    const INITIAL_UNLOCKED = 1;
    const HINT_DURATION_MS = 3000;
    const KEYBOARD_ENTRY_DELAY_MS = 450;
    const REVEAL_EMOJIS = [
        "🌸", "🌺", "🌻", "🌼", "🌷", "💐",
        "🧜‍♀️", "🌵", "🐯", "🐻", "🍄", "😀", "😄", "🙂", "😊",
    ];

    // ── Messages ──────────────────────────────────────────────────────────────

    const COMPLIMENTS = [
        "Amazing!", "Excellent!", "You rock!", "Correct! 🎯",
        "Nice work!", "You are the greatest!", "How did you do that?",
        "Spot on!", "Nailed it!", "Outstanding!",
    ];

    const BUMMERS = [
        "Bummer!", "So close…", "Almost!", "Keep trying!",
        "Don't give up!", "You can do it!", "Not quite!",
        "Give it another go!", "Man, I thought you had that one!",
    ];

    // ── State ─────────────────────────────────────────────────────────────────

    const state = {
        levelIdx: 0,
        highestIdx: INITIAL_UNLOCKED,

        products: [],            // [{ value, matched, faceUp, gridSide, tileRow, tileCol, _idx }]

        // Step enforces the required selection order:
        //   'product'  — waiting for the player to reveal a product card
        //   'factorA'  — product chosen; waiting for Factor A (left keypad)
        //   'factorB'  — Factor A valid; waiting for Factor B (right keypad)
        step: "product",

        selectedProduct: null,   // index into products[] (or null)
        leftFactor:  null,       // value chosen from left keypad  (or null)
        rightFactor: null,       // value chosen from right keypad (or null)

        locked: false,
        matches: 0,
        picks: 0,

        startTime: 0,
        endTime: 0,
        tickHandle: null,
        timerStarted: false,
        keyboardBuffer: "",
        keyboardBufferTimer: null,

        frogTimers: [],
        gameId: 0,
        revealEmoji: REVEAL_EMOJIS[0],

        hintTimer: null,
        hintCountdownHandle: null,
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────

    const $level         = document.getElementById("level");
    const $score         = document.getElementById("score");
    const $newGame       = document.getElementById("newGame");
    const $hintBtn       = document.getElementById("hintBtn");
    const $status        = document.getElementById("status");
    const $banner        = document.getElementById("winBanner");
    const $winText       = document.getElementById("winText");
    const $nextLevel     = document.getElementById("nextLevel");
    const $frogParade    = document.getElementById("frogParade");
    const $timeNow       = document.getElementById("timeNow");
    const $timeBest      = document.getElementById("timeBest");
    const $picksNow      = document.getElementById("picksNow");
    const $picksBest     = document.getElementById("picksBest");
    const $kpLeft        = document.getElementById("keypad-left");
    const $kpRight       = document.getElementById("keypad-right");
    const $productPanel  = document.getElementById("product-panel");
    const $hintOverlay   = document.getElementById("hintOverlay");
    const $hintContent   = document.getElementById("hintContent");
    const $hintCountdown = document.getElementById("hintCountdown");

    // ── Helpers ───────────────────────────────────────────────────────────────

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function randomBetween(min, max) { return min + Math.random() * (max - min); }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function setStatus(msg) { $status.textContent = msg || "\u00A0"; }

    // ── Product generation ────────────────────────────────────────────────────
    // Compute every unique product reachable from {1 … maxFactor} × {1 … maxFactor},
    // then add repeated products until the board has a complete square of cards.
    // Store the canonical factor pair for each card, but evaluation accepts ANY
    // valid factoring.

    function buildProducts(maxFactor) {
        const seen = new Set();
        const uniqueProducts = [];
        for (let a = 1; a <= maxFactor; a++) {
            for (let b = a; b <= maxFactor; b++) {
                const v = a * b;
                if (!seen.has(v)) {
                    seen.add(v);
                    uniqueProducts.push({ value: v, a, b });
                }
            }
        }

        const side = Math.ceil(Math.sqrt(uniqueProducts.length));
        const targetCount = side * side;
        const list = shuffle(uniqueProducts.slice());

        while (list.length < targetCount) {
            const needed = targetCount - list.length;
            list.push(...shuffle(uniqueProducts.slice()).slice(0, needed));
        }

        shuffle(list);
        return list.map((p, idx) => ({
            value:   p.value,
            a:       p.a,
            b:       p.b,
            matched: false,
            faceUp:  false,
            gridSide: side,
            tileRow:  Math.floor(idx / side),
            tileCol:  idx % side,
            _idx:    idx,
        }));
    }

    // ── Level select UI ───────────────────────────────────────────────────────

    function rebuildLevelOptions() {
        $level.innerHTML = "";
        LEVELS.forEach((lvl, i) => {
            const opt = document.createElement("option");
            opt.value = String(i);
            const locked = i > state.highestIdx;
            opt.textContent =
                `${i + 1}  (1 – ${lvl.maxFactor})${locked ? "  🔒" : ""}`;
            opt.disabled = locked;
            $level.appendChild(opt);
        });
        $level.value = String(state.levelIdx);
    }

    function updateScore() {
        $score.textContent = `${state.matches} / ${state.products.length}`;
    }

    function updatePicks() { $picksNow.textContent = String(state.picks); }

    // ── Timer ─────────────────────────────────────────────────────────────────

    function fmtTime(ms) {
        if (ms == null || ms < 0) return "--:--";
        const total = Math.floor(ms / 1000);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    }

    function bestKey()      { return `multiply.best.${state.levelIdx}`; }
    function bestPicksKey() { return `multiply.bestpicks.${state.levelIdx}`; }

    function getLS(key) {
        try { const v = localStorage.getItem(key); return v == null ? null : parseInt(v, 10) || null; }
        catch (_) { return null; }
    }
    function setLS(key, val) {
        try { localStorage.setItem(key, String(val)); } catch (_) {}
    }

    function getBest()      { return getLS(bestKey()); }
    function getBestPicks() { return getLS(bestPicksKey()); }
    function setBest(ms)    { setLS(bestKey(), ms); }
    function setBestPicks(n){ setLS(bestPicksKey(), n); }

    function refreshBestDisplay() {
        const b = getBest();
        $timeBest.textContent  = b  == null ? "--:--" : fmtTime(b);
        const bp = getBestPicks();
        $picksBest.textContent = bp == null ? "--"    : String(bp);
    }

    function tickTimer() {
        $timeNow.textContent = fmtTime(Math.max(0, (state.endTime || Date.now()) - state.startTime));
    }

    function startTimer() {
        state.startTime = Date.now();
        state.endTime = 0;
        state.timerStarted = true;
        if (state.tickHandle) clearInterval(state.tickHandle);
        tickTimer();
        state.tickHandle = setInterval(tickTimer, 250);
    }

    function stopTimer() {
        state.endTime = Date.now();
        if (state.tickHandle) { clearInterval(state.tickHandle); state.tickHandle = null; }
        tickTimer();
        return Math.max(0, state.endTime - state.startTime);
    }

    // ── Win / frog parade ─────────────────────────────────────────────────────

    function cancelFrogTimers() { state.frogTimers.forEach(clearTimeout); state.frogTimers = []; }
    function clearFrogParade()  { $frogParade.replaceChildren(); }

    function hideWinEffects() { $banner.hidden = true; cancelFrogTimers(); clearFrogParade(); }

    function showWinEffects() {
        $banner.hidden = false;
        cancelFrogTimers();
        clearFrogParade();
        state.frogTimers.push(setTimeout(launchFrogParade, 700));
    }

    function launchFrogParade() {
        if ($banner.hidden) return;
        clearFrogParade();
        const count = 4 + (state.levelIdx * 2) +
            Math.floor(Math.random() * (5 + state.levelIdx * 3));
        let longestRun = 0;
        for (let i = 0; i < count; i++) {
            const frog = document.createElement("span");
            const icon = document.createElement("span");
            const size = Math.round(randomBetween(28, 58));
            const dur  = randomBetween(4.8, 8.4);
            const dly  = randomBetween(0, 1.2) + (i * 0.07);
            frog.className = "frog";
            frog.style.setProperty("--lane",     `${randomBetween(14, 76).toFixed(1)}vh`);
            frog.style.setProperty("--size",     `${size}px`);
            frog.style.setProperty("--duration", `${dur.toFixed(2)}s`);
            frog.style.setProperty("--delay",    `${dly.toFixed(2)}s`);
            frog.style.setProperty("--drift",    `${Math.round(randomBetween(80, 260))}px`);
            frog.style.setProperty("--jump",     `${Math.round(size * randomBetween(0.45, 0.8))}px`);
            icon.className = "frog-icon";
            icon.textContent = "🐸";
            frog.appendChild(icon);
            $frogParade.appendChild(frog);
            longestRun = Math.max(longestRun, dur + dly);
        }
        state.frogTimers.push(
            setTimeout(clearFrogParade, Math.ceil((longestRun + 0.7) * 1000))
        );
    }

    // ── Hint: N×N multiplication table overlay ───────────────────────────────

    function buildHintTable(maxFactor) {
        const lf = state.leftFactor;
        const rf = state.rightFactor;

        const table = document.createElement("table");
        table.id = "multiTable";

        // Header row
        const hrow = document.createElement("tr");
        const corner = document.createElement("th");
        corner.textContent = "×";
        corner.className = "hint-corner";
        hrow.appendChild(corner);
        for (let c = 1; c <= maxFactor; c++) {
            const th = document.createElement("th");
            th.textContent = String(c);
            if (c === lf || c === rf) th.classList.add("hint-factor-header");
            hrow.appendChild(th);
        }
        table.appendChild(hrow);

        // Data rows
        for (let r = 1; r <= maxFactor; r++) {
            const row = document.createElement("tr");
            const rh = document.createElement("th");
            rh.textContent = String(r);
            if (r === lf || r === rf) rh.classList.add("hint-factor-header");
            row.appendChild(rh);

            for (let c = 1; c <= maxFactor; c++) {
                const td = document.createElement("td");
                td.textContent = String(r * c);
                const isAnswer = lf !== null && rf !== null &&
                    ((r === lf && c === rf) || (r === rf && c === lf));
                if (isAnswer) {
                    td.className = "hint-match";
                } else if (lf !== null && (r === lf || c === lf)) {
                    td.classList.add("hint-factor-col");
                } else if (rf !== null && (r === rf || c === rf)) {
                    td.classList.add("hint-factor-col");
                } else if (r === c) {
                    td.className = "hint-diagonal";
                }
                row.appendChild(td);
            }
            table.appendChild(row);
        }

        $hintContent.replaceChildren(table);
    }

    function cancelHint() {
        if (state.hintTimer) { clearTimeout(state.hintTimer); state.hintTimer = null; }
        if (state.hintCountdownHandle) {
            clearInterval(state.hintCountdownHandle);
            state.hintCountdownHandle = null;
        }
        $hintOverlay.hidden = true;
        $hintOverlay.setAttribute("aria-hidden", "true");
        $hintCountdown.textContent = "";
    }

    function showHint() {
        cancelHint();
        const maxFactor = LEVELS[state.levelIdx].maxFactor;
        buildHintTable(maxFactor);
        $hintOverlay.hidden = false;
        $hintOverlay.setAttribute("aria-hidden", "false");

        let remaining = Math.ceil(HINT_DURATION_MS / 1000);
        $hintCountdown.textContent = `(${remaining}s)`;
        state.hintCountdownHandle = setInterval(() => {
            remaining -= 1;
            $hintCountdown.textContent = remaining > 0 ? `(${remaining}s)` : "";
        }, 1000);

        state.hintTimer = setTimeout(cancelHint, HINT_DURATION_MS);
    }

    // ── Game lifecycle ────────────────────────────────────────────────────────

    function newGame() {
        const level = LEVELS[state.levelIdx];
        state.gameId += 1;
        cancelHint();
        clearKeyboardBuffer();

        state.products        = buildProducts(level.maxFactor);
        state.revealEmoji     = pick(REVEAL_EMOJIS);
        state.step            = "product";
        state.selectedProduct = null;
        state.leftFactor      = null;
        state.rightFactor     = null;
        state.locked          = false;
        state.matches         = 0;
        state.picks           = 0;
        state.timerStarted    = false;
        state.endTime         = 0;

        if (state.tickHandle) { clearInterval(state.tickHandle); state.tickHandle = null; }
        $timeNow.textContent = "0:00";

        $level.value = String(state.levelIdx);
        updateScore();
        updatePicks();
        setStatus("Get ready…");
        hideWinEffects();
        renderBoard();   // renderBoard calls refreshKeypadDim() at the end
        refreshBestDisplay();
        setTimeout(revealNextProduct, 200);
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    function renderBoard() {
        const level = LEVELS[state.levelIdx];
        const N = level.maxFactor;

        // ── Keypads ──
        renderKeypad($kpLeft,  N, level.kpCols, "left");
        renderKeypad($kpRight, N, level.kpCols, "right");

        // ── Product panel ──
        const prodCols = state.products.length ? state.products[0].gridSide : 1;
        $productPanel.style.setProperty("--prod-cols",  String(prodCols));
        $productPanel.style.setProperty("--card-size",  `${level.cardSize}px`);
        $productPanel.style.setProperty("--card-font",  `${level.cardFont}px`);
        $productPanel.style.setProperty("--emoji-font", `${Math.round(level.cardSize * prodCols * 0.86)}px`);
        $productPanel.innerHTML = "";

        state.products.forEach((card, idx) => {
            const el = document.createElement("div");
            el.className = "prod-card";
            applyProductState(el, card);
            // No click listener — game auto-reveals product cards
            $productPanel.appendChild(el);
        });

        refreshKeypadDim();
    }

    function renderKeypad($el, maxFactor, cols, side) {
        $el.style.setProperty("--kp-cols", String(cols));
        $el.innerHTML = "";
        for (let n = 1; n <= maxFactor; n++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "key-btn";
            btn.textContent = String(n);
            btn.dataset.value = String(n);
            const selectedVal = side === "left" ? state.leftFactor : state.rightFactor;
            if (n === selectedVal) btn.classList.add("key-selected");
            btn.addEventListener("click", () => onKeyClick(n, side));
            $el.appendChild(btn);
        }
    }

    // ── State painters ────────────────────────────────────────────────────────

    function applyProductState(el, card) {
        el.classList.remove("prod-down", "prod-selected", "prod-matched");
        if (card.matched) {
            el.classList.add("prod-matched");
            el.setAttribute("aria-label", `Matched product ${card.value}`);
            el.replaceChildren(buildEmojiTile(card));
        } else if (card.faceUp) {
            el.classList.add("prod-selected");
            el.setAttribute("aria-label", `Product ${card.value}`);
            el.textContent = String(card.value);
        } else {
            el.classList.add("prod-down");
            el.setAttribute("aria-label", "Hidden product");
            el.textContent = "?";
        }
    }

    function buildEmojiTile(card) {
        const side = card.gridSide || 1;
        const tile = document.createElement("span");
        tile.className = "prod-emoji-tile";
        tile.setAttribute("aria-hidden", "true");
        tile.textContent = state.revealEmoji;
        tile.style.width  = `${side * 100}%`;
        tile.style.height = `${side * 100}%`;
        tile.style.left   = `${-(card.tileCol || 0) * 100}%`;
        tile.style.top    = `${-(card.tileRow || 0) * 100}%`;
        return tile;
    }

    function refreshProduct(idx) {
        const el = $productPanel.children[idx];
        if (el) applyProductState(el, state.products[idx]);
    }

    function refreshKeypad($el, side) {
        const selectedVal = side === "left" ? state.leftFactor : state.rightFactor;
        Array.from($el.children).forEach(btn => {
            btn.classList.toggle("key-selected",
                parseInt(btn.dataset.value, 10) === selectedVal);
        });
    }

    // Apply or remove the dim overlay on each keypad depending on the
    // current step.  Dimmed keypads are visually faded and non-interactive.
    function refreshKeypadDim() {
        // Left keypad: active only in 'factorA' or 'factorB' steps
        $kpLeft.classList.toggle("keypad-dim",
            state.step === "product");

        // Right keypad: active only in 'factorB' step
        $kpRight.classList.toggle("keypad-dim",
            state.step !== "factorB");
    }

    // Flash a Factor-A button red to signal an impossible factor, then
    // let the CSS animation fade it back to normal.  The button element
    // is located by its data-value attribute.
    function flashImpossible(value) {
        const btn = Array.from($kpLeft.children)
            .find(b => parseInt(b.dataset.value, 10) === value);
        if (!btn) return;
        // Remove first in case it's already animating (rapid double-tap)
        btn.classList.remove("key-impossible");
        // Force reflow so removing+re-adding restarts the animation
        void btn.offsetWidth;
        btn.classList.add("key-impossible");
        btn.addEventListener("animationend", () => {
            btn.classList.remove("key-impossible");
        }, { once: true });
    }

    // ── Auto-reveal ───────────────────────────────────────────────────────────
    // Pick a random unmatched, face-down product card and flip it face-up so
    // the player can enter its two factors.  Starts the timer on first reveal.

    function revealNextProduct() {
        const eligible = state.products
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => !c.matched && !c.faceUp);

        if (eligible.length === 0) return;   // all matched — win is imminent

        // Deselect any previously face-up (unmatched) card
        if (state.selectedProduct !== null) {
            const prev = state.products[state.selectedProduct];
            if (!prev.matched) {
                prev.faceUp = false;
                refreshProduct(state.selectedProduct);
            }
        }

        const { c: card, i: idx } = eligible[Math.floor(Math.random() * eligible.length)];
        card.faceUp           = true;
        state.selectedProduct = idx;
        state.leftFactor      = null;
        state.rightFactor     = null;
        state.step            = "factorA";

        refreshKeypad($kpLeft,  "left");
        refreshKeypad($kpRight, "right");
        refreshKeypadDim();

        // Play the flip animation
        const el = $productPanel.children[idx];
        if (el) {
            el.classList.add("prod-reveal");
            el.addEventListener("animationend", () => {
                el.classList.remove("prod-reveal");
                applyProductState(el, card);
            }, { once: true });
            // Show the value immediately so it appears on the face-up side
            applyProductState(el, card);
        }

        if (!state.timerStarted) startTimer();
        setStatus(`What two factors multiply to ${card.value}?`);
    }

    // ── Click: product card (disabled — game auto-reveals) ────────────────────

    // eslint-disable-next-line no-unused-vars
    function onProductClick() { /* no-op: game controls card reveal */ }

    // ── Keyboard / numpad input ───────────────────────────────────────────────

    function clearKeyboardBuffer() {
        if (state.keyboardBufferTimer) {
            clearTimeout(state.keyboardBufferTimer);
            state.keyboardBufferTimer = null;
        }
        state.keyboardBuffer = "";
    }

    function activeKeyboardSide() {
        if (state.step === "factorA") return "left";
        if (state.step === "factorB") return "right";
        return null;
    }

    function shouldWaitForMoreDigits(valueText, maxFactor) {
        if (valueText.length !== 1) return false;
        const prefix = parseInt(valueText, 10);
        return prefix > 0 && prefix * 10 <= maxFactor;
    }

    function commitKeyboardBuffer() {
        if (!state.keyboardBuffer) return;
        const value = parseInt(state.keyboardBuffer, 10);
        clearKeyboardBuffer();
        enterKeyboardValue(value);
    }

    function scheduleKeyboardCommit() {
        if (state.keyboardBufferTimer) clearTimeout(state.keyboardBufferTimer);
        state.keyboardBufferTimer = setTimeout(
            commitKeyboardBuffer,
            KEYBOARD_ENTRY_DELAY_MS
        );
    }

    function enterKeyboardValue(value) {
        const side = activeKeyboardSide();
        const maxFactor = LEVELS[state.levelIdx].maxFactor;
        if (!side || value < 1 || value > maxFactor) return;
        onKeyClick(value, side);
    }

    function handleKeyboardDigit(digit) {
        if (state.locked || !activeKeyboardSide()) return;
        if (digit === "0" && !state.keyboardBuffer) return;

        const maxFactor = LEVELS[state.levelIdx].maxFactor;
        const nextBuffer = `${state.keyboardBuffer}${digit}`;
        const nextValue = parseInt(nextBuffer, 10);
        if (nextBuffer.length > 2 || nextValue > maxFactor) return;

        state.keyboardBuffer = nextBuffer;
        if (shouldWaitForMoreDigits(nextBuffer, maxFactor)) {
            scheduleKeyboardCommit();
        } else {
            commitKeyboardBuffer();
        }
    }

    function onKeyboardInput(e) {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        if (e.key === "Backspace" || e.key === "Escape") {
            if (!state.keyboardBuffer) return;
            e.preventDefault();
            clearKeyboardBuffer();
            return;
        }

        if (e.key === "Enter") {
            if (!state.keyboardBuffer) return;
            e.preventDefault();
            commitKeyboardBuffer();
            return;
        }

        if (!/^\d$/.test(e.key)) return;
        if (!activeKeyboardSide()) return;
        e.preventDefault();
        handleKeyboardDigit(e.key);
    }

    // ── Click: keypad number ──────────────────────────────────────────────────

    function onKeyClick(value, side) {
        clearKeyboardBuffer();
        if (state.locked) return;

        if (side === "left") {
            // Factor A is only available after a product has been selected
            if (state.step !== "factorA" && state.step !== "factorB") return;

            if (!state.timerStarted) startTimer();

            // Check whether this value can possibly divide the product evenly
            // and land within the keypad range.
            const maxFactor = LEVELS[state.levelIdx].maxFactor;
            const productVal = state.products[state.selectedProduct].value;
            const otherFactor = productVal / value;
            const isPossible = Number.isInteger(otherFactor) &&
                                otherFactor >= 1 &&
                                otherFactor <= maxFactor;

            if (!isPossible) {
                // Flash the button red and fade; user stays in 'factorA' step
                flashImpossible(value);
                return;
            }

            // Valid Factor A: select it and advance to 'factorB'
            state.leftFactor = value;
            state.step = "factorB";
            refreshKeypad($kpLeft, "left");
            refreshKeypadDim();

        } else {
            // Factor B is only available after both a product and Factor A exist
            if (state.step !== "factorB") return;

            if (!state.timerStarted) startTimer();

            state.rightFactor = value;
            refreshKeypad($kpRight, "right");
            evaluateTurn();
        }
    }

    // ── Evaluate ─────────────────────────────────────────────────────────────

    function evaluateTurn() {
        const pi   = state.selectedProduct;
        const card = state.products[pi];
        const lf   = state.leftFactor;
        const rf   = state.rightFactor;

        state.picks++;
        updatePicks();

        if (lf * rf === card.value) {
            // ── Match ──────────────────────────────────────────────────────
            card.matched = true;
            refreshProduct(pi);

            state.selectedProduct = null;
            state.leftFactor      = null;
            state.rightFactor     = null;
            state.step            = "product";
            refreshKeypad($kpLeft,  "left");
            refreshKeypad($kpRight, "right");
            refreshKeypadDim();

            state.matches++;
            updateScore();
            setStatus(pick(COMPLIMENTS));

            if (state.matches >= state.products.length) {
                const gid = state.gameId;
                setTimeout(() => showWin(gid), 400);
            } else {
                setTimeout(revealNextProduct, 600);
            }

        } else {
            // ── Mismatch ───────────────────────────────────────────────────
            state.locked = true;
            setStatus(pick(BUMMERS));

            setTimeout(() => {
                card.faceUp = false;
                refreshProduct(pi);

                state.selectedProduct = null;
                state.leftFactor      = null;
                state.rightFactor     = null;
                state.step            = "product";
                refreshKeypad($kpLeft,  "left");
                refreshKeypad($kpRight, "right");
                refreshKeypadDim();

                state.locked = false;
                revealNextProduct();
            }, 900);
        }
    }

    // ── Win + level progression ───────────────────────────────────────────────

    function showWin(completedGameId) {
        if (completedGameId !== state.gameId) return;

        const elapsed = stopTimer();
        const prevBest = getBest();
        let bestMsg = "";
        if (prevBest == null || elapsed < prevBest) { setBest(elapsed); bestMsg = " — New best time! 🏆"; }
        const prevBestPicks = getBestPicks();
        let picksMsg = "";
        if (prevBestPicks == null || state.picks < prevBestPicks) { setBestPicks(state.picks); picksMsg = " — Fewest picks! 🎯"; }
        refreshBestDisplay();

        const isLast = state.levelIdx === LEVELS.length - 1;
        $winText.textContent =
            `${isLast ? "You beat all levels! 🏆" : "You Win! 🎉"} ` +
            `(${fmtTime(elapsed)}, ${state.picks} picks)${bestMsg}${picksMsg}`;
        $nextLevel.textContent = isLast ? "Play Again" : "Next Level";
        showWinEffects();
    }

    function advanceLevel() {
        state.levelIdx = (state.levelIdx + 1) % LEVELS.length;
        if (state.levelIdx > state.highestIdx) state.highestIdx = state.levelIdx;
        rebuildLevelOptions();
        saveSettings();
        newGame();
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    function saveSettings() {
        setLS("multiply.level",   state.levelIdx);
        setLS("multiply.highest", state.highestIdx);
    }

    function loadSettings() {
        try {
            const h = getLS("multiply.highest");
            if (h !== null && h >= 0 && h < LEVELS.length)
                state.highestIdx = Math.max(h, INITIAL_UNLOCKED);
            const l = getLS("multiply.level");
            if (l !== null && l >= 0 && l < LEVELS.length)
                state.levelIdx = Math.min(l, state.highestIdx);
        } catch (_) {}
    }

    // ── Wire up ───────────────────────────────────────────────────────────────

    function init() {
        loadSettings();
        rebuildLevelOptions();

        $level.addEventListener("change", () => {
            const n = parseInt($level.value, 10);
            if (isNaN(n) || n > state.highestIdx) { $level.value = String(state.levelIdx); return; }
            state.levelIdx = n;
            saveSettings();
            newGame();
        });

        $newGame.addEventListener("click", () => newGame());
        $nextLevel.addEventListener("click", () => advanceLevel());
        $hintBtn.addEventListener("click", () => showHint());
        document.addEventListener("keydown", onKeyboardInput);

        // Click the dark backdrop (not the box) to dismiss hint early
        $hintOverlay.addEventListener("click", e => {
            if (e.target === $hintOverlay) cancelHint();
        });

        newGame();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
