// =========================================================
// === 1. GAME STATE & SETUP ===============================
// =========================================================

const BOARD_SIZE = 8;
let selectedSquare = null; 
let currentPlayer = 'White'; 
let isBoardFlip = false;
let gameResultStatus = '*'; // Default: ongoing. Can be "1-0", "0-1", or "1/2-1/2".
let positionHistory = {}; // Key: FEN string, Value: Number of occurrences

// Stores { start, end } of the last move make by last player
let lastMove = { start: null, end: null };
// Stores {r: row, c: col} of the square behind the pawn that just moved two steps, or null.
let enPassantTarget = null;
// const isEnPassant = null;

// --- Modal Dialog ---
let gameOverModal;
let gameOverHeader;
let gameOverMessage;
let newGameButton;
let closeGameOverDialog;
let promotionModal;
const PROMOTION_PIECES = [
    { type: 'Queen', symbol: '&#9813;' },
    { type: 'Rook', symbol: '&#9814;' },
    { type: 'Bishop', symbol: '&#9815;' },
    { type: 'Knight', symbol: '&#9816;' }
];

// --- Castling Flags (Updated by executeMove) ---
let canWhiteKingCastle = true;
let canWhiteRookKCastle = true; // Kingside (h1)
let canWhiteRookQCastle = true; // Queenside (a1)
let canBlackKingCastle = true;
let canBlackRookKCastle = true; // Kingside (h8)
let canBlackRookQCastle = true; // Queenside (a8)

// --- Store Moves and Notations ---
let gameMovesHistory = []; // Stores moves as objects: {move: 'e2e4', isCapture: false, promotion: null, isCastling: null}

// --- Coordinate Conversion Helper (SECTION 2 or 6) ---

// Converts 0-indexed row/col to algebraic notation (e.g., {r: 7, c: 4} -> 'e1')
function coordsToAlgebraic(r, c) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    return files[c] + ranks[r];
}

const PIECE_SYMBOLS = {
    White: { Pawn: '&#9817;', Rook: '&#9814;', Knight: '&#9816;', Bishop: '&#9815;', Queen: '&#9813;', King: '&#9812;' },
    Black: { Pawn: '&#9823;', Rook: '&#9820;', Knight: '&#9822;', Bishop: '&#9821;', Queen: '&#9819;', King: '&#9818;' }
};

const createPawnRow = (color) => Array(BOARD_SIZE).fill(null).map(() => ({ type: 'Pawn', color }));
const createEmptyRow = () => Array(BOARD_SIZE).fill(null);

let boardState = [
    // Row 8: Black's Back Rank
    [{ type: 'Rook', color: 'Black' }, { type: 'Knight', color: 'Black' }, { type: 'Bishop', color: 'Black' }, { type: 'Queen', color: 'Black' }, { type: 'King', color: 'Black' }, { type: 'Bishop', color: 'Black' }, { type: 'Knight', color: 'Black' }, { type: 'Rook', color: 'Black' }],
    // Row 7: Black Pawns
    createPawnRow('Black'),
    // Rows 6, 5, 4, 3: Empty
    createEmptyRow(), createEmptyRow(), createEmptyRow(), createEmptyRow(),
    // Row 2: White Pawns
    createPawnRow('White'),
    // Row 1: White's Back Rank
    [{ type: 'Rook', color: 'White' }, { type: 'Knight', color: 'White' }, { type: 'Bishop', color: 'White' }, { type: 'Queen', color: 'White' }, { type: 'King', color: 'White' }, { type: 'Bishop', color: 'White' }, { type: 'Knight', color: 'White' }, { type: 'Rook', color: 'White' }]
];


// =========================================================
// === 2. MOVE CALCULATION (Piece Rules) ===================
// =========================================================

// --- Sliding Piece Helper ---
function getSlidingMoves(startR, startC, boardState, pieceColor, directions) {
    const legalMoves = [];
    for (const dir of directions) {
        let currentR = startR + dir.r;
        let currentC = startC + dir.c;
        
        while (currentR >= 0 && currentR < 8 && currentC >= 0 && currentC < 8) {
            const destinationPiece = boardState[currentR][currentC];
            if (!destinationPiece) {
                legalMoves.push({ r: currentR, c: currentC });
            } else {
                if (destinationPiece.color !== pieceColor) {
                    legalMoves.push({ r: currentR, c: currentC }); // Capture
                }
                break; // Stop at first collision (friendly or enemy)
            }
            currentR += dir.r;
            currentC += dir.c;
        }
    }
    return legalMoves;
}

// --- Rook Moves ---
function getRookMoves(startR, startC, boardState, isCheckingAttack = false) {
    const piece = boardState[startR][startC];
    if (!piece) return [];
    const directions = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    return getSlidingMoves(startR, startC, boardState, piece.color, directions);
}

// --- Bishop Moves ---
function getBishopMoves(startR, startC, boardState, isCheckingAttack = false) {
    const piece = boardState[startR][startC];
    if (!piece) return [];
    const directions = [{ r: -1, c: 1 }, { r: -1, c: -1 }, { r: 1, c: 1 }, { r: 1, c: -1 }];
    return getSlidingMoves(startR, startC, boardState, piece.color, directions);
}

// --- Queen Moves ---
function getQueenMoves(startR, startC, boardState, isCheckingAttack = false) {
    const piece = boardState[startR][startC];
    if (!piece) return [];
    const cardinal = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    const diagonal = [{ r: -1, c: 1 }, { r: -1, c: -1 }, { r: 1, c: 1 }, { r: 1, c: -1 }];
    const allDirections = [...cardinal, ...diagonal];
    return getSlidingMoves(startR, startC, boardState, piece.color, allDirections);
}

