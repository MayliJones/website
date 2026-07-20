/**
 * Game logic for Quoridor - move your pawn or place a wall each turn,
 * first one to the far side wins.
 * @namespace Quoridor
 * @author Mayli Jones
 * @version 2025/26
 */
/*jslint for*/
const Quoridor = Object.create(null);

/** @memberof Quoridor */
Quoridor.BOARD_SIZE = 9;

/** @memberof Quoridor */
Quoridor.INITIAL_WALLS = 10;

/**
 * Which row a player must reach to win: the far row for player_1, row 0
 * for player_2. Single source of truth for goal-row checks, shared by
 * is_ended, winner, shortest_path_length, and the web app's cell labels.
 * @memberof Quoridor
 * @param {string} player "player_1" or "player_2".
 * @returns {number} the row index that player must reach to win.
 */
Quoridor.goal_row = function (player) {
    return (
        player === "player_1"
        ? Quoridor.BOARD_SIZE - 1
        : 0
    );
};

/**
 * Player 1 starts top-middle [0,4] heading for row 8; player 2 starts
 * bottom-middle [8,4] heading for row 0.
 * @memberof Quoridor
 * @returns {Object} fresh state: starting positions, no walls placed,
 * full wall counts, player_1 to move.
 */
Quoridor.initial_state = function () {
    return Object.freeze({
        current_player: "player_1",
        // wall at [r, c] blocks between row r/r+1, at columns c and c+1
        h_walls: Object.freeze([]),
        positions: Object.freeze({
            player_1: Object.freeze([0, 4]),
            player_2: Object.freeze([8, 4])
        }),
        // wall at [r, c] blocks between col c/c+1, at rows r and r+1
        v_walls: Object.freeze([]),
        wall_counts: Object.freeze({
            player_1: Quoridor.INITIAL_WALLS,
            player_2: Quoridor.INITIAL_WALLS
        })
    });
};

/**
 * Game's over once either pawn reaches the far row (p1 -> row 8, p2 -> row 0).
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @returns {boolean} true once someone's reached their goal row.
 */
Quoridor.is_ended = function (state) {
    return (
        state.positions.player_1[0] === Quoridor.goal_row("player_1") ||
        state.positions.player_2[0] === Quoridor.goal_row("player_2")
    );
};

/**
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @returns {string|undefined} "player_1"/"player_2", or undefined mid-game.
 */
Quoridor.winner = function (state) {
    if (state.positions.player_1[0] === Quoridor.goal_row("player_1")) {
        return "player_1";
    }
    if (state.positions.player_2[0] === Quoridor.goal_row("player_2")) {
        return "player_2";
    }
    return;
};

/**
 * Wall check for one step in direction (dr, dc) from (from_r, from_c).
 * (dr, dc) has to be one of the 4 orthogonal unit vectors, not a jump.
 * Shared by legal_moves, shortest_path_length and ai.js so there's only
 * one place this logic lives.
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @param {number} from_r row moving from.
 * @param {number} from_c column moving from.
 * @param {number} dr row delta of the direction (-1, 0, or 1).
 * @param {number} dc column delta of the direction (-1, 0, or 1).
 * @returns {boolean} true if a wall blocks this step.
 */
Quoridor.is_move_blocked = function (state, from_r, from_c, dr, dc) {
    const has_h = (r, c) => (
        state.h_walls.some((w) => w.at[0] === r && w.at[1] === c)
    );
    const has_v = (r, c) => (
        state.v_walls.some((w) => w.at[0] === r && w.at[1] === c)
    );
    if (dr === -1) {
        return has_h(from_r - 1, from_c) || has_h(from_r - 1, from_c - 1);
    }
    if (dr === 1) {
        return has_h(from_r, from_c) || has_h(from_r, from_c - 1);
    }
    if (dc === -1) {
        return has_v(from_r, from_c - 1) || has_v(from_r - 1, from_c - 1);
    }
    if (dc === 1) {
        return has_v(from_r, from_c) || has_v(from_r - 1, from_c);
    }
    return false;
};

/**
 * Shared by legal_moves and wall_placement_reason: does a wall at (r, c)
 * with this orientation overlap an existing wall, and if not, does placing
 * it still leave both players a path to their goal? Checks overlap first
 * since it's cheap - only runs the path check (two BFS calls) if there's
 * no overlap.
 * @param {Object} state current board/position/wall state.
 * @param {string} orientation "H" or "V".
 * @param {number} r row of the wall's anchor cell.
 * @param {number} c column of the wall's anchor cell.
 * @returns {string} "legal", "overlap", or "blocks_path".
 */
