import json
import sys
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

API_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(API_DIR))

from run_icp import (
    search,
    RECOMMENDATION_THRESHOLD,
    MAX_RECOMMENDATIONS,
)

DATASET_PATH = API_DIR / "enriched_dataset.json"

def _load_dataset() -> list[dict]:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")
    with open(str(DATASET_PATH), encoding="utf-8") as f:
        return json.load(f)

print("Loading dataset...")
COMPANIES: list[dict] = _load_dataset()
TOTAL_COS  = len(COMPANIES)
TOTAL_PPL  = sum(c.get("people_count", len(c.get("people", []))) for c in COMPANIES)
print(f"Loaded {TOTAL_COS} companies / {TOTAL_PPL} people")

from collections import Counter
SECTOR_DIST = dict(
    Counter(c["industry_vertical"] for c in COMPANIES if c.get("industry_vertical")).most_common()
)

# Flask app
app = Flask(__name__)
CORS(app)   # Allow React dev server (localhost:3000) to call this API

#/api/health
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "companies": TOTAL_COS, "people": TOTAL_PPL})


# /api/stats 
@app.route("/api/stats", methods=["GET"])
def stats():
    return jsonify({
        "total_companies": TOTAL_COS,
        "total_people":    TOTAL_PPL,
        "sectors":         SECTOR_DIST,
        "threshold":       RECOMMENDATION_THRESHOLD,
    })

#  /api/search
@app.route("/api/search", methods=["POST"])
def search_api():
    body = request.get_json(force=True, silent=True) or {}

    company_query = str(body.get("company_query", "")).strip()
    desg_query    = str(body.get("desg_query",    "")).strip()
    max_recs      = int(body.get("max_recs",      MAX_RECOMMENDATIONS))
    rec_threshold = int(body.get("rec_threshold", RECOMMENDATION_THRESHOLD))

    if not company_query and not desg_query:
        return jsonify({"error": "Provide at least company_query or desg_query"}), 400

    try:
        result = search(
            company_query = company_query,
            desg_query    = desg_query,
            companies     = COMPANIES,
            rec_threshold = rec_threshold,
            max_recs      = max_recs,
            verbose       = False,
        )
        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

#/api/designations
@app.route("/api/designations", methods=["GET"])
def designations():
    """Return the designation options for the React dropdown."""
    options = [
        {"value": "",                   "label": "— All Designations —"},
        {"value": "CTO",                "label": "CTO  (C-Suite Technology)"},
        {"value": "CIO",                "label": "CIO  (Chief Information Officer)"},
        {"value": "CISO",               "label": "CISO  (Info Security Officer)"},
        {"value": "CDO",                "label": "CDO  (Chief Digital/Data Officer)"},
        {"value": "CEO",                "label": "CEO  (Chief Executive Officer)"},
        {"value": "COO",                "label": "COO  (Chief Operating Officer)"},
        {"value": "CMO",                "label": "CMO  (Chief Marketing Officer)"},
        {"value": "CHRO",               "label": "CHRO  (Chief HR Officer)"},
        {"value": "Founder",            "label": "Founder / Co-Founder"},
        {"value": "SVP",                "label": "SVP  (Senior Vice President)"},
        {"value": "VP",                 "label": "VP  (Vice President)"},
        {"value": "AVP",                "label": "AVP  (Associate VP)"},
        {"value": "Director",           "label": "Director"},
        {"value": "Head of",            "label": "Head of Function"},
        {"value": "C-Suite",            "label": "C-Suite  (All C-Suite)"},
        {"value": "C-Suite Technology", "label": "C-Suite Technology (T1)"},
        {"value": "All Roles",          "label": "All Roles"},
    ]
    return jsonify(options)

# Entry point
if __name__ == "__main__":
    print("\nObserveNow ICP API")
    print("==================")
    print(f"  http://localhost:5000/api/health")
    print(f"  http://localhost:5000/api/search  (POST)")
    print(f"  http://localhost:5000/api/stats")
    print()
    app.run(host="0.0.0.0", port=5000, debug=False)