// --- Knight Moves ---
function getKnightMoves(startR, startC, boardState, isCheckingAttack = false) {
    const legalMoves = [];
    const piece = boardState[startR][startC];
    if (!piece) return [];
    
    const moves = [{ r: 2, c: 1 }, { r: 2, c: -1 }, { r: -2, c: 1 }, { r: -2, c: -1 },
                   { r: 1, c: 2 }, { r: 1, c: -2 }, { r: -1, c: 2 }, { r: -1, c: -2 }];

    for (const move of moves) {
        const endR = startR + move.r;
        const endC = startC + move.c;
        if (endR >= 0 && endR < 8 && endC >= 0 && endC < 8) {
            const destinationPiece = boardState[endR][endC];
            if (!destinationPiece || destinationPiece.color !== piece.color) {
                legalMoves.push({ r: endR, c: endC });
            }
        }
    }
    return legalMoves;
}

// --- Pawn Moves ---
function getPawnMoves(startR, startC, boardState, isCheckingAttack = false) {
    const legalMoves = [];
    const piece = boardState[startR][startC];
    if (!piece) return legalMoves; 
    
    const direction = (piece.color === 'Black') ? 1 : -1;
    const startingRow = (piece.color === 'White') ? 6 : 1;
    
    // 1. Forward Moves
    const oneStepR = startR + direction;
    if (oneStepR >= 0 && oneStepR < 8) {
        // Forward One
        if (!boardState[oneStepR][startC]) {
            legalMoves.push({ r: oneStepR, c: startC });
            
            // Forward Two (only if on starting row and one square ahead is clear)
            if (startR === startingRow) {
                const twoStepR = startR + 2 * direction;
                if (!boardState[twoStepR][startC]) {
                    legalMoves.push({ r: twoStepR, c: startC });
                }
            }
        }
    }
    
    // 2. Diagonal Captures
    const possibleCaptures = [startC - 1, startC + 1];
    for (const endC of possibleCaptures) {
        if (endC >= 0 && endC < 8) {
            const endR = startR + direction;
            const destinationPiece = boardState[endR][endC];
            
            if (destinationPiece && destinationPiece.color !== piece.color) {
                legalMoves.push({ r: endR, c: endC });
            }
        }
    }
    
    // ----------------------------------------------------
    // 4. EN PASSANT CAPTURE LOGIC
    // ----------------------------------------------------
    if (enPassantTarget) {
        const targetR = enPassantTarget.r;
        const targetC = enPassantTarget.c;
        const direction = (piece.color === 'Black') ? 1 : -1;

        // Check if the target square is one of the two diagonal attack squares
        const isDiagonalAttack = (startR + direction === targetR) && 
                                 (startC === targetC - 1 || startC === targetC + 1);

        // Check if the pawn is on the correct rank (Rank 5 for White, Rank 4 for Black)
        const correctRank = (piece.color === 'White' && startR === 3) || 
                            (piece.color === 'Black' && startR === 4);

        if (isDiagonalAttack && correctRank) {
            // Add the en passant target square to the list of legal moves
            legalMoves.push(enPassantTarget);
        }
    }

    
    return legalMoves;
}

// --- New Helper Function for resolveDisambiguation ---

/**
 * Checks if a piece (R, B, Q, N) at (startR, startC) can physically attack (endR, endC).
 * This function bypasses all King safety checks.
 */
function canConflicterReach(startR, startC, endR, endC, boardState) {
    const piece = boardState[startR][startC];
    if (!piece) return false;

    // Use a placeholder list that contains only raw, collision-checked moves
    let rawMoves = [];

    // CRITICAL: Call the existing move functions with the 'isCheckingAttack=true' flag.
    // This flag ensures the function returns the raw moves list BEFORE applying any
    // final King safety filter (which is what leads to recursion).
    if (piece.type === 'Rook') {
        rawMoves = getRookMoves(startR, startC, boardState, true);
    } else if (piece.type === 'Bishop') {
        rawMoves = getBishopMoves(startR, startC, boardState, true);
    } else if (piece.type === 'Queen') {
        rawMoves = getQueenMoves(startR, startC, boardState, true);
    } else if (piece.type === 'Knight') {
        rawMoves = getKnightMoves(startR, startC, boardState, true);
    } else {
        return false;
    }

    // Check if the destination square is contained in the raw moves list
    return rawMoves.some(move => move.r === endR && move.c === endC);
}


/**
 * Displays the promotion modal and returns a Promise that resolves with the selected piece type.
 */
function promptPromotion(color) {
    return new Promise(resolve => {
        const promotionOptions = document.getElementById('promotion-options');
        promotionOptions.innerHTML = ''; 
        promotionModal.classList.remove('hidden');

        // Choose the correct Unicode symbols for the buttons
        const pieceSymbols = (color === 'White') ? 
            { Queen: '&#9813;', Rook: '&#9814;', Bishop: '&#9815;', Knight: '&#9816;' } : 
            { Queen: '&#9819;', Rook: '&#9820;', Bishop: '&#9821;', Knight: '&#9822;' };
        
        PROMOTION_PIECES.forEach(p => {
            const button = document.createElement('div');
            button.className = 'promotion-piece';
            button.innerHTML = pieceSymbols[p.type];
            
            button.addEventListener('click', () => {
                promotionModal.classList.add('hidden');
                resolve(p.type); // Resolves the Promise with the selected piece type
            });
            
            promotionOptions.appendChild(button);
        });
    });
}

/**
 * 
 * Checks if a pawn has reached the promotion rank (Row 0 for White, Row 7 for Black).
 * If promotion is needed, it executes the promotion process.
 * * @param {number} endR - The destination row of the moved piece.
 * @param {number} endC - The destination column of the moved piece.
 * @param {string} color - The color of the pawn being promoted.
 * @returns {boolean} True if promotion occurred, false otherwise.
 */
async function checkPawnPromotion(endR, endC, color) {
    const promotionRank = (color === 'White') ? 0 : 7;
    
    // Check if the piece is a Pawn AND if it landed on the promotion rank
    if (boardState[endR][endC]?.type === 'Pawn' && endR === promotionRank) {
        
        // --- 1. PAUSE EXECUTION: Wait for the user to click a piece in the modal 
        const newPieceType = await promptPromotion(color);
        
        // --- 2. EXECUTE THE PROMOTION ---
        boardState[endR][endC] = {
            type: newPieceType,
            color: color
        };
        
        return true;
    }
    
    return false;
}