function evaluate_wall(state, orientation, r, c) {
    const has_h = (row, col) => (
        state.h_walls.some((w) => w.at[0] === row && w.at[1] === col)
    );
    const has_v = (row, col) => (
        state.v_walls.some((w) => w.at[0] === row && w.at[1] === col)
    );
    const overlaps = (
        orientation === "H"
        ? has_h(r, c) || has_h(r, c + 1) || has_h(r, c - 1) || has_v(r, c)
        : has_v(r, c) || has_v(r + 1, c) || has_v(r - 1, c) || has_h(r, c)
    );
    if (overlaps) {
        return "overlap";
    }
    const wall_entry = Object.freeze({
        at: Object.freeze([r, c]),
        placed_by: state.current_player
    });
    const sim = Object.freeze({
        h_walls: (
            orientation === "H"
            ? Object.freeze([...state.h_walls, wall_entry])
            : state.h_walls
        ),
        positions: state.positions,
        v_walls: (
            orientation === "V"
            ? Object.freeze([...state.v_walls, wall_entry])
            : state.v_walls
        )
    });
    const both_have_path = (
        Quoridor.has_path(sim, "player_1") && Quoridor.has_path(sim, "player_2")
    );
    if (both_have_path) {
        return "legal";
    }
    return "blocks_path";
}

/**
 * Move objects come in two shapes:
 *   {type: "move", to: [row, col]}
 *   {type: "wall", orientation: "H"|"V", at: [row, col]}
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @returns {Array} every legal move for state.current_player right now.
 */
Quoridor.legal_moves = function (state) {
    const opponent = (
        state.current_player === "player_1"
        ? "player_2"
        : "player_1"
    );
    const [row, col] = state.positions[state.current_player];
    const [opp_row, opp_col] = state.positions[opponent];
    const in_bounds = (r, c) => (
        r >= 0 && r < Quoridor.BOARD_SIZE && c >= 0 && c < Quoridor.BOARD_SIZE
    );
    const is_blocked = (from_r, from_c, dr, dc) => (
        Quoridor.is_move_blocked(state, from_r, from_c, dr, dc)
    );

    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const moves = directions.reduce(function (acc, [dr, dc]) {
        const r = row + dr;
        const c = col + dc;
        if (!in_bounds(r, c) || is_blocked(row, col, dr, dc)) {
            return acc;
        }
        if (r !== opp_row || c !== opp_col) {
            acc.push({to: [r, c], type: "move"});
            return acc;
        }
        const jump_r = r + dr;
        const jump_c = c + dc;
        if (in_bounds(jump_r, jump_c) && !is_blocked(r, c, dr, dc)) {
            acc.push({to: [jump_r, jump_c], type: "move"});
        } else {
            const diagonals = (
                dc === 0
                ? [[r, c - 1], [r, c + 1]]
                : [[r - 1, c], [r + 1, c]]
            );
            diagonals.forEach(function (diag) {
                const diag_dr = diag[0] - r;
                const diag_dc = diag[1] - c;
                const diag_clear = (
                    in_bounds(diag[0], diag[1]) &&
                    (diag[0] !== opp_row || diag[1] !== opp_col) &&
                    !is_blocked(r, c, diag_dr, diag_dc)
                );
                if (diag_clear) {
                    acc.push({to: [diag[0], diag[1]], type: "move"});
                }
            });
        }
        return acc;
    }, []);

    if (state.wall_counts[state.current_player] > 0) {
        let r;
        let c;
        for (r = 0; r <= Quoridor.BOARD_SIZE - 2; r += 1) {
            for (c = 0; c <= Quoridor.BOARD_SIZE - 2; c += 1) {
                if (evaluate_wall(state, "H", r, c) === "legal") {
                    moves.push({at: [r, c], orientation: "H", type: "wall"});
                }
                if (evaluate_wall(state, "V", r, c) === "legal") {
                    moves.push({at: [r, c], orientation: "V", type: "wall"});
                }
            }
        }
    }

    return moves;
};

/**
 * Doesn't touch the state passed in - always returns a new frozen object.
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @param {Object} move one of the move objects from legal_moves.
 * @returns {Object} the resulting state after applying it.
 */
