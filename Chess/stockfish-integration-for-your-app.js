/**
 * STOCKFISH INTEGRATION FOR YOUR CHESS APP
 * 
 * Designed specifically for your chess app architecture:
 * - Works with your boardState (8x8 array)
 * - Uses your generatePositionKey() for FEN
 * - Hooks into your executeMove() for move execution
 * - Integrates with your UI and game flow
 * 
 * USAGE:
 * 1. Add this script to your HTML
 * 2. Initialize: const engine = new StockfishEngine();
 * 3. Get best move: const move = await engine.getBestMove(generatePositionKey(boardState), 20);
 * 4. Analyze game: await engine.analyzeGame(gameMovesHistory, boardState);
 */

class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.analysisResults = [];
    this.moveEvaluations = {};
    
    this.initWorker();
  }

  /**
   * Initialize Stockfish in a Web Worker
   */
  initWorker() {
    // Check if worker already exists (avoid multiple instances)
    if (window.stockfishWorker) {
      this.worker = window.stockfishWorker;
      return;
    }

    const workerCode = `
      let engine = null;
      let isReady = false;

      async function initEngine() {
        if (isReady) return;
        try {
          engine = await STOCKFISH();
          isReady = true;
          self.postMessage({ type: 'ready' });
        } catch (err) {
          console.error('Stockfish init failed:', err);
          self.postMessage({ type: 'error', error: err.message });
        }
      }

      self.onmessage = async (e) => {
        const { cmd, fen, depth } = e.data;

        if (cmd === 'init') {
          await initEngine();
          return;
        }

        if (cmd === 'eval' && engine && isReady) {
          engine.postMessage('ucinewgame');
          engine.postMessage(\`position fen \${fen}\`);
          engine.postMessage(\`go depth \${depth}\`);
          
          let bestMove = null;
          let evaluation = 0;
          let mate = null;

          const handler = (output) => {
            if (output.includes('bestmove')) {
              const match = output.match(/bestmove ([a-h1-8]{4})/);
              if (match) bestMove = match[1];
            }

            if (output.includes('info') && output.includes('score')) {
              const cpMatch = output.match(/score cp (-?\\d+)/);
              const mateMatch = output.match(/score mate (-?\\d+)/);
              
              if (mateMatch) {
                mate = parseInt(mateMatch[1]);
              } else if (cpMatch) {
                evaluation = parseInt(cpMatch[1]);
              }
            }

            if (bestMove) {
              engine.onmessage = null;
              self.postMessage({
                type: 'eval',
                bestMove: bestMove,
                evaluation: evaluation,
                mate: mate
              });
            }
          };

          engine.onmessage = handler;
        }
      };
    `;

    const blob = new Blob([
      `importScripts('https://cdn.jsdelivr.net/npm/stockfish@16.1.0/src/stockfish.js');`,
      workerCode
    ], { type: 'application/javascript' });

    this.worker = new Worker(URL.createObjectURL(blob));
    window.stockfishWorker = this.worker; // Cache globally

    // Handle worker messages
    this.worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        this.ready = true;
        console.log('✓ Stockfish Engine Ready');
        this.updateEngineStatus('ready');
      }
    };

    // Initialize the worker
    this.worker.postMessage({ cmd: 'init' });
  }

  /**
   * Get the best move for a position
   * @param {string} fen - FEN string from your generatePositionKey()
   * @param {number} depth - Search depth (12-20 recommended)
   * @returns {Promise<{move: string, evaluation: number, mate: null|number}>}
   */
  async getBestMove(fen, depth = 20) {
    return new Promise((resolve) => {
      if (!this.ready) {
        // Wait for engine to be ready
        const checkReady = setInterval(() => {
          if (this.ready) {
            clearInterval(checkReady);
            this.queryEngine(fen, depth, resolve);
          }
        }, 100);
        return;
      }
      
      this.queryEngine(fen, depth, resolve);
    });
  }

  /**
   * Internal function to query the engine
   */
  queryEngine(fen, depth, resolve) {
    const handler = (e) => {
      if (e.data.type === 'eval') {
        this.worker.onmessage = null;
        
        // Convert move notation from algebraic to your format
        const move = e.data.bestMove;
        
        resolve({
          move: move,              // "e2e4"
          evaluation: e.data.evaluation,
          mate: e.data.mate
        });
      }
    };

    this.worker.onmessage = handler;
    this.worker.postMessage({
      cmd: 'eval',
      fen: fen,
      depth: depth
    });
  }

  /**
   * Get move quality assessment
   * Useful for highlighting blunders, mistakes, good moves
   */
  assessMoveQuality(evaluation, mate) {
    if (mate) {
      return mate > 0 ? 'brilliant' : 'blunder';
    }

    const cp = Math.abs(evaluation);
    
    if (cp > 300) return 'blunder';      // ❌ Major blunder
    if (cp > 150) return 'mistake';      // ⚠️ Significant error
    if (cp > 50) return 'inaccuracy';    // 📉 Minor error
    return 'excellent';                  // ✓ Good move
  }

  /**
   * Convert algebraic move to your {startR, startC, endR, endC} format
   */
  algebraicToCoords(moveNotation) {
    if (!moveNotation || moveNotation.length < 4) return null;
    
    const files = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'e': 4, 'f': 5, 'g': 6, 'h': 7 };
    const ranks = { '8': 0, '7': 1, '6': 2, '5': 3, '4': 4, '3': 5, '2': 6, '1': 7 };
    
    const fromFile = moveNotation[0];
    const fromRank = moveNotation[1];
    const toFile = moveNotation[2];
    const toRank = moveNotation[3];
    
    if (!files[fromFile] || !ranks[fromRank] || !files[toFile] || !ranks[toRank]) {
      return null;
    }
    
    return {
      startR: ranks[fromRank],
      startC: files[fromFile],
      endR: ranks[toRank],
      endC: files[toFile]
    };
  }

  /**
   * Play engine move automatically
   * This executes the move in your game state
   */
  async playEngineMove() {
    const fen = generatePositionKey(boardState);
    const engineMove = await this.getBestMove(fen, 20);
    
    if (engineMove && engineMove.move) {
      const coords = this.algebraicToCoords(engineMove.move);
      if (coords) {
        // Execute the move using your game's executeMove function
        await executeMove(coords.startR, coords.startC, coords.endR, coords.endC);
        return engineMove;
      }
    }
    
    return null;
  }

  /**
   * Update UI status display
   */
  updateEngineStatus(status) {
    const statusElement = document.getElementById('engine-status');
    if (statusElement) {
      const messages = {
        'ready': '✓ Engine Ready',
        'thinking': '🤔 Thinking...',
        'error': '❌ Engine Error'
      };
      statusElement.textContent = messages[status] || status;
    }
  }

  /**
   * Analyze the entire game and assess move quality
   * Works with your gameMovesHistory and boardState
   */
  async analyzeGame(moveHistory, initialBoardState) {
    console.log(`Starting game analysis for ${moveHistory.length} moves...`);
    
    this.analysisResults = [];
    let currentFEN = generatePositionKey(initialBoardState);
    
    for (let i = 0; i < moveHistory.length; i++) {
      const moveNotation = moveHistory[i];
      
      // Evaluate position before the move
      const evaluation = await this.getBestMove(currentFEN, 18);
      
      // Assess quality
      const quality = this.assessMoveQuality(evaluation.evaluation, evaluation.mate);
      
      // Store result
      this.analysisResults.push({
        moveNumber: Math.floor(i / 2) + 1,
        moveNotation: moveNotation,
        quality: quality,
        evaluation: evaluation.evaluation,
        mate: evaluation.mate
      });
      
      // Update currentFEN for next move
      // NOTE: This is a simplified version - you may need to implement proper FEN updates
      const coords = this.algebraicToCoords(moveNotation);
      if (coords) {
        // Make a copy of the board and simulate the move
        let testBoard = JSON.parse(JSON.stringify(initialBoardState));
        // Apply move to testBoard
        testBoard[coords.endR][coords.endC] = testBoard[coords.startR][coords.startC];
        testBoard[coords.startR][coords.startC] = null;
        currentFEN = generatePositionKey(testBoard);
      }
      
      // Update progress
      if (i % 5 === 0) {
        console.log(`Analyzed ${i + 1}/${moveHistory.length} moves`);
      }
    }
    
    console.log('✓ Analysis complete');
    return this.analysisResults;
  }

  /**
   * Get statistics from analysis
   */
  getAnalysisStats() {
    if (this.analysisResults.length === 0) return null;
    
    const stats = {
      totalMoves: this.analysisResults.length,
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
      excellent: 0,
      brilliants: 0,
      accuracy: 0
    };
    
    this.analysisResults.forEach(result => {
      if (result.quality === 'blunder') stats.blunders++;
      else if (result.quality === 'mistake') stats.mistakes++;
      else if (result.quality === 'inaccuracy') stats.inaccuracies++;
      else if (result.quality === 'excellent') stats.excellent++;
      else if (result.quality === 'brilliant') stats.brilliants++;
    });
    
    stats.accuracy = Math.round(
      ((stats.excellent + stats.brilliants) / stats.totalMoves) * 100
    );
    
    return stats;
  }

  /**
   * Get evaluation for a specific position
   */
  async getPositionEvaluation(fen, depth = 20) {
    return this.getBestMove(fen, depth);
  }

  /**
   * Cleanup/shutdown engine
   */
  shutdown() {
    if (this.worker) {
      this.worker.terminate();
      this.ready = false;
    }
  }
}