// =========================================================
// === CASTLING & KING LOGIC ============================
// =========================================================

function checkCastling(startR, startC, pieceColor, boardState, opponentColor) {
    const castlingMoves = [];
    const initialRow = (pieceColor === 'White') ? 7 : 0;
    
    if (startR !== initialRow || startC !== 4) return castlingMoves; 

    // Check 1: King must not have moved & King must not be in check
    const KingHasMoved = (pieceColor === 'White') ? !canWhiteKingCastle : !canBlackKingCastle;
    if (KingHasMoved || isSquareAttacked(startR, startC, opponentColor, boardState)) {
        return castlingMoves; 
    }
    
    // --- KINGSIDE (Short) ---
    const K_RookMoved = (pieceColor === 'White') ? !canWhiteRookKCastle : !canBlackRookKCastle;
    if (!K_RookMoved && boardState[initialRow][7]?.type === 'Rook') {
        if (!boardState[initialRow][5] && !boardState[initialRow][6]) { // Path Clear
            // Path Safe: Check f-file (5) and g-file (6)
            if (!isSquareAttacked(initialRow, 5, opponentColor, boardState) && 
                !isSquareAttacked(initialRow, 6, opponentColor, boardState)) {
                castlingMoves.push({ r: initialRow, c: 6 }); // King moves to g-file
            }
        }
    }

    // --- QUEENSIDE (Long) ---
    const Q_RookMoved = (pieceColor === 'White') ? !canWhiteRookQCastle : !canBlackRookQCastle;
    if (!Q_RookMoved && boardState[initialRow][0]?.type === 'Rook') {
        if (!boardState[initialRow][1] && !boardState[initialRow][2] && !boardState[initialRow][3]) { // Path Clear
            // Path Safe: Check c-file (2) and d-file (3)
            if (!isSquareAttacked(initialRow, 2, opponentColor, boardState) && 
                !isSquareAttacked(initialRow, 3, opponentColor, boardState)) {
                castlingMoves.push({ r: initialRow, c: 2 }); // King moves to c-file
            }
        }
    }
    return castlingMoves;
}

// --- King Moves ---
function getKingMoves(startR, startC, boardState, isCheckingAttack = false) {
    const potentialMoves = [];
    const piece = boardState[startR][startC];
    if (!piece) return [];
    
    const directions = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }, 
                        { r: -1, c: 1 }, { r: -1, c: -1 }, { r: 1, c: 1 }, { r: 1, c: -1 }];

    for (const dir of directions) {
        const endR = startR + dir.r;
        const endC = startC + dir.c;
        if (endR >= 0 && endR < 8 && endC >= 0 && endC < 8) {
            const destinationPiece = boardState[endR][endC];
            if (!destinationPiece || destinationPiece.color !== piece.color) {
                potentialMoves.push({ r: endR, c: endC });
            }
        }
    }

    // BREAK THE RECURSION: If checking attack, return raw moves immediately.
    if (isCheckingAttack) {
        return potentialMoves; 
    }
    
    // King Safety Filter (Only runs when player is moving the King)
    const opponentColor = (piece.color === 'White') ? 'Black' : 'White';
    let finalLegalMoves = [];
    
    for (const move of potentialMoves) {
        // King cannot move to a square that is attacked
        if (!isSquareAttacked(move.r, move.c, opponentColor, boardState)) { 
            finalLegalMoves.push(move);
        }
    }
    
    // Add Castling moves
    finalLegalMoves = finalLegalMoves.concat(checkCastling(startR, startC, piece.color, boardState, opponentColor));

    return finalLegalMoves;
}


// =========================================================
// === 4. CHECK & SAFETY LOGIC =============================
// =========================================================

function findKing(color, boardState) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];
            if (piece && piece.type === 'King' && piece.color === color) {
                return { r, c };
            }
        }
    }
    return null;
}

function isSquareAttacked(targetR, targetC, attackingColor, boardState) {
    const opponentColor = attackingColor;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];

            if (!piece || piece.color !== opponentColor) continue;

            let attackerMoves = [];
            
            // Call move functions with isCheckingAttack=true to prevent recursion.
            if (piece.type === 'Pawn') {
                const direction = (opponentColor === 'Black') ? 1 : -1;
                if (c + 1 < 8) attackerMoves.push({ r: r + direction, c: c + 1 }); 
                if (c - 1 >= 0) attackerMoves.push({ r: r + direction, c: c - 1 });
            } else if (piece.type === 'Knight') {
                attackerMoves = getKnightMoves(r, c, boardState, true); 
            } else if (piece.type === 'Bishop') {
                attackerMoves = getBishopMoves(r, c, boardState, true);
            } else if (piece.type === 'Rook') {
                attackerMoves = getRookMoves(r, c, boardState, true);
            } else if (piece.type === 'Queen') {
                attackerMoves = getQueenMoves(r, c, boardState, true);
            } else if (piece.type === 'King') {
                attackerMoves = getKingMoves(r, c, boardState, true);
            }
            
            const isAttackingTarget = attackerMoves.some(
                move => move.r === targetR && move.c === targetC
            );

            if (isAttackingTarget) return true; 
        }
    }
    return false;
}

