# Stockfish Integration Guide for Your Chess App

A complete guide to integrating Stockfish engine with your vanilla JavaScript chess game.

## 📋 Quick Overview

Your chess app has a solid architecture:
- **Board**: 8×8 2D array (`boardState`)
- **Moves**: Algebraic notation in `gameMovesHistory`
- **FEN**: Generated via `generatePositionKey(boardState)`
- **Execution**: Through `executeMove(startR, startC, endR, endC)`

The Stockfish integration adds:
1. **Real-time engine evaluation** while you play
2. **Play vs Engine** mode with automatic moves
3. **Complete game analysis** after the game ends
4. **Move quality assessment** (blunders, mistakes, good moves)

## 🚀 Installation Steps

### Step 1: Replace Your HTML File

Replace your `index.html` with `index-with-stockfish.html`:

```bash
# Backup your original
cp index.html index-original.html

# Use the new one with Stockfish integration
cp index-with-stockfish.html index.html
```

**What's different in the new HTML:**
- Added Stockfish engine status display
- Added "⚔️ Play vs Engine" button
- Added "📊 Analyze Game" button
- Loaded Stockfish.wasm from CDN
- Added the integration scripts

### Step 2: Add Integration Files

Copy these files to your project folder:

1. **`stockfish-integration-for-your-app.js`**
   - Core engine wrapper (Stockfish communication)
   - Game analysis engine
   - Review UI component

2. **`stockfish-app-setup.js`**
   - Hooks into your existing game
   - Manages button events
   - Handles game flow with engine

### Step 3: Verify File Structure

Your project should now look like:

```
ChessApp/
├── index.html (updated with Stockfish)
├── main.js (your original chess engine)
├── style.css (your original styles)
├── img/
│   └── (piece images)
├── stockfish-integration-for-your-app.js (new)
└── stockfish-app-setup.js (new)
```

### Step 4: Test It

Open `index.html` in your browser. You should see:
- ✓ "⏳ Loading Stockfish Engine..." message
- ✓ After ~2 seconds: "✓ Engine Ready"
- ✓ New "Play vs Engine" and "Analyze Game" buttons

## 🎮 Usage

### Playing vs Stockfish

1. **Click "⚔️ Play vs Engine"**
   - Board resets to starting position
   - You play as White
   - Engine plays as Black

2. **Make your move** like normal
   - Click piece → Click destination
   - Engine automatically responds

3. **Engine evaluation** shown in status bar
   - Displays the engine's evaluation after each move

### Analyzing Your Game

1. **Play a game** (vs engine, or human vs human)

2. **Click "📊 Analyze Game"**
   - Stockfish analyzes each move (may take 1-2 minutes)
   - Shows move quality and evaluations

3. **Review interface appears**
   - Statistics: Blunders, mistakes, accuracy
   - Move list with quality indicators
   - Navigate with Previous/Next buttons

### Game Review Details

The review shows:
- **❌ Blunders** (evaluated as big mistakes, >300 centipawns)
- **⚠️ Mistakes** (>150 centipawns)
- **~  Inaccuracies** (>50 centipawns)
- **✓ Excellent** (good moves)
- **✨ Brilliant** (unexpected strong moves)

## 🔧 How It Works

### Architecture

```
Your Chess App (main.js)
    ↓
handleSquareClick() → executeMove()
    ↓
stockfish-app-setup.js (hooks events)
    ↓
StockfishEngine class (manages Stockfish.wasm)
    ↓
Web Worker (background thread with engine)
```

### Key Integration Points

#### 1. **Game Initialization**
When page loads, `stockfish-app-setup.js` runs:
```javascript
window.addEventListener('load', () => {
  engine = new StockfishEngine();  // Initialize Stockfish
  setupEventListeners();           // Hook button events
});
```

#### 2. **Playing vs Engine**
When you click "Play vs Engine":
```javascript
startPlayVsEngine()
  → Resets your board
  → Sets isPlayingVsEngine = true
  → You play White, Engine plays Black
```

After each of your moves:
```javascript
handleSquareClick() calls executeMove()
  → Your move executes
  → playEngineMove() is called
  → Engine picks its move
  → Move is executed automatically
```

#### 3. **Move Conversion**
Stockfish uses algebraic notation (e.g., "e2e4")
Your board uses coordinates (e.g., startR=6, startC=4, endR=4, endC=4)

Conversion happens in:
```javascript
engine.algebraicToCoords(moveNotation)
// Returns: {startR, startC, endR, endC}
```

#### 4. **Game Analysis**
When you click "Analyze Game":
```javascript
analyzeGameHandler()
  → Gets all moves from gameMovesHistory
  → Calls engine.analyzeGame()
  → For each move, evaluates the position
  → Assesses move quality
  → Displays GameReviewUI with results
```

## ⚙️ Configuration

### Engine Depth

Change how deep Stockfish searches (deeper = more accurate but slower):

**In `stockfish-app-setup.js`, find:**
```javascript
const engineMove = await engine.getBestMove(fen, 18);  // <-- This number
```

