// =========================================================
// === 1. GLOBAL STATE & SETUP =============================
// =========================================================

const BOARD_SIZE = 8;
let selectedSquare = null; 
let currentPlayer = 'White'; 
let isBoardFlip = false;
let gameResultStatus = '*'; // Default: ongoing. Can be "1-0", "0-1", or "1/2-1/2".
let positionHistory = {}; // Key: FEN string, Value: Number of occurrences

let lastMove = { start: null, end: null };
let enPassantTarget = null;

// --- Modal Dialog References (Initialized in window.onload) ---
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

// --- Castling Flags ---
let canWhiteKingCastle = true;
let canWhiteRookKCastle = true; 
let canWhiteRookQCastle = true; 
let canBlackKingCastle = true;
let canBlackRookKCastle = true; 
let canBlackRookQCastle = true; 

let gameMovesHistory = []; 

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

/**
 * Loads a new board position and game state from a FEN string.
 * @param {string} fenString - The FEN string (e.g., "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -")
 */
function loadFEN(fenString) {
    const parts = fenString.split(' ');
    const piecePlacement = parts[0];
    const activeColor = parts[1];
    const castlingRights = parts[2];
    
    // Create a fresh, empty board state
    let newBoardState = [];
    for (let i = 0; i < 8; i++) {
        newBoardState.push(Array(8).fill(null));
    }

    // --- Piece Mapping ---
    const pieceMap = { 
        p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' 
    };

    // --- 1. Parse Piece Placement ---
    let rank = 0;
    let file = 0;

    for (const char of piecePlacement) {
        if (char === '/') {
            rank++;
            file = 0;
        } else if (/\d/.test(char)) {
            // If character is a number, skip that many empty files
            file += parseInt(char);
        } else {
            // Character is a piece
            const color = (char === char.toUpperCase()) ? 'White' : 'Black';
            const typeKey = char.toLowerCase();
            const type = pieceMap[typeKey];

            if (type) {
                newBoardState[rank][file] = { type: type, color: color };
            }
            file++;
        }
    }

    // --- 2. Update Global State Variables ---
    
    // a. Board State
    boardState = newBoardState; // Overwrite the global boardState
    
    // b. Active Color
    currentPlayer = (activeColor === 'w') ? 'White' : 'Black';

    // c. Castling Flags
    canWhiteKingCastle = castlingRights.includes('K');
    canWhiteRookQCastle = castlingRights.includes('Q');
    canBlackKingCastle = castlingRights.includes('k');
    canBlackRookQCastle = castlingRights.includes('q');
    
    // d. En Passant Target (If necessary, you would parse parts[3] here)
    // For simplicity, we assume no immediate En Passant threat is set on load.
    enPassantTarget = null; 
    gameMovesHistory = []; 
    positionHistory = {};
    lastMove = { start: null, end: null };
    displayMoveHistory();
    // 3. Render the New Board
    renderBoard(isBoardFlip);
    renderCoordinates(isBoardFlip);

}

// =========================================================
// === 2. MOVE CALCULATION (Primitives & All 6 Pieces) =====
// =========================================================

// --- Smallest Helpers ---

function coordsToAlgebraic(r, c) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    return files[c] + ranks[r];
}

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

// --- ALL 6 PIECE MOVEMENT FUNCTIONS ---

function getRookMoves(startR, startC, boardState, isCheckingAttack = false) {
    const piece = boardState[startR][startC];
    if (!piece) return [];
    const directions = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    return getSlidingMoves(startR, startC, boardState, piece.color, directions);
}

function getBishopMoves(startR, startC, boardState, isCheckingAttack = false) {
    const piece = boardState[startR][startC];
    if (!piece) return [];
    const directions = [{ r: -1, c: 1 }, { r: -1, c: -1 }, { r: 1, c: 1 }, { r: 1, c: -1 }];
    return getSlidingMoves(startR, startC, boardState, piece.color, directions);
}