function moveLeavesKingInCheck(startR, startC, endR, endC, boardState) {
    const piece = boardState[startR][startC];
    if (!piece) return false; 
    
    const playerColor = piece.color;
    const opponentColor = playerColor === 'White' ? 'Black' : 'White';
    
    // 1. Create a DEEP COPY of the board
    const testBoard = boardState.map(row => [...row]); 
    
    // 2. Simulate the move on the test board
    const movingPiece = testBoard[startR][startC];
    testBoard[endR][endC] = movingPiece;
    testBoard[startR][startC] = null;
    
    // Handle King position for check
    let kingPosition;
    if (piece.type === 'King') {
        kingPosition = { r: endR, c: endC }; // King's new position
    } else {
        kingPosition = findKing(playerColor, testBoard); // Find King's static position
    }
    
    if (!kingPosition) return true; // Should not happen

    // 3. Check if the King is attacked after the simulated move
    return isSquareAttacked(kingPosition.r, kingPosition.c, opponentColor, testBoard);
}


// =========================================================
// === 5. CORE GAME FLOW ===================================
// =========================================================

function getLegalMovesForSelectedPiece(r, c) {
    const piece = boardState[r][c];
    if (!piece) return [];

    let potentialLegalMoves = [];
    if (piece.type === 'King') potentialLegalMoves = getKingMoves(r, c, boardState); 
    else if (piece.type === 'Queen') potentialLegalMoves = getQueenMoves(r, c, boardState);
    else if (piece.type === 'Rook') potentialLegalMoves = getRookMoves(r, c, boardState);
    else if (piece.type === 'Bishop') potentialLegalMoves = getBishopMoves(r, c, boardState);
    else if (piece.type === 'Knight') potentialLegalMoves = getKnightMoves(r, c, boardState);
    else if (piece.type === 'Pawn') potentialLegalMoves = getPawnMoves(r, c, boardState);
    
    // Universal Filter: Remove moves that leave the King in check
    const finalLegalMoves = [];
    for (const move of potentialLegalMoves) {
        if (!moveLeavesKingInCheck(r, c, move.r, move.c, boardState)) {
            finalLegalMoves.push(move);
        }
    }
    return finalLegalMoves;
}
function isValidMove(startR, startC, endR, endC) {
    const legalMoves = getLegalMovesForSelectedPiece(startR, startC);
    
    return legalMoves.some(dest => dest.r === endR && dest.c === endC);
}

// --- Add to your script.js (e.g., near Check Logic) ---

/**
 * Checks if the currentPlayer has any legal moves left on the board.
 * This is the core check for both Checkmate and Stalemate.
 * @returns {boolean} True if the current player can make at least one move.
 */
function hasLegalMoves(boardState, playerColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];

            // 1. Check only the current player's pieces
            if (piece && piece.color === playerColor) {
                
                // 2. Use the existing getLegalMovesForSelectedPiece function
                // This function already performs ALL necessary checks 
                // (piece rule, collision, and King safety).
                const legalMoves = getLegalMovesForSelectedPiece(r, c);
                
                // 3. If any legal move is found, the game is not over.
                if (legalMoves.length > 0) {
                    return true;
                }
            }
        }
    }
    return false; // No legal moves found after checking all pieces
}

// -- Checks for Threefold Repitition --
function checkThreefoldRepetition() {
    // Get the current position key
    const key = generatePositionKey(boardState);
    
    // Check if this position has appeared 3 or more times
    if (positionHistory[key] >= 3) {
        return true;
    }
    return false;
}


/**
 * Determines if the game has ended in Checkmate, Stalemate, or is ongoing.
 * Returns a string representing the outcome or null if ongoing.
 */
function checkGameEnd(boardState) {
    /* const playerColor = currentPlayer;
    const opponentColor = (playerColor === 'White') ? 'Black' : 'White';
    */
    // The player who just moved is the global currentPlayer.
    // The player whose fate we check is the OPPONENT (the 'next player').
    const nextPlayerColor = (currentPlayer === 'White') ? 'Black' : 'White';
    const opponentColor = currentPlayer; // The player who just moved is the "attacker"
    
    // 1. Check if the player has any legal moves
    const movesAvailable = hasLegalMoves(boardState, nextPlayerColor);
    
    // 2. Find the current player's King
    const kingPosition = findKing(nextPlayerColor, boardState);
    if (!kingPosition) return 'Error: King not found';

    // 3. Check if the player's King is currently in Check
    const inCheck = isSquareAttacked(kingPosition.r, kingPosition.c, opponentColor, boardState);
    
    // Check Threefold Repetition
    if (checkThreefoldRepetition()) {
        return 'Repetition Draw';
    }


    // --- Determine Outcome ---

    if (movesAvailable) {
        // Moves available: Game continues.
        return null; 
    } else {
        // NO moves available: Game is over.
        if (inCheck) {
            // No moves AND King is in Check = Checkmate
            return 'Checkmate';
        } else {
            // No moves AND King is NOT in Check = Stalemate
            return 'Stalemate';
        }
    }
}

// --- Add to your script.js (e.g., near UI functions) ---