/**
 * GAME REVIEW UI - Chess.com style analysis board
 * 
 * Shows move-by-move analysis with:
 * - Position evaluation
 * - Move quality (blunder, mistake, good, brilliant)
 * - Opening/endgame detection
 * - Statistics panel
 */
class GameReviewUI {
  constructor(containerSelector, engine) {
    this.container = document.querySelector(containerSelector);
    this.engine = engine;
    this.currentMoveIndex = 0;
    
    if (!this.container) {
      console.error('Review container not found:', containerSelector);
      return;
    }
    
    this.render();
    this.bindEvents();
  }

  render() {
    const stats = this.engine.getAnalysisStats();
    
    this.container.innerHTML = `
      <div style="background: #f9f9f9; border-radius: 8px; padding: 20px; margin-top: 20px;">
        <h2 style="margin-top: 0;">Game Review & Analysis</h2>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <!-- Stats Panel -->
          <div style="background: white; border-radius: 8px; padding: 15px; border: 1px solid #ddd;">
            <h3 style="margin-top: 0;">Statistics</h3>
            <div style="font-size: 13px; line-height: 1.8;">
              <div>📊 Total Moves: <strong>${stats ? stats.totalMoves : '-'}</strong></div>
              <div>❌ Blunders: <strong style="color: #d32f2f;">${stats ? stats.blunders : '-'}</strong></div>
              <div>⚠️ Mistakes: <strong style="color: #f57c00;">${stats ? stats.mistakes : '-'}</strong></div>
              <div>📈 Accuracy: <strong style="color: #388e3c;">${stats ? stats.accuracy : '-'}%</strong></div>
            </div>
          </div>

          <!-- Move Navigator -->
          <div style="background: white; border-radius: 8px; padding: 15px; border: 1px solid #ddd;">
            <h3 style="margin-top: 0;">Navigation</h3>
            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
              <button id="prev-move-btn" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">← Previous</button>
              <button id="next-move-btn" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Next →</button>
            </div>
            <div style="font-size: 12px; color: #666;">
              Move: <strong id="move-counter">-</strong>
            </div>
          </div>
        </div>

        <!-- Move List -->
        <div style="background: white; border-radius: 8px; padding: 15px; border: 1px solid #ddd; margin-bottom: 20px; max-height: 300px; overflow-y: auto;">
          <h3 style="margin-top: 0;">Moves</h3>
          <div id="move-list" style="font-family: monospace; font-size: 12px; line-height: 1.8;"></div>
        </div>

        <!-- Detailed Analysis -->
        <div id="detailed-analysis" style="background: white; border-radius: 8px; padding: 15px; border: 1px solid #ddd;">
          <h3 style="margin-top: 0;">Move Analysis</h3>
          <div id="analysis-content">Select a move to see details</div>
        </div>
      </div>
    `;

    this.updateDisplay();
  }

