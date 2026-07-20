/**
 * Move-picking logic for the computer opponent. Built entirely on
 * Quoridor's own rules (legal_moves, move, is_move_blocked...) rather
 * than reimplementing any of it here.
 * @namespace Ai
 * @author Mayli Jones
 * @version 2025/26
 */
import Quoridor from "./game.js";

const Ai = Object.create(null);

// win/loss score in evaluate_state (loss is -WIN_SCORE). Also doubles as
// the "no path" fallback so that case can't look like a good position.
Ai.WIN_SCORE = 10000;

// per-wall penalty in evaluate_state - a wall only pays off if it costs
// the opponent more distance than this
Ai.WALL_COST = 1.5;

/**
 * Bigger = better for player. Win/loss is +/-WIN_SCORE, otherwise it's
 * opponent's remaining distance minus mine, minus the wall penalty.
 * @param {Object} state
 * @param {string} player "player_1" or "player_2"
 * @returns {number}
 */
Ai.evaluate_state = function (state, player) {
    if (Quoridor.is_ended(state)) {
        return (
            Quoridor.winner(state) === player
            ? Ai.WIN_SCORE
            : -Ai.WIN_SCORE
        );
    }
    const opponent = (
        player === "player_1"
        ? "player_2"
        : "player_1"
    );
    const p_dist = Quoridor.shortest_path_length(state, player);
    const o_dist = Quoridor.shortest_path_length(state, opponent);
    const walls_spent = Quoridor.INITIAL_WALLS - state.wall_counts[player];
    // shouldn't happen in real play, but if either dist is null both map
    // to WIN_SCORE here so the subtraction still comes out the right way
    const o_term = (
        o_dist === null
        ? Ai.WIN_SCORE
        : o_dist
    );
    const p_term = (
        p_dist === null
        ? Ai.WIN_SCORE
        : p_dist
    );
    return o_term - p_term - (walls_spent * Ai.WALL_COST);
};

/**
 * Minimax + alpha-beta. Walls are only considered at the root move - any
 * deeper than that it's pawn moves only, otherwise the branching factor
 * gets out of hand.-
 * @param {Object} state - state.current_player must be player
 * @param {string} player "player_1" or "player_2"
 * @param {number} depth plies to search (1 = just look at my own move)
 * @returns {Object} the move to play
 */
Ai.choose_ai_move = function (state, player, depth) {
    // pawn moves only, skips legal_moves' (slow) wall-legality checks -
    // too expensive to run at every node of the search
    const pawn_moves = function (s) {
        const cur = s.current_player;
        const opp = (
            cur === "player_1"
            ? "player_2"
            : "player_1"
        );
        const [row, col] = s.positions[cur];
        const [opp_row, opp_col] = s.positions[opp];
        const in_bounds = (r, c) => (
            r >= 0 && r < Quoridor.BOARD_SIZE &&
            c >= 0 && c < Quoridor.BOARD_SIZE
        );
        const result = [];
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (dir) {
            const dr = dir[0];
            const dc = dir[1];
            const r = row + dr;
            const c = col + dc;
            const step_blocked = Quoridor.is_move_blocked(s, row, col, dr, dc);
            if (!in_bounds(r, c) || step_blocked) {
                return;
            }
            if (r !== opp_row || c !== opp_col) {
                result.push({to: [r, c], type: "move"});
                return;
            }
            const jr = r + dr;
            const jc = c + dc;
            const jump_blocked = Quoridor.is_move_blocked(s, r, c, dr, dc);
            if (in_bounds(jr, jc) && !jump_blocked) {
                result.push({to: [jr, jc], type: "move"});
            } else {
                const diagonals = (
                    (dc === 0)
                    ? [[r, c - 1], [r, c + 1]]
                    : [[r - 1, c], [r + 1, c]]
                );
                diagonals.forEach(function (diag) {
                    const diag_dr = diag[0] - r;
                    const diag_dc = diag[1] - c;
                    const diag_blocked = Quoridor.is_move_blocked(
                        s,
                        r,
                        c,
                        diag_dr,
                        diag_dc
                    );
                    const diag_clear = (
                        in_bounds(diag[0], diag[1]) &&
                        (diag[0] !== opp_row || diag[1] !== opp_col) &&
                        !diag_blocked
                    );
                    if (diag_clear) {
                        result.push({to: [diag[0], diag[1]], type: "move"});
                    }
                });
            }
        });
        return result;
    };

    // maximizing = true means it's player's own turn at this node
    const minimax = function (s, d, alpha, beta, maximizing) {
        if (Quoridor.is_ended(s) || d <= 0) {
            return Ai.evaluate_state(s, player);
        }
        const moves = pawn_moves(s);
        if (moves.length === 0) {
            return Ai.evaluate_state(s, player);
        }
        let best = (
            maximizing
            ? -Infinity
            : Infinity
        );
        let i = 0;
        while (i < moves.length) {
            const score = minimax(
                Quoridor.move(s, moves[i]),
                d - 1,
                alpha,
                beta,
                !maximizing
            );
            if (maximizing) {
                if (score > best) {
                    best = score;
                }
                if (best > alpha) {
                    alpha = best;
                }
            } else {
                if (score < best) {
                    best = score;
                }
                if (best < beta) {
                    beta = best;
                }
            }
            if (beta <= alpha) {
                break;
            }
            i += 1;
        }
        return best;
    };

    const root_moves = Quoridor.legal_moves(state);
    let best_move = root_moves[0];
    let best_score = -Infinity;
    let root_alpha = -Infinity;
    root_moves.forEach(function (move) {
        const score = minimax(
            Quoridor.move(state, move),
            depth - 1,
            root_alpha,
            Infinity,
            false
        );
        if (score > best_score) {
            best_score = score;
            best_move = move;
            root_alpha = best_score;
        }
    });
    return best_move;
};

export default Object.freeze(Ai);
