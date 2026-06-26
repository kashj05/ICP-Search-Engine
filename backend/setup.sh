#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  ObserveNow.ai — ICP Engine  |  Full Setup & Launch
# ════════════════════════════════════════════════════════════════
#
#  USAGE:
#    chmod +x setup.sh
#    ./setup.sh
#
#  What this does:
#    1. Installs Python dependencies (Flask, flask-cors)
#    2. Installs Node/React dependencies
#    3. Starts the Flask API on port 5000 (background)
#    4. Starts the React dev server on port 3000
#
#  After running: open http://localhost:3000
# ════════════════════════════════════════════════════════════════

set -e  # exit on any error

# ── Colours ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  ObserveNow · ICP Engine Setup         ${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Python deps ───────────────────────────────────────────
echo -e "${YELLOW}[1/4] Installing Python dependencies...${NC}"
pip install flask flask-cors --quiet
echo -e "${GREEN}✓ Flask & flask-cors ready${NC}"

# ── Step 2: Check enriched_dataset.json ──────────────────────────
if [ ! -f "enriched_dataset.json" ]; then
  echo "ERROR: enriched_dataset.json not found in current directory."
  echo "       Place it here: $(pwd)/enriched_dataset.json"
  exit 1
fi
echo -e "${GREEN}✓ enriched_dataset.json found${NC}"

# ── Step 3: Node deps ─────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/4] Installing React dependencies (this may take a minute)...${NC}"
npm install --silent
echo -e "${GREEN}✓ Node modules ready${NC}"

# ── Step 4: Start Flask API in background ─────────────────────────
echo ""
echo -e "${YELLOW}[3/4] Starting Flask API on http://localhost:5000 ...${NC}"
python api.py &
FLASK_PID=$!
echo -e "${GREEN}✓ Flask started (PID $FLASK_PID)${NC}"

# Wait for Flask to be ready
echo "   Waiting for API to be ready..."
for i in {1..15}; do
  if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API is live${NC}"
    break
  fi
  sleep 1
done

# ── Step 5: Start React dev server ───────────────────────────────
echo ""
echo -e "${YELLOW}[4/4] Starting React app on http://localhost:3000 ...${NC}"
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Everything running!                   ${NC}"
echo -e "${GREEN}                                        ${NC}"
echo -e "${GREEN}  React UI:  http://localhost:3000      ${NC}"
echo -e "${GREEN}  Flask API: http://localhost:5000      ${NC}"
echo -e "${GREEN}                                        ${NC}"
echo -e "${GREEN}  Press Ctrl+C to stop                  ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

# Cleanup Flask when React exits
trap "echo ''; echo 'Stopping...'; kill $FLASK_PID 2>/dev/null; exit 0" SIGINT SIGTERM

npm start