  bindEvents() {
    document.getElementById('prev-move-btn')?.addEventListener('click', () => {
      if (this.currentMoveIndex > 0) {
        this.currentMoveIndex--;
        this.updateDisplay();
      }
    });

    document.getElementById('next-move-btn')?.addEventListener('click', () => {
      if (this.currentMoveIndex < this.engine.analysisResults.length - 1) {
        this.currentMoveIndex++;
        this.updateDisplay();
      }
    });

    // Click on move in list
    this.container.addEventListener('click', (e) => {
      if (e.target.dataset.moveIndex !== undefined) {
        this.currentMoveIndex = parseInt(e.target.dataset.moveIndex);
        this.updateDisplay();
      }
    });
  }

  updateDisplay() {
    this.renderMoveList();
    this.renderAnalysis();
  }

  renderMoveList() {
    const moveList = document.getElementById('move-list');
    if (!moveList) return;

    const results = this.engine.analysisResults;
    if (results.length === 0) {
      moveList.innerHTML = 'No analysis data';
      return;
    }

    let html = '';
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const qualityEmoji = {
        'brilliant': '✨',
        'excellent': '✓',
        'inaccuracy': '~',
        'mistake': '⚠️',
        'blunder': '❌'
      };

      const selected = i === this.currentMoveIndex ? 'background: #e3f2fd;' : '';
      const emoji = qualityEmoji[result.quality] || '';

      html += `
        <div data-move-index="${i}" style="padding: 8px; margin: 3px 0; border-radius: 4px; cursor: pointer; ${selected}">
          <strong>${result.moveNotation}</strong> ${emoji} ${result.quality}
        </div>
      `;
    }

