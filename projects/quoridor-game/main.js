/*jslint browser, for*/
import Quoridor from "./game.js";
import Ai from "./ai.js";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const status_el = document.getElementById("status");
const status_underline_el = document.getElementById("status-underline");
const wall_error_el = document.getElementById("wall-error");
const live_region_el = document.getElementById("live-region");
const board_grid_el = document.getElementById("board-grid");

let CELL_SIZE = 0;
let GAP_SIZE = 0;


const MOBILE_BREAKPOINT = 600;
const PANEL_WIDTH = 160;
const CONTAINER_GAP = 20;
const SIDE_RESERVE = 2 * PANEL_WIDTH + 2 * CONTAINER_GAP;
const FALLBACK_BOARD_SIZE = 600;
const MIN_BOARD_SIZE = 200;

// row/col index -> pixel offset, accounting for the gap between cells
function to_pixel(index) {
    return index * (CELL_SIZE + GAP_SIZE);
}

// keyboard-accessible overlay: one focusable div per board cell, kept in
// sync with CELL_SIZE/GAP_SIZE by position_grid_cells()
const grid_cells = Array.from(
    board_grid_el.querySelectorAll("[role=gridcell]")
);
const grid_cells_by_pos = grid_cells.reduce(function (acc, cell) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    acc[row] = acc[row] || [];
    acc[row][col] = cell;
    return acc;
}, []);

// roving tabindex: only the cell at (roving_row, roving_col) is tabbable
let roving_row = -1;
let roving_col = -1;

function set_roving_cell(row, col) {
    if (roving_row !== -1) {
        grid_cells_by_pos[roving_row][roving_col].tabIndex = -1;
    }
    roving_row = row;
    roving_col = col;
    grid_cells_by_pos[roving_row][roving_col].tabIndex = 0;
}

function position_grid_cells() {
    grid_cells.forEach(function (cell) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        cell.style.top = to_pixel(row) + "px";
        cell.style.left = to_pixel(col) + "px";
        cell.style.width = CELL_SIZE + "px";
        cell.style.height = CELL_SIZE + "px";
    });
}

// sizes the (always square) board to match the full rendered height of a
// side panel column - from the top of the player panel down to and
// including the bottom edge of its "Back to Main Menu"/"Restart" button -
// so the board's top/bottom edges line up with the panel's. Capped by
// how much width is actually available so the row never overflows the
// viewport. Re-run on every resize (see the debounced listener below) so
// it stays correct if the panel's rendered height or the viewport changes.
function recalculate_sizes() {
    const is_stacked = window.matchMedia(
        `(max-width: ${MOBILE_BREAKPOINT}px)`
    ).matches;
    let board_size;
    if (is_stacked) {
        // panels stack above/below the board rather than flanking it, so
        // there's no panel height to match - just use the viewport width
        board_size = window.innerWidth - 32;
    } else {
        const panel_column_el = document.querySelector(".panel-column");
        const panel_height = panel_column_el.getBoundingClientRect().height;
        const max_width_for_board = window.innerWidth - SIDE_RESERVE;
        board_size = Math.min(
            panel_height || FALLBACK_BOARD_SIZE,
            max_width_for_board
        );
    }
    board_size = Math.max(MIN_BOARD_SIZE, board_size);
    CELL_SIZE = (
        board_size / (Quoridor.BOARD_SIZE + (Quoridor.BOARD_SIZE - 1) * 0.15)
    );
    GAP_SIZE = CELL_SIZE * 0.15;
    canvas.width = board_size;
    canvas.height = board_size;
    position_grid_cells();
}

recalculate_sizes();

const PLAYER_NAMES = {
    player_1: "Blue Hexagon",
    player_2: "Orange Triangle"
};

let state = Quoridor.initial_state();
set_roving_cell(state.positions.player_1[0], state.positions.player_1[1]);
// mode is "move", or "wall_horizontal"/"wall_vertical" while placing one
let mode = "move";
let pawn_selected = false;
let wall_preview = null;
let wall_error_timer = null;
let game_mode = null;
let ai_difficulty = 3;
const AI_PLAYER = "player_2";
let ai_thinking = false;