Quoridor.move = function (state, move) {
    const next_player = (
        state.current_player === "player_1"
        ? "player_2"
        : "player_1"
    );
    if (move.type === "move") {
        return Object.freeze({
            current_player: next_player,
            h_walls: state.h_walls,
            positions: Object.freeze({
                player_1: (
                    state.current_player === "player_1"
                    ? Object.freeze(move.to)
                    : state.positions.player_1
                ),
                player_2: (
                    state.current_player === "player_2"
                    ? Object.freeze(move.to)
                    : state.positions.player_2
                )
            }),
            v_walls: state.v_walls,
            wall_counts: state.wall_counts
        });
    }
    if (move.type === "wall") {
        const wall_entry = Object.freeze({
            at: Object.freeze(move.at),
            placed_by: state.current_player
        });
        const new_h_walls = (
            move.orientation === "H"
            ? Object.freeze([...state.h_walls, wall_entry])
            : state.h_walls
        );
        const new_v_walls = (
            move.orientation === "V"
            ? Object.freeze([...state.v_walls, wall_entry])
            : state.v_walls
        );
        return Object.freeze({
            current_player: next_player,
            h_walls: new_h_walls,
            positions: state.positions,
            v_walls: new_v_walls,
            wall_counts: Object.freeze({
                player_1: (
                    state.current_player === "player_1"
                    ? state.wall_counts.player_1 - 1
                    : state.wall_counts.player_1
                ),
                player_2: (
                    state.current_player === "player_2"
                    ? state.wall_counts.player_2 - 1
                    : state.wall_counts.player_2
                )
            })
        });
    }
    return state;
};

/**
 * BFS from the player's pawn, using the same wall-blocking rule as
 * legal_moves. Goal row is 8 for player_1, 0 for player_2.
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @param {string} player "player_1" or "player_2".
 * @returns {number|null} shortest distance to the goal row, or null if
 * walled off completely.
 */
Quoridor.shortest_path_length = function (state, player) {
    const goal_row = Quoridor.goal_row(player);
    const start = state.positions[player];
    const is_blocked = (from_r, from_c, dr, dc) => (
        Quoridor.is_move_blocked(state, from_r, from_c, dr, dc)
    );
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const dist = {};
    dist[start[0] * Quoridor.BOARD_SIZE + start[1]] = 0;
    const queue = [[start[0], start[1]]];
    const explore = function (r, c) {
        directions.forEach(function (dir) {
            const dr = dir[0];
            const dc = dir[1];
            const nr = r + dr;
            const nc = c + dc;
            const key = nr * Quoridor.BOARD_SIZE + nc;
            const reachable = (
                nr >= 0 && nr < Quoridor.BOARD_SIZE &&
                nc >= 0 && nc < Quoridor.BOARD_SIZE &&
                !is_blocked(r, c, dr, dc) &&
                dist[key] === undefined
            );
            if (reachable) {
                dist[key] = dist[r * Quoridor.BOARD_SIZE + c] + 1;
                queue.push([nr, nc]);
            }
        });
    };
    while (queue.length > 0) {
        const [r, c] = queue.shift();
        explore(r, c);
    }
    let min_dist = null;
    let goal_col;
    for (goal_col = 0; goal_col < Quoridor.BOARD_SIZE; goal_col += 1) {
        const d = dist[goal_row * Quoridor.BOARD_SIZE + goal_col];
        if (d !== undefined && (min_dist === null || d < min_dist)) {
            min_dist = d;
        }
    }
    return min_dist;
};

/**
 * Just shortest_path_length !== null - used by legal_moves to reject
 * wall placements that would seal a player in completely.
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @param {string} player "player_1" or "player_2".
 * @returns {boolean} true if that player can still reach their goal row.
 */
Quoridor.has_path = function (state, player) {
    return Quoridor.shortest_path_length(state, player) !== null;
};

/**
 * Whoever's fewer moves from winning - null on a tie. Used for the
 * trophy icon in the side panel, purely cosmetic.
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @returns {string|null} "player_1"/"player_2", or null if tied.
 */
Quoridor.leading_player = function (state) {
    const p1_dist = Quoridor.shortest_path_length(state, "player_1");
    const p2_dist = Quoridor.shortest_path_length(state, "player_2");
    if (p1_dist === null || p2_dist === null) {
        return null;
    }
    if (p1_dist < p2_dist) {
        return "player_1";
    }
    if (p2_dist < p1_dist) {
        return "player_2";
    }
    return null;
};

/**
 * @memberof Quoridor
 * @param {Object} state current board/position/wall state.
 * @param {Object} wall {orientation: "H"|"V", at: [row, col]}.
 * @returns {string} "legal", "overlap", or "blocks_path".
 */
Quoridor.wall_placement_reason = function (state, wall) {
    const [r, c] = wall.at;
    const out_of_bounds = (
        r < 0 || r > Quoridor.BOARD_SIZE - 2 ||
        c < 0 || c > Quoridor.BOARD_SIZE - 2
    );
    if (out_of_bounds) {
        return "overlap";
    }
    return evaluate_wall(state, wall.orientation, r, c);
};

export default Object.freeze(Quoridor);
