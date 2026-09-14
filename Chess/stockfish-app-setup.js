/**
 * STOCKFISH APP SETUP
 * 
 * This script integrates Stockfish engine with your existing chess app.
 * It should be loaded AFTER both main.js and stockfish-integration-for-your-app.js
 * 
 * What it does:
 * 1. Initializes the Stockfish engine
 * 2. Handles "Play vs Engine" button
 * 3. Handles "Analyze Game" button
 * 4. Manages game flow when playing against engine
 */

// =========================================================
// GLOBAL STATE FOR ENGINE GAMEPLAY
// =========================================================

let engine = null;
let isPlayingVsEngine = false;
let playerColor = 'White'; // Player is always White initially
let gameStartFEN = null;

// =========================================================
// INITIALIZE ENGINE ON PAGE LOAD
// =========================================================

window.addEventListener('load', () => {
  // Initialize the Stockfish engine
  engine = new StockfishEngine();
  
  // Wait a moment for the UI to be fully loaded
  setTimeout(() => {
    setupEventListeners();
    console.log('✓ Chess app with Stockfish ready');
  }, 500);
});

// =========================================================
// EVENT LISTENERS
// =========================================================

function setupEventListeners() {
  const playVsEngineBtn = document.getElementById('play-vs-engine-btn');
  const analyzeGameBtn = document.getElementById('analyze-game-btn');
  const newGameBtn = document.getElementById('init');

  if (playVsEngineBtn) {
    playVsEngineBtn.addEventListener('click', startPlayVsEngine);
  }

  if (analyzeGameBtn) {
    analyzeGameBtn.addEventListener('click', analyzeGameHandler);
  }

  // Hook into existing new game button to reset engine state
  if (newGameBtn) {
    const originalNewGameClick = newGameBtn.onclick;
    newGameBtn.addEventListener('click', () => {
      resetEngineState();
      if (originalNewGameClick) originalNewGameClick();
    });
  }
}

// =========================================================
// PLAY VS ENGINE
// =========================================================

/**
 * Start a new game where player plays against the engine
 */
function startPlayVsEngine() {
  // Reset the board
  boardState = [
    [{ type: 'Rook', color: 'Black' }, { type: 'Knight', color: 'Black' }, { type: 'Bishop', color: 'Black' }, { type: 'Queen', color: 'Black' }, { type: 'King', color: 'Black' }, { type: 'Bishop', color: 'Black' }, { type: 'Knight', color: 'Black' }, { type: 'Rook', color: 'Black' }],
    [{ type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }],
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    [{ type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }],
    [{ type: 'Rook', color: 'White' }, { type: 'Knight', color: 'White' }, { type: 'Bishop', color: 'White' }, { type: 'Queen', color: 'White' }, { type: 'King', color: 'White' }, { type: 'Bishop', color: 'White' }, { type: 'Knight', color: 'White' }, { type: 'Rook', color: 'White' }]
  ];

  // Reset game state
  currentPlayer = 'White';
  selectedSquare = null;
  gameMovesHistory = [];
  positionHistory = {};
  canWhiteKingCastle = true;
  canWhiteRookQCastle = true;
  canBlackKingCastle = true;
  canBlackRookQCastle = true;
  enPassantTarget = null;
  lastMove = { start: null, end: null };

  isPlayingVsEngine = true;
  playerColor = 'White';
  gameStartFEN = generatePositionKey(boardState);

  // Update UI
  renderBoard(isBoardFlip);
  displayCurrentFEN(boardState);
  displayMoveHistory();
  engine.updateEngineStatus('ready');

  console.log('✓ Started new game vs Stockfish');
  console.log(`You are playing as ${playerColor}`);
}

/**
 * Check if it's the engine's turn and play a move
 */
async function playEngineMove() {
  if (!isPlayingVsEngine) return;

  const engineColor = playerColor === 'White' ? 'Black' : 'White';
  if (currentPlayer !== engineColor) return;

  // Update status
  engine.updateEngineStatus('thinking');

  try {
    const fen = generatePositionKey(boardState);
    const engineMove = await engine.getBestMove(fen, 18);

    if (engineMove && engineMove.move) {
      const coords = engine.algebraicToCoords(engineMove.move);
      
      if (coords) {
        // Execute the move
        await executeMove(coords.startR, coords.startC, coords.endR, coords.endC);

        // Display evaluation
        let evalText = '';
        if (engineMove.mate) {
          evalText = `♔ Mate in ${Math.abs(engineMove.mate)}`;
        } else {
          const cp = (engineMove.evaluation / 100).toFixed(2);
          evalText = `📊 Eval: ${cp}`;
        }

        engine.updateEngineStatus(`Engine moved: ${engineMove.move} (${evalText})`);
        
        return engineMove;
      }
    }
  } catch (error) {
    console.error('Engine move error:', error);
    engine.updateEngineStatus('error');
  }

  return null;
}