const start_screen_el = document.getElementById("start-screen");
const game_container_el = document.getElementById("game-container");
const btn_friend_el = document.getElementById("btn-friend");
const btn_ai_el = document.getElementById("btn-ai");
const btn_start_el = document.getElementById("btn-start");
const difficulty_section_el = document.getElementById("difficulty-section");
const btn_easy_el = document.getElementById("btn-easy");
const btn_hard_el = document.getElementById("btn-hard");
const btn_impossible_el = document.getElementById("btn-impossible");
const game_over_screen_el = document.getElementById("game-over-screen");
const winner_message_el = document.getElementById("winner-message");
const winner_shape_el = document.getElementById("winner-shape");
const btn_play_again_el = document.getElementById("btn-play-again");
const btn_rules_el = document.getElementById("btn-rules");
const rules_modal_el = document.getElementById("rules-modal");
const btn_close_rules_el = document.getElementById("btn-close-rules");

const CELL_DIRECTIONS = [
    {dc: 0, dr: -1, name: "up"},
    {dc: 0, dr: 1, name: "down"},
    {dc: -1, dr: 0, name: "left"},
    {dc: 1, dr: 0, name: "right"}
];

// "a, b and c" - the usual natural-language way to read off a short list
function join_with_and(words) {
    if (words.length <= 1) {
        return words.join("");
    }
    return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
}

// which of the 4 directions from (row, col) a wall blocks, in plain words -
// reuses Quoridor.is_move_blocked, the same check legal_moves and
// shortest_path_length use, so this can never disagree with actual play.
function blocked_directions_text(row, col) {
    const blocked = CELL_DIRECTIONS.filter(
        (dir) => Quoridor.is_move_blocked(state, row, col, dir.dr, dir.dc)
    ).map((dir) => dir.name);
    if (blocked.length === 0) {
        return "";
    }
    return `wall blocking movement ${join_with_and(blocked)}`;
}

// describes one cell for a screen reader: its row/column (matching the
// game's own 0-indexed positions), whether it's a goal row, whichever
// pawn (if any) is standing there, and any adjacent wall.
function cell_aria_label(row, col) {
    const parts = [`Row ${row}, column ${col}`];
    if (row === Quoridor.goal_row("player_2")) {
        parts.push(`goal row for ${PLAYER_NAMES.player_2}`);
    } else if (row === Quoridor.goal_row("player_1")) {
        parts.push(`goal row for ${PLAYER_NAMES.player_1}`);
    }
    const p1 = state.positions.player_1;
    const p2 = state.positions.player_2;
    if (p1[0] === row && p1[1] === col) {
        parts.push(PLAYER_NAMES.player_1);
    } else if (p2[0] === row && p2[1] === col) {
        parts.push(PLAYER_NAMES.player_2);
    } else {
        parts.push("empty");
    }
    const wall_text = blocked_directions_text(row, col);
    if (wall_text) {
        parts.push(wall_text);
    }
    return parts.join(", ");
}