function promptGameResult(result, winningColor) {
    let headerText = '';
    let messageText = '';

    
    // The currentPlayer at this point is the one whose King is in checkmate/stalemate.
    // const losingColor = currentPlayer;
    // const winningColor = (losingColor === 'White') ? 'Black' : 'White';

    
    if (result === 'Checkmate') {
        const losingColor = winningColor === 'White' ? 'Black' : 'White';
        
        // --- 1. Apply LOSER Effect to King's Square ---
        const kingLosingPos = findKing(losingColor, boardState);
        if (kingLosingPos) {
            const kingSquare = document.querySelector(`[data-row='${kingLosingPos.r}'][data-col='${kingLosingPos.c}']`);
            
            if (kingSquare) {
                // Remove standard check highlight and apply final mate highlight
                kingSquare.classList.remove('in-check'); 
                kingSquare.classList.add('checkmated'); 
            }
            
        }            
        // --- 2. Apply WINNER Effect to Attacker's Square ---
        // The attacker is the piece that just moved. We use the global 'lastMove' or the final destination.
        // Assuming your move logic ensures lastMove.end is the final square:
        // Note: The move execution logic must update the global 'lastMove' variable.
        // Modification - Apply Winning Effect to the King
        const kingWinPos = findKing(winningColor, boardState);
        if (kingWinPos) {
            const kingSquare = document.querySelector(`[data-row='${kingWinPos.r}'][data-col='${kingWinPos.c}']`);
            
            if (kingSquare) {
                // Apply final winner highlight
                
                kingSquare.classList.add('checkmate-winner'); 
            }
            
        }
        


        /* const winningColor = (currentPlayer === 'White') ? 'Black' : 'White';
        / * /
        headerText = 'CHECKMATE!';
        messageText = `${winningColor} wins the game!`;
        // Optionally change header color for Checkmate
        gameOverHeader.style.color = '#cc0000';
        */
        gameResultStatus = (winningColor === 'White') ? '1-0' : '0-1';
        
        generatePGN();

    } else if (result === 'Stalemate') {
        headerText = 'STALEMATE!';
        messageText = 'The game is a draw.';
        // Neutral color for Stalemate
        gameOverHeader.style.color = '#333333'; 
        
        gameResultStatus = "1/2-1/2";
        
        generatePGN();

    } else if (result === 'Repetition Draw') {
        headerText = 'DRAW!';
        messageText = 'The same position occurred three times.';
        gameOverHeader.style.color = '#333333';
        
        gameResultStatus = "1/2-1/2";
        
        generatePGN();
    } else {
        return;
    }
    
    // Set the text content
    gameOverHeader.textContent = headerText;
    gameOverMessage.textContent = messageText;


    // Display the result and offer a new game option
    // Show the modal
    // gameOverModal.classList.remove('hidden');

}


// Converts a move object into standard algebraic notation (e.g., "Nf3" or "O-O")
function createMoveNotation(startR, startC, endR, endC, pieceType, isCapture, promotionType, isCastling) {
    // Check for Castling (Highest Priority)
    if (isCastling === 'kingside') return 'O-O';
    if (isCastling === 'queenside') return 'O-O-O';
    
    const endAlg = coordsToAlgebraic(endR, endC), 
    startAlg = coordsToAlgebraic(startR, startC);
    
    let notation = '';
    
    // Handle Pawns (cxd5, e4)
    if (pieceType === 'Pawn') {
        if(isCapture) {
            // Pawn captures MUST include their previous file (cxd5, exc4)
            notation = startAlg.charAt(0) + 'x' + endAlg;
        } else {
            // Simple Pawn move (e4, d6)
            notation = endAlg;
        }
    } else {
        
        // Simplest form: PieceLetter + startFile/Rank + (x if capture) + endSquare
        let pieceLetter = PieceType.charAt(0).toUpperCase();
        if (pieceType === 'Knight') pieceLetter = 'N'; // Ensure Knight is 'N'
        
        // Add Disambiguation (e.g., 'a' in Rad1 or '7' in R7d1)
        notation += resolveDisambiguation(startR, startC, endR, endC, pieceType, boardState);

        // Add 'x' for capture
        if (isCapture) notation += 'x'; 
    
        // Add destination square
        notation += coordsToAlgebraic(endR, endC);
    
        // Add promotion piece
        if (promotionType) notation += '=' + promotionType.charAt(0).toUpperCase();

        // NOTE: This basic notation omits check (+) and checkmate (#) which requires checking
        // the game state *after* the move is fully executed.
        
    }
    
    return notation;
}

// --- Function to Resolve Ambiguity ---
function resolveDisambiguation(startR, startC, endR, endC, pieceType, boardState) {
    // Pawns and Kings have unique moves and don't need disambiguation
    if (pieceType === 'Pawn' || pieceType === 'King') return ''; 
    
    const piece = boardState[startR][startC];
    const playerColor = piece.color;
    
    let needsFile = false; // Is the starting file (a, b, c...) needed?
    let needsRank = false; // Is the starting rank (1, 2, 3...) needed?

    // 1. Iterate through the entire board to find conflicting pieces
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const potentialConflicter = boardState[r][c];

            // Skip the piece currently moving
            if (r === startR && c === startC) continue;
            
            // Check if piece is same type and color
            if (!potentialConflicter || potentialConflicter.color !== playerColor || potentialConflicter.type !== pieceType) continue;

            // Check if the conflicting piece can ALSO legally move to the destination
            // We MUST use the function that checks King safety (getLegalMovesForSelectedPiece)
            const canMoveToDest = canConflicterReach(r, c, endR, endC, potentialConflicter.type, boardState);

            if (canMoveToDest) {
                // Conflict found! Determine the necessary disambiguation.
                
                if (startC === c) {
                    // Conflicters are on the same file -> Must use RANK (R7d1)
                    needsRank = true;
                } else {
                    // Conflicters are on different files -> Use FILE is sufficient (Rad1)
                    needsFile = true;
                }
                // If they are on the same rank but different files, FILE is sufficient
            }
        }
    }

    // 2. Construct the Disambiguation String
    const startAlg = coordsToAlgebraic(startR, startC);

    if (needsFile) {
        // If file is necessary, use the starting file letter (e.g., 'R' + 'a' + 'd1')
        return startAlg.charAt(0);
    } 
    if (needsRank) {
        // If only rank is necessary, use the starting rank number (e.g., 'R' + '7' + 'd1')
        return startAlg.charAt(1);
    }

    return '';
}




