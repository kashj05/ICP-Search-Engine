# ObserveNow.ai — ICP Engine  |  React + Flask

## Folder Structure
```
observenow/
├── api.py                   Flask REST API  (wraps run_icp.py)
├── run_icp.py               Search engine  (zero changes from Python/Streamlit)
├── enriched_dataset.json    1,159 companies / 2,808 contacts
├── package.json             React app config
├── setup.sh                 One-command setup & launch
├── public/
│   └── index.html           HTML shell
└── src/
    ├── index.js             React entry point
    └── App.js               Complete React application
```

### Manual Start

**Terminal 1 — Flask API:**
```bash
pip install flask flask-cors
python api.py
# API running at http://localhost:5000
```
**Terminal 2 — React App:**
```bash
npm install
npm start
# Opens http://localhost:3000 automatically
```

---

## Architecture

```
Browser (React)  ←──────→  Flask API (port 5000)  ←──→  run_icp.py
    App.js             POST /api/search                  search()
    Components         GET  /api/stats                   load_dataset()
    Masking            GET  /api/health
    CSV export
```

**Key points:**
- Flask is just a thin HTTP wrapper around `search()`
- React handles all UI state, rendering, masking, and CSV export
- The `proxy` in `package.json` routes `/api/*` to `localhost:5000` during dev

---

## API Endpoints

### `POST /api/search`
```json
// Request
{
  "company_query": "Deutsche Bank",
  "desg_query":    "CTO",
  "max_recs":      9,
  "rec_threshold": 50
}

// Response — same shape as run_icp.search()
{
  "primary":     { company + people (unmasked) },
  "recommended": [ companies + people ],
  "meta":        { query context }
}
```

### `GET /api/stats`
```json
{ "total_companies": 1159, "total_people": 2808, "sectors": {...} }
```

### `GET /api/health`
```json
{ "status": "ok", "companies": 1159, "people": 2808 }
```
## ICP Score Formula

```
Score = Vertical(50) + Scale(30) + Model(20)  →  max 100

Vertical  50pts  — industry sector must match
Scale     30pts  — company size group must match
Model     20pts  — product vs service must match

Threshold = 50  (vertical match required for recommendations)
```
---

## Building for Production

```bash
npm run build          # creates /build folder
# Serve /build with any static server
# Point Flask API to production domain (update API_BASE in App.js)
```