**Recommended values:**
- `12-15`: Fast (0.1-0.5 seconds per move)
- `18-20`: Balanced (1-3 seconds per move)
- `22+`: Deep (5+ seconds per move)

**For analysis**, find:
```javascript
await engine.analyzeGame(gameMovesHistory, initialBoard);
// Internally uses depth 18 - can be modified in the JS file
```

### Play as Black

To play as Black instead of White, in `stockfish-app-setup.js`:

```javascript
playerColor = 'Black';  // Change from 'White'
```

Then in `startPlayVsEngine()`, the engine will play first.

## 🐛 Troubleshooting

### Issue: "Stockfish not loading"

**Solution:**
- Check browser console (F12 → Console)
- Look for CORS errors
- Verify CDN is accessible: https://cdn.jsdelivr.net/npm/stockfish@16.1.0/src/stockfish.js
- Try a different CDN or download Stockfish locally

### Issue: "Engine is very slow"

**Solution:**
- Reduce depth: Change `18` to `15` in `stockfish-app-setup.js`
- Engine runs in background, so UI shouldn't freeze
- First move takes longer (engine initialization)

### Issue: "Moves not playing after I click"

**Solution:**
- Verify `isPlayingVsEngine` is `true`
- Check browser console for JavaScript errors
- Make sure you're playing as White (currently hardcoded)
- Verify your `executeMove()` function is working

### Issue: "Analysis never completes"

**Solution:**
- Analysis takes time (~1 minute for 50+ moves)
- Keep browser tab active (background tabs slow down)
- Reduce number of moves to analyze
- Decrease depth (currently 18)

## 📊 Console Debugging

You can debug in the browser console (F12 → Console):

```javascript
// Get engine instance
window.chessEngine.getEngine()

// Get best move for current position
await window.chessEngine.getBestMove(generatePositionKey(boardState), 20)

// Get game statistics
window.chessEngine.getGameSummary()

// Manually start vs engine
window.chessEngine.startVsEngine()

// Manually analyze
window.chessEngine.analyzeGame()
```

## 🔄 How to Customize

### Change Engine Depth During Game

Add this to your HTML:
```html
<label>Engine Depth:
  <input type="number" id="engine-depth" value="18" min="8" max="24">
</label>
```

Then in `stockfish-app-setup.js`:
```javascript
async function playEngineMove() {
  const depth = document.getElementById('engine-depth').value || 18;
  const engineMove = await engine.getBestMove(fen, parseInt(depth));
  // ... rest of function
}
```

### Add Time Controls

To limit engine thinking time:
```javascript
// Set up time tracking
let thinkStartTime = Date.now();
const MAX_THINK_TIME = 3000; // 3 seconds

// In playEngineMove:
const engineMove = await engine.getBestMove(fen, depth);
const thinkTime = Date.now() - thinkStartTime;
console.log(`Engine thought for ${thinkTime}ms`);
```

### Export Analysis as PGN

Add to `stockfish-app-setup.js`:
```javascript
function exportAnalysisAsPGN() {
  let pgn = '[Event "Analysis"]\n[Site "?"\n]\n\n';
  
  engine.analysisResults.forEach((result, i) => {
    if (i % 2 === 0) pgn += (Math.floor(i/2) + 1) + '. ';
    pgn += result.moveNotation + ' ';
  });
  
  return pgn;
}
```

## 📈 Performance Notes

**Memory Usage:**
- Stockfish.wasm: ~10-15 MB (loaded once, in Web Worker)
- Game data: ~1-2 KB per move

**Speed:**
- First engine move: 1-2 seconds (initialization)
- Subsequent moves: 0.5-3 seconds (depends on depth)
- Analysis of 50-move game: 2-5 minutes

**Best Practices:**
1. Use depth 15-18 for real-time play
2. Use depth 20+ only for post-game analysis
3. Analyze in batches if game is very long
4. Keep browser tab active during analysis

## 🎯 Next Steps

1. **Test basic functionality**
   - Open the app in your browser
   - Click "Play vs Engine"
   - Make a few moves
   - Verify engine responds

2. **Test analysis**
   - Play a complete game
   - Click "Analyze Game"
   - Wait for analysis to complete
   - Review the results

3. **Customize to your needs**
   - Adjust engine depth
   - Change button styles
   - Add more features

4. **Share with others**
   - Your app now has professional engine support!
   - People can train against Stockfish

## 🆘 Need Help?

**Check these files for reference:**
1. `stockfish-integration-for-your-app.js` - Engine API
2. `stockfish-app-setup.js` - Game flow integration
3. Browser console logs - Debugging info

**Common issues are usually:**
- Incorrect file paths
- Old browser (update to latest Chrome/Firefox)
- CORS errors (try different CDN)
- JavaScript errors (check console)

## 📚 Learn More

- **Stockfish**: https://stockfishchess.org/
- **FEN Format**: https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation
- **Chess Notation**: https://en.wikipedia.org/wiki/Algebraic_notation

---

Enjoy your enhanced chess app with Stockfish! 🚀