async function executeMove(startR, startC, endR, endC) {
    const pieceToMove = boardState[startR][startC];

    // IDENTIFY SPECIAL MOVES
    const isCastling = pieceToMove.type === 'King' && Math.abs(startC - endC) === 2;
    
    const isPawnMove = pieceToMove.type === 'Pawn';
    
    // Check if the move is an En Passant capture (destination is empty, but move is diagonal)
    const isEnPassant = isPawnMove && enPassantTarget && endR === enPassantTarget.r && endC === enPassantTarget.c && !boardState[endR][endC]; // Target square must be empty
    
    
    // --- Data gathering BEFORE execution ---
    // This assumes the destination piece is captured if it exists AND the move is valid
    const isCapture = !!boardState[endR][endC] || isEnPassant; 
    const isKingsideCastling = pieceToMove.type === 'King' && endC === 6;
    const isQueensideCastling = pieceToMove.type === 'King' && endC === 2;
    
    let promotionType = null;
    let castlingType = null;

    if (isKingsideCastling) castlingType = 'kingside';
    if (isQueensideCastling) castlingType = 'queenside';


    // --- Castling Logic (Moves Rook too) ---
    if (isCastling) {
        const rookRow = startR; 
        let rookStartCol, rookEndCol;

        if (endC === 6) { rookStartCol = 7; rookEndCol = 5; } // Kingside
        else if (endC === 2) { rookStartCol = 0; rookEndCol = 3; } // Queenside
        
        // Move Rook
        const rookToMove = boardState[rookRow][rookStartCol];
        boardState[rookRow][rookEndCol] = rookToMove;
        boardState[rookRow][rookStartCol] = null;
        
        // Update Castling Flags (Full loss of rights after King moves)
        if (pieceToMove.color === 'White') { canWhiteKingCastle = false; canWhiteRookKCastle = false; canWhiteRookQCastle = false; } 
        else { canBlackKingCastle = false; canBlackRookKCastle = false; canBlackRookQCastle = false; }
    }
    if (isEnPassant) {
        // If it's En Passant, we must also clear the captured pawn
            const capturedPawnRow = (pieceToMove.color === 'White') ? endR + 1 : endR - 1;
            boardState[capturedPawnRow][endC] = null;
    }
    boardState[endR][endC] = pieceToMove;
    boardState[startR][startC] = null;
    
    boardState[endR][endC] = pieceToMove;
    boardState[startR][startC] = null;
    
    // Update Flags for Rook/King moves (even if not castling)
    if (pieceToMove.type === 'King') {
        if (pieceToMove.color === 'White') { canWhiteKingCastle = false; } else { canBlackKingCastle = false; }
    } else if (pieceToMove.type === 'Rook') {
        if (startR === 7 && startC === 0) canWhiteRookQCastle = false;
        if (startR === 7 && startC === 7) canWhiteRookKCastle = false;
        if (startR === 0 && startC === 0) canBlackRookQCastle = false;
        if (startR === 0 && startC === 7) canBlackRookKCastle = false;
    }
    
    // --- CHECK FOR PAWN PROMOTION ---
    // ---- AND EN PASSANT CAPTURE ----
    if (isPawnMove) {
        // Check for Two-Square Pawn Move
        const rowDiff = Math.abs(startR - endR);
        if (rowDiff === 2) {
            // Calculate the square behind the moved pawn
            const direction = (pieceToMove.color === 'White') ? 1 : -1;
            enPassantTarget = { r: endR + direction, c: endC };

        }
        
        // The checkPawnPromotion function will modify boardState if needed
        const promotionResult = await checkPawnPromotion(endR, endC, pieceToMove.color);
        // If promotion occurred, the new piece type is in boardState[endR][endC]
        if (promotionResult) {
            promotionType = boardState[endR][endC].type;
        }
    }
    
    // --- RECORD MOVE HISTORY ---
    const notation = createMoveNotation(
        startR, startC, endR, endC, pieceToMove.type, isCapture, promotionType, castlingType
    );
    
    gameMovesHistory.push(notation);

    
    // ------- UPDATE FEN HISTORY -------
    const key = generatePositionKey(boardState); 
    
    // Increment the count for this position
    positionHistory[key] = (positionHistory[key] || 0) + 1;
    
    // --- RECORD THE LAST MOVE ---
    lastMove.start = { r: startR, c: startC };
    lastMove.end = { r: endR, c: endC };

    renderBoard(isBoardFlip);
    displayMoveHistory();
    /*
// FUTURE: Check for Checkmate / Stalemate 
    
    // 1. Switch turn BEFORE checking the game end status 
    // (This makes the `currentPlayer` the one whose fate we are checking)
    switchTurn(); 
    
    // 2. Check the game status
    const gameResult = checkGameEnd(boardState);
    
    if (gameResult) {
        promptGameResult(gameResult);
        // Do NOT switch turn back or allow more moves
    }
    
    // If you plan to add engine analysis, you would also call it here
    // requestAnalysis();
    */
}

function switchTurn() {
    currentPlayer = currentPlayer === 'White' ? 'Black' : 'White';
    console.log(`It is now ${currentPlayer}'s turn.`);
}
// =========================================================
// === 6. RENDERING & UI HIGHLIGHTS ========================
// =========================================================

function clearAllHighlights() {
    document.querySelectorAll('.square').forEach(square => {
        square.classList.remove('selected', 'possible-move', 'occupied');
    });
}

function highlightLegalMoves(moves) {
    moves.forEach(move => {
        const squareElement = document.querySelector(`[data-row='${move.r}'][data-col='${move.c}']`);
        if (squareElement) {
            squareElement.classList.add('possible-move');
            const piece = boardState[move.r][move.c];
            if (piece) {
                squareElement.classList.add('occupied');
            }
        }
    });
}