    moveList.innerHTML = html;
  }

  renderAnalysis() {
    const analysisContent = document.getElementById('analysis-content');
    const moveCounter = document.getElementById('move-counter');
    
    if (!analysisContent) return;

    const result = this.engine.analysisResults[this.currentMoveIndex];
    
    if (!result) {
      analysisContent.innerHTML = 'No data';
      return;
    }

    if (moveCounter) {
      moveCounter.textContent = `${this.currentMoveIndex + 1}/${this.engine.analysisResults.length}`;
    }

    const evalText = result.mate
      ? `Mate in ${Math.abs(result.mate)}`
      : `${(result.evaluation / 100).toFixed(2)}`;

    const qualityDetails = {
      'brilliant': { emoji: '✨', label: 'Brilliant Move', color: '#4caf50' },
      'excellent': { emoji: '✓', label: 'Excellent Move', color: '#4caf50' },
      'inaccuracy': { emoji: '~', label: 'Inaccuracy', color: '#ff9800' },
      'mistake': { emoji: '⚠️', label: 'Mistake', color: '#ff9800' },
      'blunder': { emoji: '❌', label: 'Blunder', color: '#d32f2f' }
    };

    const detail = qualityDetails[result.quality] || qualityDetails['excellent'];

    analysisContent.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div style="background: #f5f5f5; padding: 12px; border-radius: 4px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Move</div>
          <div style="font-size: 20px; font-weight: bold; font-family: monospace;">${result.moveNotation}</div>
        </div>

        <div style="background: #f5f5f5; padding: 12px; border-radius: 4px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Evaluation</div>
          <div style="font-size: 20px; font-weight: bold;">${evalText}</div>
        </div>

        <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; grid-column: 1/-1;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Move Quality</div>
          <div style="font-size: 18px; font-weight: bold; color: ${detail.color};">
            ${detail.emoji} ${detail.label}
          </div>
        </div>
      </div>
    `;
  }
}

console.log('✓ Stockfish integration loaded');