function getQueenMoves(startR, startC, boardState, isCheckingAttack = false) {
    const piece = boardState[startR][startC];
    if (!piece) return [];
    const cardinal = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    const diagonal = [{ r: -1, c: 1 }, { r: -1, c: -1 }, { r: 1, c: 1 }, { r: 1, c: -1 }];
    const allDirections = [...cardinal, ...diagonal];
    return getSlidingMoves(startR, startC, boardState, piece.color, allDirections);
}

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

function getPawnMoves(startR, startC, boardState, isCheckingAttack = false) {
    const legalMoves = [];
    const piece = boardState[startR][startC];
    if (!piece) return legalMoves; 
    
    const direction = (piece.color === 'Black') ? 1 : -1;
    const startingRow = (piece.color === 'White') ? 6 : 1;
    
    // 1. Forward Moves
    const oneStepR = startR + direction;
    if (oneStepR >= 0 && oneStepR < 8) {
        if (!boardState[oneStepR][startC]) {
            legalMoves.push({ r: oneStepR, c: startC });
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
    
    // 3. EN PASSANT CAPTURE LOGIC
    if (enPassantTarget) {
        const targetR = enPassantTarget.r;
        const targetC = enPassantTarget.c;
        const direction = (piece.color === 'Black') ? 1 : -1;

        const isDiagonalAttack = (startR + direction === targetR) && 
                                 (startC === targetC - 1 || startC === targetC + 1);

        const correctRank = (piece.color === 'White' && startR === 3) || 
                            (piece.color === 'Black' && startR === 4);

        if (isDiagonalAttack && correctRank) {
            legalMoves.push(enPassantTarget);
        }
    }
    
    return legalMoves;
}


// =========================================================
// === 3. CHECK & SAFETY LOGIC =============================
// =========================================================

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
    
    const testBoard = boardState.map(row => [...row]); 
    
    const movingPiece = testBoard[startR][startC];
    testBoard[endR][endC] = movingPiece;
    testBoard[startR][startC] = null;
    
    let kingPosition;
    if (piece.type === 'King') {
        kingPosition = { r: endR, c: endC }; 
    } else {
        kingPosition = findKing(playerColor, testBoard); 
    }
    
    if (!kingPosition) return true; 

    return isSquareAttacked(kingPosition.r, kingPosition.c, opponentColor, testBoard);
}

function checkCastling(startR, startC, pieceColor, boardState, opponentColor) {
    const castlingMoves = [];
    const initialRow = (pieceColor === 'White') ? 7 : 0;
    
    if (startR !== initialRow || startC !== 4) return castlingMoves; 

    const KingHasMoved = (pieceColor === 'White') ? !canWhiteKingCastle : !canBlackKingCastle;
    if (KingHasMoved || isSquareAttacked(startR, startC, opponentColor, boardState)) {
        return castlingMoves; 
    }
    
    // KINGSIDE (Short)
    const K_RookMoved = (pieceColor === 'White') ? !canWhiteRookKCastle : !canBlackRookKCastle;
    if (!K_RookMoved && boardState[initialRow][7]?.type === 'Rook') {
        if (!boardState[initialRow][5] && !boardState[initialRow][6]) { // Path Clear
            if (!isSquareAttacked(initialRow, 5, opponentColor, boardState) && 
                !isSquareAttacked(initialRow, 6, opponentColor, boardState)) { // Path Safe
                castlingMoves.push({ r: initialRow, c: 6 }); // King moves to g-file
            }
        }
    }

    // QUEENSIDE (Long)
    const Q_RookMoved = (pieceColor === 'White') ? !canWhiteRookQCastle : !canBlackRookQCastle;
    if (!Q_RookMoved && boardState[initialRow][0]?.type === 'Rook') {
        if (!boardState[initialRow][1] && !boardState[initialRow][2] && !boardState[initialRow][3]) { // Path Clear
            if (!isSquareAttacked(initialRow, 2, opponentColor, boardState) && 
                !isSquareAttacked(initialRow, 3, opponentColor, boardState)) { // Path Safe
                castlingMoves.push({ r: initialRow, c: 2 }); // King moves to c-file
            }
        }
    }
    return castlingMoves;
}

// --- King Moves (Relies on checkCastling being defined above) ---
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

    if (isCheckingAttack) {
        return potentialMoves; 
    }
    
    const opponentColor = (piece.color === 'White') ? 'Black' : 'White';
    let finalLegalMoves = [];
    
    for (const move of potentialMoves) {
        if (!isSquareAttacked(move.r, move.c, opponentColor, boardState)) { 
            finalLegalMoves.push(move);
        }
    }
    
    finalLegalMoves = finalLegalMoves.concat(checkCastling(startR, startC, piece.color, boardState, opponentColor));

    return finalLegalMoves;
}