// keeps every grid cell's aria-label in sync with the current board -
// called on every render() so it never drifts from what's on screen.
function update_grid_labels() {
    grid_cells.forEach(function (cell) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        cell.setAttribute("aria-label", cell_aria_label(row, col));
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const legal_key = (to) => to[0] + "," + to[1];
    const pawn_moves = Quoridor.legal_moves(state).filter(
        (m) => m.type === "move"
    );
    const legal_destinations = (
        pawn_selected
        ? new Set(pawn_moves.map((m) => legal_key(m.to)))
        : new Set()
    );

    let row;
    let col;
    for (row = 0; row < Quoridor.BOARD_SIZE; row += 1) {
        for (col = 0; col < Quoridor.BOARD_SIZE; col += 1) {
            const is_legal = legal_destinations.has(legal_key([row, col]));
            if (is_legal) {
                ctx.fillStyle = (
                    state.current_player === "player_1"
                    ? "#2F6AB5"
                    : "#CA4B0C"
                );
            } else if (row === 0) {
                ctx.fillStyle = "#B8CCE4";
            } else if (row === Quoridor.BOARD_SIZE - 1) {
                ctx.fillStyle = "#EDC1AA";
            } else {
                ctx.fillStyle = "#F4F4F2";
            }
            ctx.fillRect(to_pixel(col), to_pixel(row), CELL_SIZE, CELL_SIZE);
        }
    }
    state.h_walls.forEach(function (wall) {
        const [r, c] = wall.at;
        ctx.fillStyle = (
            wall.placed_by === "player_1"
            ? "#2F6AB5"
            : "#CA4B0C"
        );
        ctx.fillRect(
            to_pixel(c),
            to_pixel(r) + CELL_SIZE,
            CELL_SIZE * 2 + GAP_SIZE,
            GAP_SIZE
        );
    });
    state.v_walls.forEach(function (wall) {
        const [r, c] = wall.at;
        ctx.fillStyle = (
            wall.placed_by === "player_1"
            ? "#2F6AB5"
            : "#CA4B0C"
        );
        ctx.fillRect(
            to_pixel(c) + CELL_SIZE,
            to_pixel(r),
            GAP_SIZE,
            CELL_SIZE * 2 + GAP_SIZE
        );
    });
    if (wall_preview) {
        const [r, c] = wall_preview.at;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = (
            wall_preview.is_legal
            ? (
                state.current_player === "player_1"
                ? "#2F6AB5"
                : "#CA4B0C"
            )
            : "#cc3333"
        );
        if (wall_preview.orientation === "H") {
            ctx.fillRect(
                to_pixel(c),
                to_pixel(r) + CELL_SIZE,
                CELL_SIZE * 2 + GAP_SIZE,
                GAP_SIZE
            );
        } else {
            ctx.fillRect(
                to_pixel(c) + CELL_SIZE,
                to_pixel(r),
                GAP_SIZE,
                CELL_SIZE * 2 + GAP_SIZE
            );
        }
        ctx.globalAlpha = 1;
    }
    const radius = CELL_SIZE * 0.38;

    const p1 = state.positions.player_1;
    const p1x = to_pixel(p1[1]) + CELL_SIZE / 2;
    const p1y = to_pixel(p1[0]) + CELL_SIZE / 2;
    ctx.beginPath();
    let hex_i;
    for (hex_i = 0; hex_i < 6; hex_i += 1) {
        const angle = (Math.PI / 180) * (60 * hex_i - 30);
        const px = p1x + radius * Math.cos(angle);
        const py = p1y + radius * Math.sin(angle);
        if (hex_i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.closePath();
    ctx.fillStyle = "#2F6AB5";
    ctx.fill();

    const p2 = state.positions.player_2;
    const p2x = to_pixel(p2[1]) + CELL_SIZE / 2;
    const p2y = to_pixel(p2[0]) + CELL_SIZE / 2;
    ctx.beginPath();
    ctx.moveTo(p2x, p2y - radius);
    ctx.lineTo(
        p2x + radius * Math.sin((Math.PI * 2) / 3),
        p2y - radius * Math.cos((Math.PI * 2) / 3)
    );
    ctx.lineTo(
        p2x + radius * Math.sin((Math.PI * 4) / 3),
        p2y - radius * Math.cos((Math.PI * 4) / 3)
    );
    ctx.closePath();
    ctx.fillStyle = "#CA4B0C";
    ctx.fill();

    if (Quoridor.is_ended(state)) {
        const winner_name = PLAYER_NAMES[Quoridor.winner(state)];
        status_el.textContent = `Game over! Winner: ${winner_name}`;
    } else {
        const current_name = PLAYER_NAMES[state.current_player];
        status_el.textContent = `Current player: ${current_name}`;
    }
    update_grid_labels();
}

// computes and shows the wall preview at (row, col) for the current mode.
// shared by mouse hover, keyboard navigation, and click/Enter confirmation,
// so there's one place that decides what a wall placement here would do.
function update_wall_preview(row, col) {
    const wall_orient = (
        mode === "wall_horizontal"
        ? "H"
        : "V"
    );
    const reason = Quoridor.wall_placement_reason(state, {
        at: [row, col],
        orientation: wall_orient
    });
    wall_preview = {
        at: [row, col],
        is_legal: reason === "legal",
        orientation: wall_orient,
        reason
    };
    render();
}

// like update_wall_preview, but for passive hover/navigation rather than a
// deliberate click/Enter: suppresses the preview when sitting right on top
// of your own pawn, since that position is ambiguous until you commit.
function update_wall_preview_hover(row, col) {
    const pawn = state.positions[state.current_player];
    if (row === pawn[0] && col === pawn[1]) {
        wall_preview = null;
        render();
        return;
    }
    update_wall_preview(row, col);
}

// board-grid gets a "wall-mode" class while placing a wall, so CSS can
// hide the per-cell focus square: the wall bar is the only highlight that
// should be visible then, not the cell it happens to be anchored to.
function sync_grid_mode_class() {
    board_grid_el.classList.toggle("wall-mode", mode !== "move");
}

// a wall's [row, col] anchor needs a next cell to its right/below to span,
// so it can never sit on the last row/column - clamp tighter than the
// full board range used for pawn navigation, or the preview bar would
// hang off the edge of the board.
function clamp_wall_index(value) {
    return Math.min(value, Quoridor.BOARD_SIZE - 2);
}

// switches interaction mode, keeping wall_preview in sync: a live preview
// at the current roving position when entering a wall mode, cleared
// otherwise. Callers still call render_panel() themselves afterward.
function enter_mode(new_mode) {
    mode = new_mode;
    pawn_selected = false;
    sync_grid_mode_class();
    if (mode === "wall_horizontal" || mode === "wall_vertical") {
        const row = clamp_wall_index(roving_row);
        const col = clamp_wall_index(roving_col);
        set_roving_cell(row, col);
        grid_cells_by_pos[row][col].focus();
        update_wall_preview_hover(row, col);
    } else {
        wall_preview = null;
        render();
    }
}

function show_game_over() {
    const winner = Quoridor.winner(state);
    const is_p1 = winner === "player_1";
    const color = (
        is_p1
        ? "#2F6AB5"
        : "#CA4B0C"
    );
    const winner_shape_name = (
        is_p1
        ? "Blue Hexagon"
        : "Orange Triangle"
    );
    const winner_text = winner_shape_name + " Wins!";
    winner_message_el.textContent = winner_text;
    winner_message_el.style.color = color;
    live_region_el.textContent = winner_text;
    const wctx = winner_shape_el.getContext("2d");
    const cx = 50;
    const cy = 50;
    const r = 38;
    wctx.clearRect(0, 0, 100, 100);
    wctx.fillStyle = color;
    wctx.beginPath();
    if (is_p1) {
        let hex_i;
        for (hex_i = 0; hex_i < 6; hex_i += 1) {
            const angle = (Math.PI / 180) * (60 * hex_i - 30);
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (hex_i === 0) {
                wctx.moveTo(px, py);
            } else {
                wctx.lineTo(px, py);
            }
        }
    } else {
        wctx.moveTo(cx, cy - r);
        wctx.lineTo(
            cx + r * Math.sin((Math.PI * 2) / 3),
            cy - r * Math.cos((Math.PI * 2) / 3)
        );
        wctx.lineTo(
            cx + r * Math.sin((Math.PI * 4) / 3),
            cy - r * Math.cos((Math.PI * 4) / 3)
        );
    }
    wctx.closePath();
    wctx.fill();
    game_over_screen_el.showModal();
}

function render_panel() {
    const p1_dist = Quoridor.shortest_path_length(state, "player_1");
    const p2_dist = Quoridor.shortest_path_length(state, "player_2");
    const trophy_player = Quoridor.leading_player(state);
    const players = [
        {color: "#2F6AB5", key: "player_1", panel_id: "player1-panel"},
        {color: "#CA4B0C", key: "player_2", panel_id: "player2-panel"}
    ];

    players.forEach(function ({color, key, panel_id}) {
        const is_active = state.current_player === key;
        const walls = state.wall_counts[key];
        const dist = (
            key === "player_1"
            ? p1_dist
            : p2_dist
        );
        const show_trophy = trophy_player === key;
        const panel = document.getElementById(panel_id);
        panel.classList.toggle("active", is_active);
        const h_id = `${key}-h-wall-btn`;
        const v_id = `${key}-v-wall-btn`;
        const btn_disabled = (
            (is_active && walls > 0)
            ? ""
            : "disabled"
        );
        const h_active = (
            (is_active && mode === "wall_horizontal")
            ? " active-mode"
            : ""
        );
        const v_active = (
            (is_active && mode === "wall_vertical")
            ? " active-mode"
            : ""
        );
        const moves_to_win_number = (
            dist !== null
            ? dist
            : ""
        );
        const moves_to_win_label = (
            dist !== null
            ? "Moves to Win"
            : ""
        );
        const trophy_class = (
            show_trophy
            ? " visible"
            : ""
        );
        const trophy_icon = (
            key === "player_1"
            ? "blue_trophy"
            : "orange_trophy"
        );
        panel.innerHTML = `
            <canvas
                id="${key}-shape" width="124" height="124"
                class="player-shape-canvas"
            ></canvas>
            <p class="wall-count-number">${walls}</p>
            <p class="wall-count-label">Walls Remaining</p>
            <div class="wall-btn-group">
                <button
                    id="${h_id}" class="wall-h-btn${h_active}" ${btn_disabled}
                >
                    <span class="wall-icon"></span>Horizontal
                </button>
                <button
                    id="${v_id}" class="wall-v-btn${v_active}" ${btn_disabled}
                >
                    <span class="wall-icon"></span>Vertical
                </button>
            </div>
            <p class="moves-to-win-number">${moves_to_win_number}</p>
            <p class="moves-to-win-label">${moves_to_win_label}</p>
            <img
                class="trophy-icon${trophy_class}"
                src="assets/${trophy_icon}.svg"
                alt="Leading"
            />
        `;
        const shape_canvas = document.getElementById(`${key}-shape`);
        const sctx = shape_canvas.getContext("2d");
        const cx = 62;
        const cy = 62;
        const r = 48;
        sctx.fillStyle = color;
        sctx.beginPath();
        if (key === "player_1") {
            let hex_i;
            for (hex_i = 0; hex_i < 6; hex_i += 1) {
                const angle = (Math.PI / 180) * (60 * hex_i - 30);
                const px = cx + r * Math.cos(angle);
                const py = cy + r * Math.sin(angle);
                if (hex_i === 0) {
                    sctx.moveTo(px, py);
                } else {
                    sctx.lineTo(px, py);
                }
            }
        } else {
            sctx.moveTo(cx, cy - r);
            sctx.lineTo(
                cx + r * Math.sin((Math.PI * 2) / 3),
                cy - r * Math.cos((Math.PI * 2) / 3)
            );
            sctx.lineTo(
                cx + r * Math.sin((Math.PI * 4) / 3),
                cy - r * Math.cos((Math.PI * 4) / 3)
            );
        }
        sctx.closePath();
        sctx.fill();
        if (is_active && walls > 0) {
            const h_button = document.getElementById(h_id);
            const v_button = document.getElementById(v_id);
            h_button.addEventListener("click", function () {
                enter_mode(
                    mode === "wall_horizontal"
                    ? "move"
                    : "wall_horizontal"
                );
                render_panel();
            });
            v_button.addEventListener("click", function () {
                enter_mode(
                    mode === "wall_vertical"
                    ? "move"
                    : "wall_vertical"
                );
                render_panel();
            });
        }
    });
}

// shows the "can't place here" message, hides it again after 2.5s
function show_wall_error(reason) {
    const message = (
        reason === "overlap"
        ? "A wall already exists there"
        : "Wall cannot be placed there, it would block a player's path"
    );
    wall_error_el.textContent = message;
    live_region_el.textContent = message;
    clearTimeout(wall_error_timer);
    wall_error_el.classList.add("visible");
    wall_error_timer = setTimeout(function () {
        wall_error_el.classList.remove("visible");
    }, 2500);
}

// applies action, then if it's now the AI's turn, waits 500ms (so the
// move doesn't feel instant) and asks it what to play
function handle_action(action) {
    if (Quoridor.is_ended(state)) {
        return;
    }
    state = Quoridor.move(state, action);
    enter_mode("move");
    render_panel();
    if (Quoridor.is_ended(state)) {
        show_game_over();
        return;
    }
    live_region_el.textContent = `${PLAYER_NAMES[state.current_player]}'s turn`;
    if (game_mode === "ai" && state.current_player === AI_PLAYER) {
        ai_thinking = true;
        setTimeout(function () {
            ai_thinking = false;
            handle_action(
                Ai.choose_ai_move(state, AI_PLAYER, ai_difficulty)
            );
        }, 500);
    }
}

// shared by mouse clicks and keyboard (Enter/Space on a focused grid cell).
// in_cell is a mouse-only precision check (was the click exactly on the
// pawn's cell, not just nearby); keyboard selection is always exact, so
// callers pass true for that.
function handle_cell_action(row, col, in_cell) {
    if (ai_thinking) {
        return;
    }
    const pawn = state.positions[state.current_player];
    if (row === pawn[0] && col === pawn[1]) {
        if (mode === "move" || in_cell) {
            mode = "move";
            wall_preview = null;
            sync_grid_mode_class();
            pawn_selected = !pawn_selected;
            render();
            render_panel();
            return;
        }
    }
    if (mode !== "move") {
        const wall_orient = (
            mode === "wall_horizontal"
            ? "H"
            : "V"
        );
        const already_previewed = (
            wall_preview &&
            wall_preview.at[0] === row && wall_preview.at[1] === col &&
            wall_preview.orientation === wall_orient
        );
        if (already_previewed) {
            if (wall_preview.is_legal) {
                handle_action({
                    at: [row, col],
                    orientation: wall_orient,
                    type: "wall"
                });
            } else {
                show_wall_error(wall_preview.reason);
            }
        } else {
            update_wall_preview(row, col);
        }
        return;
    }
    if (pawn_selected) {
        const moves = Quoridor.legal_moves(state);
        const match = moves.find(
            (m) => m.type === "move" && m.to[0] === row && m.to[1] === col
        );
        if (match) {
            handle_action(match);
            return;
        }
    }
    enter_mode("move");
    render_panel();
}

btn_friend_el.addEventListener("click", function () {
    game_mode = "friend";
    btn_friend_el.classList.add("selected");
    btn_ai_el.classList.remove("selected");
    difficulty_section_el.classList.remove("visible");
    btn_start_el.disabled = false;
});

btn_ai_el.addEventListener("click", function () {
    game_mode = "ai";
    btn_ai_el.classList.add("selected");
    btn_friend_el.classList.remove("selected");
    difficulty_section_el.classList.add("visible");
    btn_start_el.disabled = false;
});

const DIFFICULTY_BUTTONS = [
    {depth: 1, el: btn_easy_el},
    {depth: 3, el: btn_hard_el},
    {depth: 5, el: btn_impossible_el}
];

DIFFICULTY_BUTTONS.forEach(function ({depth, el}) {
    el.addEventListener("click", function () {
        ai_difficulty = depth;
        DIFFICULTY_BUTTONS.forEach(function (other) {
            other.el.classList.toggle("selected", other.el === el);
        });
    });
});

btn_start_el.addEventListener("click", function () {
    start_screen_el.style.display = "none";
    game_container_el.style.display = "flex";
    status_el.style.display = "";
    status_underline_el.style.display = "";
    render_panel();
    recalculate_sizes();
    render();
});

// <dialog>.showModal() closes on Escape for free, but its native Tab
// trapping turned out unreliable with only one focusable descendant (the
// close button) - Chromium sometimes hands focus to <body> instead of
// wrapping back around. Trapped explicitly here instead, shared by every
// <dialog> in the app.
const MODAL_FOCUSABLE = (
    "button, [href], input, select, textarea, [tabindex]"
);

function trap_modal_focus(modal_el, event) {
    if (event.key !== "Tab") {
        return;
    }
    const focusable = modal_el.querySelectorAll(MODAL_FOCUSABLE);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

// tracks which button opened the rules dialog, so focus can return there
// on close.
let rules_opener_el = null;

btn_rules_el.addEventListener("click", function () {
    rules_opener_el = btn_rules_el;
    rules_modal_el.showModal();
});

btn_close_rules_el.addEventListener("click", function () {
    rules_modal_el.close();
});

rules_modal_el.addEventListener("keydown", function (event) {
    trap_modal_focus(rules_modal_el, event);
});

rules_modal_el.addEventListener("close", function () {
    if (rules_opener_el) {
        rules_opener_el.focus();
        rules_opener_el = null;
    }
});

game_over_screen_el.addEventListener("keydown", function (event) {
    trap_modal_focus(game_over_screen_el, event);
});

// closing the game-over dialog (via "Play Again" or Escape) always lands
// back on the start screen, so the reset lives here rather than only on
// the button click - matching the rules dialog's close-driven pattern.
game_over_screen_el.addEventListener("close", function () {
    state = Quoridor.initial_state();
    set_roving_cell(state.positions.player_1[0], state.positions.player_1[1]);
    mode = "move";
    pawn_selected = false;
    wall_preview = null;
    sync_grid_mode_class();
    game_mode = null;
    btn_friend_el.classList.remove("selected");
    btn_ai_el.classList.remove("selected");
    btn_start_el.disabled = true;
    difficulty_section_el.classList.remove("visible");
    game_container_el.style.display = "none";
    status_el.style.display = "none";
    status_underline_el.style.display = "none";
    start_screen_el.style.display = "flex";
});

btn_play_again_el.addEventListener("click", function () {
    game_over_screen_el.close();
});

document.getElementById("btn-back-menu").addEventListener("click", function () {
    state = Quoridor.initial_state();
    set_roving_cell(state.positions.player_1[0], state.positions.player_1[1]);
    mode = "move";
    pawn_selected = false;
    wall_preview = null;
    sync_grid_mode_class();
    game_mode = null;
    btn_friend_el.classList.remove("selected");
    btn_ai_el.classList.remove("selected");
    btn_start_el.disabled = true;
    difficulty_section_el.classList.remove("visible");
    game_container_el.style.display = "none";
    status_el.style.display = "none";
    status_underline_el.style.display = "none";
    start_screen_el.style.display = "flex";
});

document.getElementById("btn-restart").addEventListener("click", function () {
    state = Quoridor.initial_state();
    set_roving_cell(state.positions.player_1[0], state.positions.player_1[1]);
    mode = "move";
    pawn_selected = false;
    wall_preview = null;
    sync_grid_mode_class();
    render();
    render_panel();
});

canvas.addEventListener("click", function (event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / (CELL_SIZE + GAP_SIZE));
    const row = Math.floor(y / (CELL_SIZE + GAP_SIZE));
    const in_cell = (
        x >= to_pixel(col) && x < to_pixel(col) + CELL_SIZE &&
        y >= to_pixel(row) && y < to_pixel(row) + CELL_SIZE
    );
    handle_cell_action(row, col, in_cell);
});

canvas.addEventListener("mousemove", function (event) {
    if (mode === "move" || ai_thinking) {
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / (CELL_SIZE + GAP_SIZE));
    const row = Math.floor(y / (CELL_SIZE + GAP_SIZE));
    update_wall_preview_hover(row, col);
});

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

// moves the roving tabindex cell one step, clamped to the board edges.
// In a wall mode the usable range is one cell tighter (see clamp_wall_index)
// so the preview bar can never hang off the board.
function move_roving_focus(key) {
    const in_wall_mode = mode === "wall_horizontal" || mode === "wall_vertical";
    const max_index = (
        in_wall_mode
        ? Quoridor.BOARD_SIZE - 2
        : Quoridor.BOARD_SIZE - 1
    );
    let row = Math.min(roving_row, max_index);
    let col = Math.min(roving_col, max_index);
    if (key === "ArrowUp") {
        row = Math.max(0, row - 1);
    } else if (key === "ArrowDown") {
        row = Math.min(max_index, row + 1);
    } else if (key === "ArrowLeft") {
        col = Math.max(0, col - 1);
    } else {
        col = Math.min(max_index, col + 1);
    }
    set_roving_cell(row, col);
    grid_cells_by_pos[row][col].focus();
    if (in_wall_mode) {
        update_wall_preview_hover(row, col);
    }
}

document.addEventListener("keydown", function (event) {
    // arrow keys always drive the board cursor - no need to Tab onto the
    // invisible grid first, so switching mode with H/V/R and immediately
    // arrowing around works right away.
    if (ARROW_KEYS.includes(event.key)) {
        event.preventDefault();
        move_roving_focus(event.key);
        return;
    }
    // Enter/Space act on the board cursor too, unless a real button (like
    // the H/V wall buttons) currently has focus - then let it handle its
    // own click natively instead of double-firing.
    const on_button = document.activeElement.tagName === "BUTTON";
    if (!on_button && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        handle_cell_action(roving_row, roving_col, true);
        return;
    }
    if (ai_thinking) {
        return;
    }
    const key = event.key;
    if (key === "r" || key === "R") {
        if (mode === "wall_horizontal") {
            enter_mode("wall_vertical");
            render_panel();
        } else if (mode === "wall_vertical") {
            enter_mode("wall_horizontal");
            render_panel();
        }
    } else if (key === "h" || key === "H") {
        if (state.wall_counts[state.current_player] > 0) {
            enter_mode(
                mode === "wall_horizontal"
                ? "move"
                : "wall_horizontal"
            );
            render_panel();
        }
    } else if (key === "v" || key === "V") {
        if (state.wall_counts[state.current_player] > 0) {
            enter_mode(
                mode === "wall_vertical"
                ? "move"
                : "wall_vertical"
            );
            render_panel();
        }
    } else if (key === "Escape") {
        enter_mode("move");
        render_panel();
    }
});

// debounced so dragging a window edge doesn't thrash layout/canvas work
// on every intermediate size
let resize_timer = null;
window.addEventListener("resize", function () {
    clearTimeout(resize_timer);
    resize_timer = setTimeout(function () {
        recalculate_sizes();
        render();
    }, 150);
});

render();
render_panel();