/**
 * Override the original handleSquareClick to integrate engine moves
 * This is called after each player move
 */
const originalHandleSquareClick = handleSquareClick;
if (originalHandleSquareClick) {
  window.handleSquareClick = async function(event) {
    // Call original handler
    const result = await originalHandleSquareClick.call(this, event);
    
    // If playing vs engine and it's the engine's turn, play its move
    if (isPlayingVsEngine && currentPlayer !== playerColor && !gameOverModal.classList.contains('hidden')) {
      // Game over, don't play engine move
      return result;
    }

    if (isPlayingVsEngine && currentPlayer !== playerColor) {
      // Small delay for better UX
      setTimeout(() => playEngineMove(), 500);
    }

    return result;
  };
}

// =========================================================
// ANALYZE GAME
// =========================================================

/**
 * Analyze the completed game using Stockfish
 */
async function analyzeGameHandler() {
  if (gameMovesHistory.length === 0) {
    alert('No game to analyze. Play some moves first!');
    return;
  }

  // Get the initial board state (before any moves)
  let initialBoard = [
    [{ type: 'Rook', color: 'Black' }, { type: 'Knight', color: 'Black' }, { type: 'Bishop', color: 'Black' }, { type: 'Queen', color: 'Black' }, { type: 'King', color: 'Black' }, { type: 'Bishop', color: 'Black' }, { type: 'Knight', color: 'Black' }, { type: 'Rook', color: 'Black' }],
    [{ type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }, { type: 'Pawn', color: 'Black' }],
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    [{ type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }, { type: 'Pawn', color: 'White' }],
    [{ type: 'Rook', color: 'White' }, { type: 'Knight', color: 'White' }, { type: 'Bishop', color: 'White' }, { type: 'Queen', color: 'White' }, { type: 'King', color: 'White' }, { type: 'Bishop', color: 'White' }, { type: 'Knight', color: 'White' }, { type: 'Rook', color: 'White' }]
  ];

  // Show loading message
  const reviewContainer = document.getElementById('review-container');
  if (reviewContainer) {
    reviewContainer.innerHTML = '<div style="padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center;">📊 Analyzing game... (this may take a minute)</div>';
  }

  try {
    // Run the analysis
    await engine.analyzeGame(gameMovesHistory, initialBoard);

    // Show review UI
    const review = new GameReviewUI('#review-container', engine);
    
    console.log('✓ Game analysis complete');
  } catch (error) {
    console.error('Analysis error:', error);
    if (reviewContainer) {
      reviewContainer.innerHTML = '<div style="padding: 20px; background: #ffebee; border-radius: 8px; color: #c62828;">❌ Error during analysis</div>';
    }
  }
}

// =========================================================
// HELPER FUNCTIONS
// =========================================================

/**
 * Reset engine state (called when starting a new game)
 */
function resetEngineState() {
  isPlayingVsEngine = false;
  selectedSquare = null;
  if (engine) {
    engine.updateEngineStatus('ready');
  }
}

/**
 * Get current game summary
 */
function getGameSummary() {
  return {
    moves: gameMovesHistory.length,
    currentPlayer: currentPlayer,
    isPlayingVsEngine: isPlayingVsEngine,
    playerColor: playerColor
  };
}

/**
 * Helper to convert any move notation to coordinates
 * Useful if your app uses different notation than algebraic
 */
function notationToCoords(notation) {
  if (engine) {
    return engine.algebraicToCoords(notation);
  }
  return null;
}

// =========================================================
// CONSOLE API (for debugging)
// =========================================================

// Make engine API available in console
window.chessEngine = {
  getEngine: () => engine,
  getBestMove: (fen, depth) => engine?.getBestMove(fen, depth),
  analyzePosition: (fen, depth) => engine?.getPositionEvaluation(fen, depth),
  getStats: () => engine?.getAnalysisStats(),
  startVsEngine: () => startPlayVsEngine(),
  analyzeGame: () => analyzeGameHandler(),
  getGameSummary: () => getGameSummary()
};

console.log('✓ Stockfish API available. Try: window.chessEngine.getGameSummary()');