// =========================================================
// === 4. GAME END & REPETITION LOGIC ======================
// =========================================================

function hasLegalMoves(boardState, playerColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];

            if (piece && piece.color === playerColor) {
                const legalMoves = getLegalMovesForSelectedPiece(r, c);
                if (legalMoves.length > 0) {
                    return true;
                }
            }
        }
    }
    return false; 
}

function checkThreefoldRepetition() {
    const key = generatePositionKey(boardState);
    
    if (positionHistory[key] === 3) {
        return true;
    }
    return false;
}


function checkGameEnd(boardState) {
    const nextPlayerColor = (currentPlayer === 'White') ? 'Black' : 'White';
    const opponentColor = currentPlayer; 
    
    const movesAvailable = hasLegalMoves(boardState, nextPlayerColor);
    
    if (checkThreefoldRepetition()) {
        return 'Repetition Draw';
    }

    if (movesAvailable) {
        return null; 
    } else {
        const kingPosition = findKing(nextPlayerColor, boardState);
        if (!kingPosition) return 'Error: King not found';

        const inCheck = isSquareAttacked(kingPosition.r, kingPosition.c, opponentColor, boardState);
        
        if (inCheck) {
            return 'Checkmate';
        } else {
            return 'Stalemate';
        }
    }
}


// =========================================================
// === 5. NOTATION & DISAMBIGUATION LOGIC ==================
// =========================================================

/**
 * Checks if a piece (R, B, Q, N) at (startR, startC) can physically attack (endR, endC).
 */
function canConflicterReach(startR, startC, endR, endC, pieceType, boardState) {
    const piece = boardState[startR][startC];
    if (!piece) return false;

    let rawMoves = [];

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
    /*
    for (let i = 0; i < rawMoves.length; i++) {
        console.log(coordsToAlgebraic(rawMoves[i].r, rawMoves[i].c));
    } */
    
    
    return rawMoves;
    // console.log(rawMoves);
}

// --- NEW Helper Function: Check Conflict on a Clean Board ---

/**
 * Determines if a conflicting piece at (r, c) can move to the target 
 * (endR, endC) by temporarily clearing the destination square first.
 */
function isConflictingMovePossible(conflicterR, conflicterC, endR, endC, boardState) {
    
    // 1. Create a deep copy of the board to simulate a clean state
    const testBoard = boardState.map(row => [...row]);
    
    // 2. TEMPORARILY CLEAR the destination square. 
    // This is the square where the moving piece just landed (c3).
    testBoard[endR][endC] = null; 
    
    // 3. Now, call the safe, raw move checker on the clean test board.
    // We assume the piece at (conflicterR, conflicterC) is the piece to check.
    const conflictingPiece = testBoard[conflicterR][conflicterC];

    if (!conflictingPiece) return false; // Safety check
    
    // Check if the conflicting piece can reach the destination (which is now empty)
    const rawMoves = canConflicterReach(conflicterR, conflicterC, endR, endC, conflictingPiece.type, testBoard);

    // Check if the destination is included in the list of moves generated on the clean board.
    return rawMoves.some(move => move.r === endR && move.c === endC);
}