function renderBoard(isBoardFlip) {
    
    
    // The player who just moved is the global currentPlayer.
    // The player whose fate we check is the OPPONENT (the 'next player').
    const nextPlayerColor = (currentPlayer === 'White') ? 'Black' : 'White';
    const opponentColor = currentPlayer; // The player who just moved is the "attacker"
    
    // 1. Check if the player has any legal moves
    const movesAvailable = hasLegalMoves(boardState, nextPlayerColor);
    
    // 2. Find the current player's King
    const kingPosition = findKing(nextPlayerColor, boardState);
    if (!kingPosition) return 'Error: King not found';

    // 3. Check if the player's King is currently in Check
    const inCheck = isSquareAttacked(kingPosition.r, kingPosition.c, opponentColor, boardState);
    
    
    
    const chessboard = document.getElementById('chessboard');
    chessboard.innerHTML = ''; // Clear all HTML
    clearAllHighlights(); // Clear highlights (though not strictly necessary as HTML is wiped)
    
    if (!isBoardFlip) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const square = document.createElement('div');
                square.setAttribute('data-row', r);
                square.setAttribute('data-col', c);
            
                const colorClass = (r + c) % 2 === 0 ? 'light' : 'dark';
                square.classList.add('square', colorClass);

                const piece = boardState[r][c];
                if (piece) {
                square.classList.add(`${piece.color.toLowerCase()}-${piece.type.toLowerCase()}`);
                square.innerHTML = PIECE_SYMBOLS[piece.color][piece.type];
                }
            
                // --- APPLY LAST MOVE HIGHLIGHTS ---
                if (lastMove.start && lastMove.end) {
                    if (r === lastMove.start.r && c === lastMove.start.c) {
                    square.classList.add('last-move-start');
                    }
                    if (r === lastMove.end.r && c === lastMove.end.c) {
                    square.classList.add('last-move-end');
                    }
                }
            
                if (inCheck && r === kingPosition.r &&  c === kingPosition.c) {
                    square.classList.add('in-check');
                }


                square.addEventListener('click', handleSquareClick);
                chessboard.appendChild(square);
            }
        }
    } else {
        for (let r = BOARD_SIZE - 1; r >= 0; r--) {
            for (let c = BOARD_SIZE - 1; c >= 0; c--) {
                const square = document.createElement('div');
                square.setAttribute('data-row', r);
                square.setAttribute('data-col', c);
            
                const colorClass = (r + c) % 2 === 0 ? 'light' : 'dark';
                square.classList.add('square', colorClass);

                const piece = boardState[r][c];
                if (piece) {
                square.classList.add(`${piece.color.toLowerCase()}-${piece.type.toLowerCase()}`);
                square.innerHTML = PIECE_SYMBOLS[piece.color][piece.type];
                }
            
                // --- APPLY LAST MOVE HIGHLIGHTS ---
                if (lastMove.start && lastMove.end) {
                    if (r === lastMove.start.r && c === lastMove.start.c) {
                    square.classList.add('last-move-start');
                    }
                    if (r === lastMove.end.r && c === lastMove.end.c) {
                    square.classList.add('last-move-end');
                    }
                }
            
                if (inCheck && r === kingPosition.r &&  c === kingPosition.c) {
                    square.classList.add('in-check');
                }


                square.addEventListener('click', handleSquareClick);
                chessboard.appendChild(square);
            }
        }
    }
}
async function handleSquareClick(event) {
    const squareElement = event.currentTarget;
    const r = parseInt(squareElement.getAttribute('data-row'));
    const c = parseInt(squareElement.getAttribute('data-col'));
    const piece = boardState[r][c];

    if (!selectedSquare) {
        if (piece && piece.color === currentPlayer) {
            selectedSquare = { r, c, element: squareElement };
            squareElement.classList.add('selected');
            
            const legalMoves = getLegalMovesForSelectedPiece(r, c);
            highlightLegalMoves(legalMoves);
        }
    } else {
        // 1. Deselect if clicked same square
        if (selectedSquare.r === r && selectedSquare.c === c) {
            clearAllHighlights();
            selectedSquare = null;
        } 
        // 2. Execute move if valid
        else if (isValidMove(selectedSquare.r, selectedSquare.c, r, c)) {
            await executeMove(selectedSquare.r, selectedSquare.c, r, c);
            clearAllHighlights();
            selectedSquare = null;
            // 3. Check the game status for the player who just moved (White)
            const gameResult = checkGameEnd(boardState);

            
            if (gameResult) {
                const winningColor = currentPlayer;
                promptGameResult(gameResult, winningColor); // Pass the winner's color
            } else {
                // 4. ONLY switch turn if the game is NOT over
                switchTurn(); 
            }

        } 
        // 5. Switch selection to another piece of the same color
        else if (piece && piece.color === currentPlayer) {
            clearAllHighlights();
            selectedSquare = null; 
            
            selectedSquare = { r, c, element: squareElement };
            squareElement.classList.add('selected');
            const legalMoves = getLegalMovesForSelectedPiece(r, c);
            highlightLegalMoves(legalMoves);
        }
        // 6. Invalid move
        else {
            console.log("Invalid move for now.");
        }
    }
}

// --- Function to Display Moves ---
function displayMoveHistory() {
    let historyElement = document.getElementById('move-history');
    if (!historyElement) {
        // Create the container if it doesn't exist
        historyElement = document.createElement('div');
        historyElement.id = 'move-history';
        // Append it somewhere sensible in your layout (e.g., body or side panel)
        document.body.appendChild(historyElement); 
    }
    
    historyElement.innerHTML = '<h4>Game History</h4><ol></ol>';
    const ol = historyElement.querySelector('ol');
    
    for (let i = 0; i < gameMovesHistory.length; i++) {
        const move = gameMovesHistory[i];
        
        // White's move: Start new list item
        if (i % 2 === 0) {
            const li = document.createElement('li');
            li.textContent = ((i / 2) + 1) + '. ' +move;
            ol.appendChild(li);
        } 
        // Black's move: Append to the current list item
        else {
            const li = ol.lastElementChild;
            if (li) {
                li.textContent += ' ' + move;
            }
        }
    }
}

// --- PGN Generation Functions ---
// --- Global Flag for Checkmate/Stalemate Status ---
// --- Helper to check for check/mate after a move (Must be defined globally) ---
// This function relies on your existing check logic (isSquareAttacked, checkGameEnd)
function getCheckStatus(boardState, nextPlayerColor) {
    const opponentColor = (nextPlayerColor === 'White') ? 'Black' : 'White';
    const kingPos = findKing(nextPlayerColor, boardState);
    if (!kingPos) return ''; // King not found

    const inCheck = isSquareAttacked(kingPos.r, kingPos.c, opponentColor, boardState);
    
    // Checkmate is determined by checkGameEnd (which is called after the move)
    if (checkGameEnd(boardState) === 'Checkmate') {
        return '#'; // Checkmate
    } else if (inCheck) {
        return '+'; // Check
    }
    return '';
}