/**
 * Resolves ambiguity for non-pawn moves (e.g., Rad1 or R7d1).
 */
function resolveDisambiguation(startR, startC, endR, endC, pieceType, boardState) {
    if (pieceType === 'Pawn' || pieceType === 'King') return ''; 
    
    const piece = boardState[endR][endC];
    
    const playerColor = piece.color;
    
    // const playerColor = piece.color;
    
    let needsFile = false; 
    let needsRank = false; 

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const potentialConflicter = boardState[r][c];
            if (!potentialConflicter) continue;
            // if (r === startR && c === startC) continue;
            if (r === endR && c === endC) continue;
            if (potentialConflicter.color !== playerColor || potentialConflicter.type !== pieceType) continue;
        //    const pieceTypeConflicter = potentialConflicter.type; // <-- Get the type of the conflicting piece
        //    console.log(potentialConflicter);

            // Check if the conflicting piece can ALSO legally move to the destination
            /* const conflictingMoves = getLegalMovesForSelectedPiece(r, c);

            // const canMoveToDest = canConflicterReach(r, c, endR, endC, pieceTypeConflicter, boardState);
*/
            // let conflictingMoves = [];
        // const conflictPieceType = potentialConflicter.type; 

        /*/ CRITICAL: Call the RAW movement functions (not the final legal dispatcher)
        if (conflictPieceType === 'Rook') {
            conflictingMoves = getRookMoves(r, c, boardState, true);
        } else if (conflictPieceType === 'Knight') {
            conflictingMoves = getKnightMoves(r, c, boardState, true);
        } else if (conflictPieceType === 'Bishop') {
            conflictingMoves = getBishopMoves(r, c, boardState, true);
        } else if (conflictPieceType === 'Queen') {
            conflictingMoves = getQueenMoves(r, c, boardState, true);
        }
        // ... (Include logic for Bishop, Queen, King) ...
*/
        // Check if the conflicting piece can ALSO legally move to the destination
        const canMoveToDest = isConflictingMovePossible(r, c, endR, endC, boardState);
        

            if (canMoveToDest) {
                // Conflict found!
                if (startC === c) {
                    needsRank = true; // Same file -> Must use rank (R7d1)
                    console.log('needsRank');
                } else {
                    needsFile = true; // Different file -> Use file (Rad1)
                    console.log('needsFile');
                }
            }
        }
    }
        
    

    const startAlg = coordsToAlgebraic(startR, startC);
    
    if (needsFile &&  needsRank) return startAlg;
    // Highly ambiguous (e.g. three Rooks can move there) -> use both
    
    
    if (needsFile) {
        return startAlg.charAt(0);
    } 
    if (needsRank) {
        return startAlg.charAt(1);
    }

    return '';
}


// --- Notation Creator (Relies on resolveDisambiguation) ---
function createMoveNotation(startR, startC, endR, endC, pieceType, isCapture, promotionType, isCastling) {
    if (isCastling === 'kingside') return 'O-O';
    if (isCastling === 'queenside') return 'O-O-O';
    
    const endAlg = coordsToAlgebraic(endR, endC);
    const startAlg = coordsToAlgebraic(startR, startC);
    
    let notation = '';

    // Handle Pawns (cxd5, e4)
    if (pieceType === 'Pawn') {
        if (isCapture) {
            notation = startAlg.charAt(0) + 'x' + endAlg; 
        } else {
            notation = endAlg; 
        }
    } 
    
    // Handle Pieces (Rad1, Nxf3)
    else {
        let pieceLetter = pieceType.charAt(0).toUpperCase();
        if (pieceType === 'Knight') pieceLetter = 'N';

        notation = pieceLetter;

        notation += resolveDisambiguation(startR, startC, endR, endC, pieceType, boardState);

        if (isCapture) notation += 'x'; 

        notation += endAlg;
    }

    // Add Promotion
    if (promotionType) {
        notation += '=' + promotionType.charAt(0).toUpperCase();
    }
    const nextPlayer = (currentPlayer) ? 'Black' : 'White'; 
    const checkStatus = getCheckStatus(boardState, nextPlayer);
    
    notation += checkStatus;
    
    return notation;
}