// --- PGN Generator Function ---
function generatePGN() {
    // 1. Setup Headers (Seven Tag Roster)
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
    
    let pgn = `[Event "?"]
[Site "?"]
[Date "${date}"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "${gameResultStatus}"]

`; // Two newlines before moves start

    let moveText = '';
    
    // 2. Format Move List
    for (let i = 0; i < gameMovesHistory.length; i++) {
        const move = gameMovesHistory[i];
        
        // White's move: Add move number (1., 2., 3., etc.)
        if (i % 2 === 0) {
            moveText += `${(i / 2) + 1}. `;
        }
        
        // Add the move notation
        moveText += move;
        
        // --- Append Check/Checkmate Notation ---
        // This is complex because we need the board state *after* the move was made.
        // For simplicity in this vanilla JS context, this step is often done *during*
        // the game recording or omitted. Here, we must rely on the game state *after*
        // the last recorded move.

        // If this is the last move, append the check status:
        if (i === gameMovesHistory.length - 1) {
            // Determine whose turn it would have been next (the player who is checked)
            const nextPlayer = (i % 2 === 0) ? 'Black' : 'White'; 
            const checkStatus = getCheckStatus(boardState, nextPlayer);
            moveText += checkStatus;
        }

        // Add a space after the move
        moveText += ' ';
    }
    
    // 3. Final Assembly
    pgn += moveText.trim();
    pgn += ' ' + gameResultStatus;

    console.log("--- PGN Output ---");
    console.log(pgn);
    console.log("------------------");
    
    return pgn;
}




// ---- FEN Key Generation Function ----
function generatePositionKey(boardState) {
    let fen = '';

    // 1. Piece Placement (Ranks 8 through 1)
    for (let r = 0; r < 8; r++) {
        let emptyCount = 0;
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];
            if (piece) {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                let pieceChar = piece.type.charAt(0);
                if (piece.type === 'Knight') pieceChar = 'N'; 
                
                fen += (piece.color === 'White') ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
            } else {
                emptyCount++;
            }
        }
        if (emptyCount > 0) {
            fen += emptyCount;
        }
        if (r < 7) {
            fen += '/';
        }
    }

    // 2. Side to Move
    fen += ' ' + (currentPlayer === 'White' ? 'w' : 'b');

    // 3. Castling Rights
    let castlingRights = '';
    // Note: Kingside rook castling is implied by King castling right if the rook is there.
    if (canWhiteKingCastle) castlingRights += 'K';
    if (canWhiteRookQCastle) castlingRights += 'Q'; 
    if (canBlackKingCastle) castlingRights += 'k';
    if (canBlackRookQCastle) castlingRights += 'q';
    fen += ' ' + (castlingRights || '-');
    
    // 4. En Passant Target Square (Using '-' as a placeholder if target isn't explicitly tracked)
    fen += ' ' + (enPassantTarget || '-'); 
    
    return fen;
}


// Toggle Flips whenever it called 
function toggleFlip() {
    // const chessboard = document.getElementById('chessboard');
    // chessboard.classList.toggle('flipped');
    isBoardFlip = !isBoardFlip;
    renderBoard(isBoardFlip);
    renderCoordinates(isBoardFlip);
}
// ======================================
// ======= RENDERING CO-ORDINATES =======
// ======================================
/**
 * Dynamically generates and renders algebraic coordinates (A-H, 1-8).
 * @param {boolean} isFlipped - True if the board is currently rotated 180 degrees.
 */
function renderCoordinates(isFlipped) {
    const ranksContainer = document.getElementById('ranks');
    const filesContainer = document.getElementById('files-bottom');
    
    // Clear existing labels
    ranksContainer.innerHTML = '';
    filesContainer.innerHTML = '';
    
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    // If the board is flipped, reverse the coordinates displayed to the user
    const displayFiles = isFlipped ? [...files].reverse() : files;
    const displayRanks = isFlipped ? [...ranks].reverse() : ranks;
    
    // --- 1. Render Ranks (1-8) ---
    // Ranks are displayed vertically alongside the board.
    displayRanks.forEach(rank => {
        const label = document.createElement('label');
        label.textContent = rank;
        ranksContainer.appendChild(label);
    });

    // --- 2. Render Files (A-H) ---
    // Files are displayed horizontally below the board.
    displayFiles.forEach(file => {
        const label = document.createElement('label');
        label.textContent = file;
        filesContainer.appendChild(label);
    });
}


// =========================================================
// === 7. INITIALIZATION ===================================
// =========================================================
window.onload = function() {
    promotionModal = document.getElementById('promotion-modal');
    gameOverModal = document.getElementById('game-over-modal');
    gameOverHeader = document.getElementById('game-over-header');
    gameOverMessage = document.getElementById('game-over-message');
    newGameButton = document.getElementById('new-game-button');
    closeGameOverDialog = document.getElementById('close-game-over-dialog'); 
    
    if (!gameOverModal) { console.error("Game Over modal HTML structure not found!"); }
    
    // Attach listener to reset the game when the button is clicked
    if (newGameButton) {
        newGameButton.addEventListener('click', () => {
            location.reload(); 
        });
    }
    
    // Attach listener to the close button
    if (closeGameOverDialog) {
        closeGameOverDialog.addEventListener('click', () => {
            gameOverModal.classList.add('hidden');
        });
    }


    if (document.getElementById('chessboard')) {
        renderBoard(isBoardFlip);
        renderCoordinates(isBoardFlip);
        
        const flip = document.getElementById('flip');
        const init = document.getElementById('init');
        if (flip && init) {
            flip.addEventListener('click', toggleFlip);
            init.addEventListener('click', () => {
                location.reload();
            });
        }
    } else {
        console.error("Error: Could not find the #chessboard element in the HTML.");
    }
}