// --- FEN Key Generator (Relies on basic constants) ---
function generatePositionKey(boardState) {
    let fen = '';

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

    fen += ' ' + (currentPlayer === 'White' ? 'b' : 'w');

    let castlingRights = '';
    if (canWhiteKingCastle) castlingRights += 'K';
    if (canWhiteRookQCastle) castlingRights += 'Q'; 
    if (canBlackKingCastle) castlingRights += 'k';
    if (canBlackRookQCastle) castlingRights += 'q';
    fen += ' ' + (castlingRights || '-');
    
    fen += ' ' + (enPassantTarget ? coordsToAlgebraic(enPassantTarget.r, enPassantTarget.c) : '-'); 
    
    return fen;
}



// =========================================================
// === 6. TOP-LEVEL DISPATCHER & GAME FLOW =================
// =========================================================

// --- Top-Level Dispatcher (Relies on all get...Moves being defined) ---
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

function switchTurn() {
    currentPlayer = currentPlayer === 'White' ? 'Black' : 'White';
}


// --- Asynchronous Promotion Logic ---

/**
 * Displays the promotion modal and returns a Promise that resolves with the selected piece type.
 */
function promptPromotion(color) {
    return new Promise(resolve => {
        const promotionOptions = document.getElementById('promotion-options');
        promotionOptions.innerHTML = ''; 
        promotionModal.classList.remove('hidden');

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

async function checkPawnPromotion(endR, endC, color) {
    const promotionRank = (color === 'White') ? 0 : 7;
    
    if (boardState[endR][endC]?.type === 'Pawn' && endR === promotionRank) {
        
        const newPieceType = await promptPromotion(color);
        
        boardState[endR][endC] = {
            type: newPieceType,
            color: color
        };
        
        return true;
    }
    return false;
}

// --- Asynchronous Execution ---
async function executeMove(startR, startC, endR, endC) {
    const pieceToMove = boardState[startR][startC];
    
    // Data gathering BEFORE execution
    const isPawnMove = pieceToMove.type === 'Pawn';
    const isCastling = pieceToMove.type === 'King' && Math.abs(startC - endC) === 2;
    const isEnPassantExecution = isPawnMove && enPassantTarget && endR === enPassantTarget.r && endC === enPassantTarget.c && !boardState[endR][endC];
    const isCapture = !!boardState[endR][endC] || isEnPassantExecution; 
    
    let promotionType = null;
    let castlingType = isCastling ? ((endC === 6) ? 'kingside' : 'queenside') : null;
    
    // Reset En Passant Target (before setting new one)
    let newEnPassantTarget = null;
    
    // --- 1. Execution and Clearing ---

    if (isCastling) {
        const rookRow = startR; 
        let rookStartCol, rookEndCol;
        if (endC === 6) { rookStartCol = 7; rookEndCol = 5; } else if (endC === 2) { rookStartCol = 0; rookEndCol = 3; }
        
        const rookToMove = boardState[rookRow][rookStartCol];
        boardState[rookRow][rookEndCol] = rookToMove;
        boardState[rookRow][rookStartCol] = null;
    } else if (isEnPassantExecution) {
        // Clear the captured pawn
        const capturedPawnRow = (pieceToMove.color === 'White') ? endR + 1 : endR - 1;
        boardState[capturedPawnRow][endC] = null; 
    }

    // Standard Placement
    boardState[endR][endC] = pieceToMove;
    boardState[startR][startC] = null;
    
    // --- 2. FLAG UPDATES & SPECIAL MOVES SET ---

    // Update Castling Rights
    if (pieceToMove.type === 'King') {
        if (pieceToMove.color === 'White') { canWhiteKingCastle = false; canWhiteRookKCastle = false; canWhiteRookQCastle = false;
        } else {
            canBlackKingCastle = false;
            canBlackRookKCastle = false;
            canBlackRookQCastle = false;
        }
    } else if (pieceToMove.type === 'Rook') { /* ... */ }

    // Set NEW En Passant Target
    if (isPawnMove) {
        const rowDiff = Math.abs(startR - endR);
        if (rowDiff === 2) {
            const direction = (pieceToMove.color === 'White') ? 1 : -1;
            newEnPassantTarget = { r: endR + direction, c: endC };
        }
    }
    
    enPassantTarget = newEnPassantTarget; 
    
    // --- 3. PAWN PROMOTION CHECK (Awaits User Input) ---
    if (isPawnMove) {
        const promotionResult = await checkPawnPromotion(endR, endC, pieceToMove.color); 
        if (promotionResult) { promotionType = boardState[endR][endC].type;
        }
    }
    
    // --- 4. RECORD MOVE HISTORY & FEN ---
    
    const notation = createMoveNotation(
        startR, startC, endR, endC, pieceToMove.type, isCapture, promotionType, castlingType
    );
    gameMovesHistory.push(notation);

    const key = generatePositionKey(boardState); 
    positionHistory[key] = (positionHistory[key] || 0) + 1;
    
    // Record the last move visually
    lastMove.start = { r: startR, c: startC };
    lastMove.end = { r: endR, c: endC };

    renderBoard(isBoardFlip);
    displayCurrentFEN(boardState);
    displayMoveHistory();
}

// --- Main Handler must be ASYNC ---
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
            
            // 3. Check the game status for the player who just moved (Winner)
            const gameResult = checkGameEnd(boardState);
            
            if (gameResult) {
                const winningColor = currentPlayer;
                promptGameResult(gameResult, winningColor); 
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


// =========================================================
// === 7. RENDERING & UI & INITIALIZATION ==================
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

function promptGameResult(result, winningColor) {
    let headerText = '';
    let messageText = '';
    
    if (result === 'Checkmate') {
        const losingColor = winningColor === 'White' ? 'Black' : 'White';
        
        // --- 1. Apply LOSER Effect to King's Square ---
        const kingLosingPos = findKing(losingColor, boardState);
        if (kingLosingPos) {
            const kingSquare = document.querySelector(`[data-row='${kingLosingPos.r}'][data-col='${kingLosingPos.c}']`);
            if (kingSquare) {
                kingSquare.classList.remove('in-check'); 
                kingSquare.classList.add('checkmated'); 
            }
        }            
        // --- 2. Apply WINNER Effect to Attacker's Square ---
        const kingWinPos = findKing(winningColor, boardState);
        if (kingWinPos) {
            const kingSquare = document.querySelector(`[data-row='${kingWinPos.r}'][data-col='${kingWinPos.c}']`);
    
            if (kingSquare) {
                // Apply final winner highlight
                kingSquare.classList.add('checkmate-winner');
            }
        }

        // headerText = 'CHECKMATE!';
        // messageText = `${winningColor} wins the game!`;
        // gameOverHeader.style.color = '#cc0000';
        gameResultStatus = (winningColor === 'White') ? '1-0' : '0-1';
        
        generatePGN();

    } else if (result === 'Stalemate' || result === 'Repetition Draw') {
        headerText = (result === 'Stalemate') ? 'STALEMATE!' : 'DRAW!';
        messageText = (result === 'Stalemate') ? 'The game is a draw.' : 'The same position occurred three times.';
        gameOverHeader.style.color = '#333333';
        gameResultStatus = "1/2-1/2";
        gameOverModal.classList.remove('hidden');
        generatePGN();
    } else {
        return;
    }
    
    gameOverHeader.textContent = headerText;
    gameOverMessage.textContent = messageText;
    // gameOverModal.classList.remove('hidden');
}


function renderBoard(isBoardFlip) {
    
    // Check Status for Rendering
    const nextPlayerColor = (currentPlayer === 'White') ? 'Black' : 'White';
    const opponentColor = currentPlayer; 
    const kingPosition = findKing(nextPlayerColor, boardState);
    let inCheck = false;
    if (kingPosition) {
        inCheck = isSquareAttacked(kingPosition.r, kingPosition.c, opponentColor, boardState);
    }
    
    const chessboard = document.getElementById('chessboard');
    chessboard.innerHTML = ''; 

    const rows = isBoardFlip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = isBoardFlip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (const r of rows) {
        for (const c of cols) {
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
        
            // Apply last move highlights
            if (lastMove.start && lastMove.end) {
                if (r === lastMove.start.r && c === lastMove.start.c) {
                    square.classList.add('last-move-start');
                }
                if (r === lastMove.end.r && c === lastMove.end.c) {
                    square.classList.add('last-move-end');
                }
            }
        
            // Apply in-check highlight
            if (inCheck && kingPosition && r === kingPosition.r &&  c === kingPosition.c) {
                square.classList.add('in-check');
            }
            
            square.addEventListener('click', handleSquareClick);
            chessboard.appendChild(square);
        }
    }
}

function displayCurrentFEN(boardState) {
    let fenElement = document.getElementById('current-fen');
    if (!fenElement) console.log('FEN Render Element Missing.');
    fenElement.value = generatePositionKey(boardState);
}

function displayMoveHistory() {
    let historyElement = document.getElementById('move-history');
    if (!historyElement) {
        historyElement = document.createElement('div');
        historyElement.id = 'move-history';
        document.body.appendChild(historyElement); 
    }

    historyElement.innerHTML = '<h4>Game History</h4><ol></ol>';
    const ol = historyElement.querySelector('ol');
    
    
    for (let i = 0; i < gameMovesHistory.length; i++) {
        const move = gameMovesHistory[i];
        
        // White's move: Start new list item
        if (i % 2 === 0) {
            const li = document.createElement('li');
            li.className = 'white-turn';
            
            // White's move number and notation
            li.innerHTML = `<span class="move-number-turn">${(i / 2) + 1}.</span><span class="white-move">${move}</span>`;
            
            ol.appendChild(li);
        } 
        // Black's move: Append to the current list item
        else {
            const li = ol.lastElementChild;
            if (li) {
                li.className = 'black-turn';
                // Append Black's move, using margin-left: auto to push it right
                li.innerHTML += `<span class="black-move">${move}</span>`;
            }
        }
    }
}

function generatePGN() {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
    
    let pgn = `[Event "?"]
[Site "?"]
[Date "${date}"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "${gameResultStatus}"]

`;

    let moveText = '';
    
    for (let i = 0; i < gameMovesHistory.length; i++) {
        const move = gameMovesHistory[i];
        
        if (i % 2 === 0) {
            moveText += `${(i / 2) + 1}. `;
        }
        
        moveText += move;
        
        if (i === gameMovesHistory.length - 1) {
            const nextPlayer = (i % 2 === 0) ? 'Black' : 'White'; 
            const checkStatus = getCheckStatus(boardState, nextPlayer);
            moveText += checkStatus;
        }

        moveText += ' ';
    }
    
    pgn += moveText.trim();
    pgn += ' ' + gameResultStatus;

    console.log("--- PGN Output ---");
    console.log(pgn);
    console.log("------------------");
    
    return pgn;
}

function getCheckStatus(boardState, nextPlayerColor) {
    const opponentColor = (nextPlayerColor === 'White') ? 'Black' : 'White';
    const kingPos = findKing(nextPlayerColor, boardState);
    if (!kingPos) return '';

    const inCheck = isSquareAttacked(kingPos.r, kingPos.c, opponentColor, boardState);
    
    if (checkGameEnd(boardState) === 'Checkmate') {
        return '#'; 
    } else if (inCheck) {
        return '+'; 
    }
    return '';
}

function toggleFlip() {
    const chessboard = document.getElementById('chessboard');
    chessboard.classList.toggle('flipped');
    isBoardFlip = !isBoardFlip;
    renderBoard(isBoardFlip);
    renderCoordinates(isBoardFlip);
}

// Handles Invalid FEN String Call to Render Board from USER INPUT
function setupFenLoader() {
    const fenInput = document.getElementById('fen-input');
    const loadButton = document.getElementById('load-fen-button');
    
    if (fenInput && loadButton) {
        loadButton.addEventListener('click', () => {
            const fenString = fenInput.value.trim();
            if (fenString) {
                // Ensure moves history is cleared when loading a new position
                gameMovesHistory = []; 
                positionHistory = {};
                
                try {
                    // Call the existing function to parse and render
                    loadFEN(fenString);
                } catch (error) {
                    alert("Invalid FEN string provided. Please check the format.");
                    console.error("FEN Loading Error:", error);
                }
            }
        });
    }
}

async function copyFEN(e) {
    const cfen = document.getElementById('current-fen');
    // Select the text field
    // cfen.select();
    // cfen.setSelectionRange(0, 99999); // For mobile devices

    try {
        await navigator.clipboard.writeText(cfen);
        e.textContent = 'Copied';
        // Optional: Provide user feedback (e.g., alert, change button text)
    } catch (err) {
        console.error('Failed to copy text: ', err);
        e.textContent = 'Failed';
        // Handle error (e.g., show an error message to the user)
    }
}

function renderCoordinates(isFlipped) {
    const ranksContainer = document.getElementById('ranks');
    const filesContainer = document.getElementById('files-bottom');
    
    ranksContainer.innerHTML = '';
    filesContainer.innerHTML = '';
    
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    const displayFiles = isFlipped ? [...files].reverse() : files;
    const displayRanks = isFlipped ? [...ranks].reverse() : ranks;
    
    displayRanks.forEach(rank => {
        const label = document.createElement('label');
        label.textContent = rank;
        ranksContainer.appendChild(label);
    });

    displayFiles.forEach(file => {
        const label = document.createElement('label');
        label.textContent = file;
        filesContainer.appendChild(label);
    });
} 


// --- FINAL INITIALIZATION ---
window.onload = function() {
    promotionModal = document.getElementById('promotion-modal');
    gameOverModal = document.getElementById('game-over-modal');
    gameOverHeader = document.getElementById('game-over-header');
    gameOverMessage = document.getElementById('game-over-message');
    newGameButton = document.getElementById('new-game-button');
    closeGameOverDialog = document.getElementById('close-game-over-dialog'); 
    
    if (!gameOverModal) { console.error("Game Over modal HTML structure not found!"); }
    
    if (newGameButton) {
        newGameButton.addEventListener('click', () => {
            location.reload(); 
        });
    }
        
    const flip = document.getElementById('flip');
    const init = document.getElementById('init');
    
    if (flip) {
        flip.addEventListener('click', toggleFlip);
    }
    
    if (init) {
        init.addEventListener('click', () => {
            location.reload();
        });
    }
    
    if (closeGameOverDialog) {
        closeGameOverDialog.addEventListener('click', () => {
            gameOverModal.classList.add('hidden');
        });
    }
    
    // document.getElementById('copy-fen-button').addEventListener('click', copyFEN); 

    if (document.getElementById('chessboard')) {
        // renderBoard(isBoardFlip);


        // CRITICAL: Call the setup function to activate the input/button
        setupFenLoader(); 
        
        // Instead of calling loadFEN here, render the default board if no input
        if (document.getElementById('fen-input').value === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -") {
            // Load the default FEN (standard start position) on page load
            loadFEN(document.getElementById('fen-input').value);
        }
        
        renderCoordinates(isBoardFlip);
    } else {
        console.error("Error: Could not find the #chessboard element in the HTML.");
    }
}
