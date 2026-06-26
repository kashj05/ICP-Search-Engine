import json
import sys
import time
import csv
from pathlib import Path
from typing import Optional

SCRIPT_DIR    = Path(__file__).parent.resolve()
DATASET_PATH  = SCRIPT_DIR / "enriched_dataset.json"

RECOMMENDATION_THRESHOLD: int = 80

MAX_DIRECT_RESULTS: int = 1   # max Direct Match companies shown
MAX_RECOMMENDATIONS: int = 10  # max recommended companies shown
MIN_RECOMMENDATIONS: int = 5   

# All ICP-relevant designations from the preprocessing stage.
# Tier 1 = C-Suite Technology  (highest priority)
# Tier 2 = C-Suite Executive / Senior Leadership / Founder
# Tier 3 = VP / Director / Head of Function

TIER1_ROLES: set[str] = {
    "cto", "cofounder_cto", "deputy_cto", "president_cto", "md_cto",
    "cio", "ciso", "cdo",
}

TIER2_ROLES: set[str] = {
    "ceo", "coo", "chro", "cmo", "founder", "president", "svp", "evp",
}

TIER3_ROLES: set[str] = {
    "vp", "avp", "director", "head_of",
}

ALL_ICP_ROLES: set[str] = TIER1_ROLES | TIER2_ROLES | TIER3_ROLES

ROLE_TIER: dict[str, int] = {
    **{r: 1 for r in TIER1_ROLES},
    **{r: 2 for r in TIER2_ROLES},
    **{r: 3 for r in TIER3_ROLES},
}

ROLE_LABELS: dict[str, str] = {
    "cto":            "Chief Technology Officer",
    "cofounder_cto":  "Co-Founder & CTO",
    "deputy_cto":     "Deputy CTO",
    "president_cto":  "President / SVP CTO",
    "md_cto":         "Managing Director & CTO",
    "cio":            "Chief Information Officer",
    "ciso":           "Chief Information Security Officer",
    "cdo":            "Chief Digital / Data Officer",
    "ceo":            "Chief Executive Officer",
    "coo":            "Chief Operating Officer",
    "chro":           "Chief HR / People Officer",
    "cmo":            "Chief Marketing Officer",
    "founder":        "Founder / Co-Founder",
    "president":      "President",
    "svp":            "Senior Vice President",
    "evp":            "Executive Vice President",
    "vp":             "Vice President",
    "avp":            "Asst. / Associate VP",
    "director":       "Director",
    "head_of":        "Head of Function",
}

# Maps user-facing designation queries to role norms (exact phrase matching)
DESIGNATION_ALIASES: dict[str, list[str]] = {
    # Tier 1 — C-Suite Technology
    "cto":                          ["cto", "cofounder_cto", "deputy_cto",
                                     "president_cto", "md_cto"],
    "chief technology officer":     ["cto", "cofounder_cto", "deputy_cto",
                                     "president_cto", "md_cto"],
    "cio":                          ["cio"],
    "chief information officer":    ["cio"],
    "ciso":                         ["ciso"],
    "chief information security officer": ["ciso"],
    "cdo":                          ["cdo"],
    "chief digital officer":        ["cdo"],
    "chief data officer":           ["cdo"],
    "c-suite technology":           list(TIER1_ROLES),
    "c suite technology":           list(TIER1_ROLES),
    "tech leadership":              list(TIER1_ROLES),
    # Tier 2 — C-Suite Executive
    "ceo":                          ["ceo"],
    "chief executive officer":      ["ceo"],
    "coo":                          ["coo"],
    "chief operating officer":      ["coo"],
    "cmo":                          ["cmo"],
    "chief marketing officer":      ["cmo"],
    "chro":                         ["chro"],
    "chief hr officer":             ["chro"],
    "chief people officer":         ["chro"],
    "founder":                      ["founder", "cofounder_cto"],
    "co-founder":                   ["founder", "cofounder_cto"],
    "svp":                          ["svp"],
    "senior vice president":        ["svp"],
    "evp":                          ["evp"],
    "executive vice president":     ["evp"],
    "president":                    ["president", "president_cto"],
    "c-suite":                      list(TIER1_ROLES | TIER2_ROLES),
    "c suite":                      list(TIER1_ROLES | TIER2_ROLES),
    "c-suite executive":            list(TIER2_ROLES),
    "executive":                    list(TIER1_ROLES | TIER2_ROLES),
    # Tier 3 — VP / Director / Head
    "vp":                           ["vp", "avp"],
    "vice president":               ["vp", "avp"],
    "avp":                          ["avp"],
    "associate vp":                 ["avp"],
    "assistant vp":                 ["avp"],
    "director":                     ["director"],
    "head of":                      ["head_of"],
    "head of function":             ["head_of"],
    "vp sales":                     ["vp"],        # maps to VP tier
    "vp engineering":               ["vp"],
    "vp technology":                ["vp"],
    "vp marketing":                 ["vp"],
    "vp hr":                        ["vp"],
    "vp finance":                   ["vp"],
    "director sales":               ["director"],
    "director engineering":         ["director"],
    "director technology":          ["director"],
    # All roles
    "all":                          list(ALL_ICP_ROLES),
    "everyone":                     list(ALL_ICP_ROLES),
    "any":                          list(ALL_ICP_ROLES),
}

# Designation category → tier mapping
CATEGORY_TIER: dict[str, int] = {
    "C-Suite Technology": 1,
    "C-Suite Executive":  2,
    "C-Suite Marketing":  2,
    "C-Suite People":     2,
    "Senior Leadership":  2,
    "Founder":            2,
    "Partner / Investor": 2,
    "Vice President":     3,
    "Director":           3,
    "Head of Function":   3,
}

CATEGORY_ORDER: list[str] = [
    "C-Suite Technology", "C-Suite Executive", "Senior Leadership",
    "C-Suite Marketing", "C-Suite People", "Founder", "Partner / Investor",
    "Vice President", "Director", "Head of Function",
]

SIZE_GROUPS: dict[str, str] = {
    "startup":    "growth",
    "smb":        "growth",
    "midmarket":  "scale",
    "enterprise": "enterprise",
}

def composite_score(reference: dict, candidate: dict) -> tuple[int, dict]:
    # Dimension 1: Industry Vertical  (50 pts)
    ref_v   = (reference.get("industry_vertical") or "").lower().strip()
    cnd_v   = (candidate.get("industry_vertical") or "").lower().strip()
    v_match = bool(ref_v) and ref_v == cnd_v
    v_pts   = 50 if v_match else 0

    # Dimension 2: Company Scale  (30 pts)
    ref_grp = SIZE_GROUPS.get(reference.get("company_size","").lower(), "")
    cnd_grp = SIZE_GROUPS.get(candidate.get("company_size","").lower(), "")
    s_match = bool(ref_grp) and bool(cnd_grp) and ref_grp == cnd_grp
    s_pts   = 30 if s_match else 0

    # Dimension 3: Business Model  (20 pts)
    ref_t   = (reference.get("company_type") or "").lower().strip()
    cnd_t   = (candidate.get("company_type") or "").lower().strip()
    m_match = bool(ref_t) and bool(cnd_t) and ref_t == cnd_t
    m_pts   = 20 if m_match else 0

    score = v_pts + s_pts + m_pts

    breakdown = {
        "vertical": {"match": v_match, "pts": v_pts,
                     "ref": ref_v,  "cand": cnd_v},
        "scale":    {"match": s_match, "pts": s_pts,
                     "ref": ref_grp, "cand": cnd_grp},
        "model":    {"match": m_match, "pts": m_pts,
                     "ref": ref_t,  "cand": cnd_t},
    }
    return score, breakdown

# SECTION 5 — EXACT PHRASE MATCHING  (no tokenization)
# The search treats the ENTIRE input as a single unit.
# "Global Health Solutions" is NOT split into ["Global","Health","Solutions"].

def _levenshtein(a: str, b: str) -> int:
    """Editing distance between two strings (no splitting)."""
    a, b = a.lower(), b.lower()
    m, n = len(a), len(b)
    if m == 0: return n
    if n == 0: return m
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dp[i][j] = (dp[i-1][j-1] if a[i-1] == b[j-1]
                        else 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]))
    return dp[m][n]


def phrase_sim(a: str, b: str) -> float:
    """Similarity 0-1 between two phrases treated as single units."""
    a, b = a.strip().lower(), b.strip().lower()
    if not a or not b: return 0.0
    if a == b: return 1.0
    if a in b or b in a: return 0.90
    dist = _levenshtein(a, b)
    return max(0.0, 1.0 - dist / max(len(a), len(b)))


def find_company(query: str, companies: list[dict]) -> list[tuple[float, dict]]:
    q = query.strip().lower()
    if not q:
        return []

    results = []
    for co in companies:
        name_norm = co.get("company_name", "").lower()
        name_orig = co.get("company_original", "").lower()

        if q == name_norm or q == name_orig:
            results.append((1.0, co))
            continue

        if q in name_norm or name_norm in q or q in name_orig or name_orig in q:
            # Give higher confidence when the match is tight
            ratio = len(q) / max(len(name_norm), 1)
            conf  = 0.90 if ratio >= 0.70 else 0.80
            results.append((conf, co))
            continue

        s1 = phrase_sim(q, name_norm)
        s2 = phrase_sim(q, name_orig)
        s  = max(s1, s2)
        if s >= 0.82:
            results.append((s, co))

    results.sort(key=lambda x: -x[0])
    return results

def resolve_designation(raw: str) -> tuple[list[str], int, str]:
    if not raw or not raw.strip():
        return list(ALL_ICP_ROLES), 0, "All Roles"

    q = raw.strip().lower()

    if q in DESIGNATION_ALIASES:
        norms = DESIGNATION_ALIASES[q]
        tier  = min((ROLE_TIER.get(n, 9) for n in norms), default=0)
        label = ROLE_LABELS.get(norms[0], raw.upper()) if norms else raw
        return norms, tier, label

    for alias_key, norms in DESIGNATION_ALIASES.items():
        if alias_key in q or q in alias_key:
            tier  = min((ROLE_TIER.get(n, 9) for n in norms), default=0)
            label = ROLE_LABELS.get(norms[0], raw.upper()) if norms else raw
            return norms, tier, label
        
    q_snake = q.replace(" ", "_").replace("-", "_")
    if q_snake in ROLE_TIER:
        return [q_snake], ROLE_TIER[q_snake], ROLE_LABELS.get(q_snake, raw)

    for norm, label in ROLE_LABELS.items():
        if q in label.lower() or label.lower() in q:
            tier = ROLE_TIER.get(norm, 9)
            return [norm], tier, label

    return list(ALL_ICP_ROLES), 0, f"All Roles ('{raw}' not matched)"


def filter_people(people: list[dict],
                  target_norms: list[str]) -> list[dict]:

    if not target_norms or set(target_norms) == ALL_ICP_ROLES:
        return people  # no filter — return all
    matched = [p for p in people if p.get("title_norm","") in target_norms]
    # If no exact norm match, try same tier
    if not matched and target_norms:
        target_tiers = {ROLE_TIER.get(n, 9) for n in target_norms}
        matched = [p for p in people
                   if ROLE_TIER.get(p.get("title_norm",""), 9) in target_tiers]
    return matched

SECTOR_SYNONYMS: dict[str, str] = {
    "banking":               "banking",
    "bank":                  "banking",
    "financial services":    "banking",
    "fintech":               "fintech",
    "financial technology":  "fintech",
    "payments":              "fintech",
    "wealth management":     "fintech",
    "insurance":             "insurance",
    "insuretech":            "insurance",
    "insurtech":             "insurance",
    "saas":                  "saas",
    "software as a service": "saas",
    "software":              "saas",
    "it services":           "it_services",
    "it_services":           "it_services",
    "information technology":"it_services",
    "consulting":            "it_services",
    "outsourcing":           "it_services",
    "telecom":               "telecom",
    "telecommunications":    "telecom",
    "telco":                 "telecom",
    "ecommerce":             "ecommerce",
    "e-commerce":            "ecommerce",
    "retail":                "ecommerce",
    "logistics":             "ecommerce",
    "healthtech":            "healthtech",
    "health tech":           "healthtech",
    "healthcare":            "healthtech",
    "health":                "healthtech",
    "pharma":                "pharma",
    "pharmaceutical":        "pharma",
    "biotech":               "pharma",
    "manufacturing":         "manufacturing",
    "mfg":                   "manufacturing",
    "industrial":            "manufacturing",
    "automotive":            "manufacturing",
    "media":                 "media",
    "entertainment":         "media",
    "streaming":             "media",
    "analytics":             "analytics",
    "data analytics":        "analytics",
    "edtech":                "edtech",
    "education technology":  "edtech",
    "education":             "edtech",
    "gaming":                "gaming",
    "fmcg":                  "fmcg",
    "consumer goods":        "fmcg",
    "proptech":              "proptech",
    "real estate":           "proptech",
    "hospitality":           "hospitality",
    "travel":                "travel",
    "tourism":               "travel",
    "technology":            "technology",
    "tech":                  "technology",
    "marketing":             "marketing",
    "infrastructure":        "infrastructure",
}

SIZE_SYNONYMS: dict[str, str] = {
    "startup":       "startup",
    "early stage":   "startup",
    "seed":          "startup",
    "smb":           "smb",
    "small":         "smb",
    "small business":"smb",
    "midmarket":     "midmarket",
    "mid market":    "midmarket",
    "mid-market":    "midmarket",
    "enterprise":    "enterprise",
    "large":         "enterprise",
}

def resolve_query_intent(company_q: str,
                         desg_q: str) -> tuple[str, str, str, str, str]:
    cq = company_q.strip().lower() if company_q else ""
    dq = desg_q.strip().lower()    if desg_q else ""

    # No inputs → show all
    if not cq and not dq:
        return "all", "", "", "", ""

    # Sector-only query
    if cq in SECTOR_SYNONYMS:
        return "sector", "", SECTOR_SYNONYMS[cq], "", ""

    # Size-only query
    if cq in SIZE_SYNONYMS:
        return "size", "", "", SIZE_SYNONYMS[cq], ""

    # Company query
    if cq:
        return "company", cq, "", "", ""

    return "all", "", "", "", ""

def load_dataset() -> list[dict]:

    if DATASET_PATH.exists():
        with open(str(DATASET_PATH), encoding="utf-8") as f:
            data = json.load(f)
        total_people = sum(c.get("people_count",
                                  len(c.get("people", []))) for c in data)
        print(f"  Loaded {DATASET_PATH.name}:")
        print(f"  Companies: {len(data):,}  |  People: {total_people:,}")
        return data

    xlsx_path = SCRIPT_DIR / "ObserveNow_Refined_Final.xlsx"
    if not xlsx_path.exists():
        print(f"\n  ERROR: Neither {DATASET_PATH.name} nor "
              f"ObserveNow_Refined_Final.xlsx found in:\n  {SCRIPT_DIR}")
        sys.exit(1)

    print(f"\n  enriched_dataset.json not found — loading from Excel ...")
    import pandas as pd

    icp = pd.read_excel(str(xlsx_path),
                        sheet_name="ICP_Leads", dtype=str).fillna("")
    companies: dict[str, dict] = {}
    ROLE_TIER_LOCAL = {**{r: 1 for r in TIER1_ROLES},
                       **{r: 2 for r in TIER2_ROLES},
                       **{r: 3 for r in TIER3_ROLES}}
    for _, row in icp.iterrows():
        co = row["Company (Normalized)"].strip()
        if not co or co in ("nan", "Unknown", ""):
            continue
        if co not in companies:
            companies[co] = {
                "company_name":      co,
                "company_original":  row["Company"].strip(),
                "industry_vertical": row["Industry Vertical"].strip(),
                "company_size":      row["Company Size"].strip(),
                "company_type":      row["Company Type"].strip(),
                "company_revenue":   row["Company Revenue"].strip(),
                "people": [],
            }
        norm  = row["Title (Normalised)"].strip()
        person = {
            "name":                 row["Name"].strip(),
            "title_raw":            row["Title (Raw)"].strip(),
            "title_norm":           norm,
            "role_tier":            ROLE_TIER_LOCAL.get(norm, 9),
            "role_label":           ROLE_LABELS.get(norm,
                                     row["Designation Sub-Type"].strip()),
            "designation_category": row["Designation Category"].strip(),
            "designation_subtype":  row["Designation Sub-Type"].strip(),
            "email":                row["Email"].strip(),
            "phone":                row["Phone"].strip(),
            "linkedin":             row["LinkedIn"].strip(),
            "contact_score":        int(float(row["Contact Score"] or 0)),
            "is_cto":               row["Is CTO"].strip().lower() == "yes",
        }
        companies[co]["people"].append(person)

    result = []
    for co_data in companies.values():
        co_data["people"].sort(
            key=lambda p: (p["role_tier"], -p["contact_score"]))
        co_data["people_count"] = len(co_data["people"])
        result.append(co_data)

    result.sort(key=lambda c: c["company_name"])

    # Save for future runs
    with open(str(DATASET_PATH), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Saved {DATASET_PATH.name} for future runs.")
    return result

def search(
    company_query:  str,
    desg_query:     str       = "",
    companies:      list[dict] = None,
    rec_threshold:  int       = RECOMMENDATION_THRESHOLD,
    max_recs:       int       = MAX_RECOMMENDATIONS,
    verbose:        bool      = True,
) -> dict:
    if companies is None:
        raise ValueError("companies dataset must be provided")

    t0 = time.perf_counter()

    target_norms, desg_tier, desg_label = resolve_designation(desg_query)

    intent, co_q, sector_code, size_code, _ = resolve_query_intent(
        company_query, desg_query)

    if verbose:
        print(f"\n  Query       : '{company_query or '(all)'}'  +  "
              f"'{desg_query or 'All Roles'}'")
        print(f"  Intent      : {intent}")
        print(f"  Designation : {desg_label}  "
              f"({len(target_norms)} role norm(s))")

    primary: Optional[dict] = None
    reference_profile: dict = {}

    if intent == "company" and co_q:
        matches = find_company(co_q, companies)

        if matches:
            conf, matched_co = matches[0]
            # Filter people to target designation
            filtered_people = filter_people(
                matched_co.get("people", []), target_norms)

            primary = {
                **matched_co,
                "people":         filtered_people,
                "people_count":   len(filtered_people),
                "match_confidence": round(conf * 100),
                "result_type":    "direct_match",
                "composite_score": 100,  # perfect for itself
                "score_breakdown": {
                    "vertical": {"match": True,  "pts": 50},
                    "scale":    {"match": True,  "pts": 30},
                    "model":    {"match": True,  "pts": 20},
                },
            }
            reference_profile = {
                "industry_vertical": matched_co.get("industry_vertical", ""),
                "company_size":      matched_co.get("company_size", ""),
                "company_type":      matched_co.get("company_type", ""),
            }
            if verbose:
                print(f"  Direct Match: {matched_co['company_name']}  "
                      f"(conf: {round(conf*100)}%)  "
                      f"V={matched_co.get('industry_vertical','?')}  "
                      f"S={matched_co.get('company_size','?')}  "
                      f"T={matched_co.get('company_type','?')}")
                print(f"  People found: {len(filtered_people)} "
                      f"matching '{desg_label}'")
        else:
            if verbose:
                print(f"  Direct Match: NOT FOUND for '{company_query}'")
                print(f"  Proceeding to vertical-based recommendations...")

    elif intent == "sector" and sector_code:
        reference_profile = {"industry_vertical": sector_code,
                              "company_size": "", "company_type": ""}
        if verbose:
            print(f"  Sector query: '{sector_code}' — no Direct Match mode")

    elif intent == "size" and size_code:
        reference_profile = {"industry_vertical": "", "company_size": size_code,
                              "company_type": ""}

    excl = {primary["company_name"].lower()} if primary else set()

    candidates: list[dict] = []
    for co in companies:
        if co.get("company_name","").lower() in excl:
            continue

        if intent == "all":
            fp = filter_people(co.get("people",[]), target_norms)
            if not fp:
                continue
            candidates.append({
                **co,
                "people":          fp,
                "people_count":    len(fp),
                "composite_score": 100,
                "score_breakdown": {},
                "result_type":     "recommended",
            })
            continue

        if not reference_profile.get("industry_vertical") and intent not in ("sector",):
            fp = filter_people(co.get("people",[]), target_norms)
            if fp:
                candidates.append({
                    **co,
                    "people":          fp,
                    "people_count":    len(fp),
                    "composite_score": 0,
                    "score_breakdown": {},
                    "result_type":     "recommended",
                })
            continue

        score, breakdown = composite_score(reference_profile, co)
        if score < rec_threshold:
            continue

        fp = filter_people(co.get("people",[]), target_norms)
        if not fp and desg_query.strip():
            continue  

        candidates.append({
            **co,
            "people":          fp,
            "people_count":    len(fp),
            "composite_score": score,
            "score_breakdown": breakdown,
            "result_type":     "recommended",
        })

    candidates.sort(key=lambda c: (-c["composite_score"], -c["people_count"]))

    # Enforce min/max recommendations
    recommendations = candidates[:max_recs]

    if len(recommendations) < MIN_RECOMMENDATIONS and rec_threshold > 50:
        if verbose:
            print(f"  Only {len(recommendations)} recs at threshold {rec_threshold}. "
                  f"Relaxing to 30...")
        extra_candidates: list[dict] = []
        existing_names = {r["company_name"].lower() for r in recommendations}
        for co in companies:
            if co.get("company_name","").lower() in excl:
                continue
            if co.get("company_name","").lower() in existing_names:
                continue
            score, breakdown = composite_score(reference_profile, co)
            if score < 30:
                continue
            fp = filter_people(co.get("people",[]), target_norms)
            if not fp and desg_query.strip():
                continue
            extra_candidates.append({
                **co, "people": fp, "people_count": len(fp),
                "composite_score": score, "score_breakdown": breakdown,
                "result_type": "recommended",
            })
        extra_candidates.sort(key=lambda c: (-c["composite_score"],
                                              -c["people_count"]))
        needed = MIN_RECOMMENDATIONS - len(recommendations)
        recommendations += extra_candidates[:needed]

    ms = round((time.perf_counter() - t0) * 1000, 1)

    if verbose:
        dm_str = primary["company_name"] if primary else "None"
        print(f"  Recommendations: {len(recommendations)} companies")
        print(f"  Time: {ms}ms")

    return {
        "primary":       primary,
        "recommended":   recommendations,
        "meta": {
            "company_query":    company_query,
            "desg_query":       desg_query,
            "desg_label":       desg_label,
            "target_norms":     target_norms,
            "desg_tier":        desg_tier,
            "intent":           intent,
            "ref_vertical":     reference_profile.get("industry_vertical",""),
            "ref_size":         reference_profile.get("company_size",""),
            "ref_type":         reference_profile.get("company_type",""),
            "rec_threshold":    rec_threshold,
            "primary_found":    primary is not None,
            "rec_count":        len(recommendations),
            "ms":               ms,
        },
    }

def _tier_icon(tier: int) -> str:
    return {1: "[T1]", 2: "[T2]", 3: "[T3]"}.get(tier, "[T?]")


def _icp_band(score: int) -> str:
    if score >= 80: return "HOT "
    if score >= 50: return "WARM"
    return "COOL"


def print_person(person: dict, indent: str = "      ") -> None:
    tier    = person.get("role_tier", 9)
    ticon   = _tier_icon(tier)
    cto_tag = " ★" if person.get("is_cto") else ""
    name    = person.get("name", "—")
    role    = person.get("role_label") or person.get("designation_subtype") or "—"
    cat     = person.get("designation_category", "")
    email   = person.get("email", "—") or "—"
    phone   = person.get("phone", "—") or "—"
    li      = person.get("linkedin", "") or ""
    cs      = person.get("contact_score", 0)

    print(f"{indent}{ticon}{cto_tag} {name}")
    print(f"{indent}     Role     : {role}")
    if cat:
        print(f"{indent}     Category : {cat}")
    print(f"{indent}     Email    : {email}")
    print(f"{indent}     Phone    : {phone}")
    if li and li not in ("nan", ""):
        print(f"{indent}     LinkedIn : {li}")
    print(f"{indent}     Contact  : {cs}/5")


def print_company_card(
    co:       dict,
    rank:     int,
    label:    str  = "",
    show_all: bool = False,
) -> None:
    score   = co.get("composite_score", 0)
    band    = _icp_band(score)
    dm_tag  = " [DIRECT MATCH]" if co.get("result_type") == "direct_match" else ""
    lbl     = f"  [{label}]" if label else ""
    conf    = co.get("match_confidence", 0)
    conf_str= f"  match: {conf}%" if conf else ""
    bd      = co.get("score_breakdown", {})
    dims    = []
    if bd:
        for dim, v in bd.items():
            icon = "✓" if v.get("match") else "✗"
            dims.append(f"{dim.capitalize()[:4]}:{icon}({v.get('pts',0)}pts)")
    dim_str = " | ".join(dims) if dims else ""

    print(f"\n  {'─'*66}")
    print(f"  #{rank:02d}  {band} | Score: {score}/100{dm_tag}{lbl}{conf_str}")
    print(f"  {'─'*66}")
    print(f"  Company          : {co.get('company_name','—')}")
    vert = (co.get('industry_vertical') or '—').upper()
    sz   = co.get('company_size') or '—'
    tp   = co.get('company_type') or '—'
    rev  = co.get('company_revenue') or '—'
    print(f"  Industry Vertical: {vert}")
    print(f"  Size / Type      : {sz} / {tp}   Revenue: {rev}")
    if dim_str:
        print(f"  3D Match         : {dim_str}")

    people = co.get("people", [])
    total  = co.get("people_count", len(people))

    if not people:
        print(f"  People           : No matching contacts for requested designation")
        return

    print(f"  People           : {total} contact(s) shown\n")

    # Group by designation category, ordered by CATEGORY_ORDER
    from collections import defaultdict
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for p in people:
        cat = p.get("designation_category", "Other")
        by_cat[cat].append(p)

    ordered_cats = [c for c in CATEGORY_ORDER if c in by_cat]
    leftover_cats = [c for c in by_cat if c not in CATEGORY_ORDER]
    for cat in ordered_cats + leftover_cats:
        cat_people = by_cat[cat]
        tier_n     = CATEGORY_TIER.get(cat, 9)
        print(f"    ──── {_tier_icon(tier_n)} {cat} ({len(cat_people)}) ────")
        for p in cat_people:
            print_person(p, indent="      ")
        print()


def print_results(output: dict) -> None:
    """
    Full results renderer.

    Sections:
      DIRECT MATCH  — exact company found  (if any)
      RECOMMENDATIONS — always 5-10 companies from same niche
    """
    meta     = output.get("meta", {})
    primary  = output.get("primary")
    recs     = output.get("recommended", [])

    co_q  = meta.get("company_query","") or "(all)"
    d_q   = meta.get("desg_query","")  or "All Roles"
    vert  = (meta.get("ref_vertical","") or "?").upper()
    sz    = meta.get("ref_size","")    or "?"
    tp    = meta.get("ref_type","")    or "?"
    thr   = meta.get("rec_threshold", RECOMMENDATION_THRESHOLD)

    print(f"\n  {'═'*68}")
    print(f"  SEARCH")
    print(f"  Company Query    : '{co_q}'")
    print(f"  Designation      : '{d_q}'  →  {meta.get('desg_label','?')}")
    print(f"  Reference Niche  : Vertical={vert}  Size={sz}  Type={tp}")
    print(f"  Threshold        : {thr}/100  |  {meta.get('ms',0)}ms")
    print(f"  {'═'*68}")

    #DIRECT MATCH
    if primary:
        print(f"\n  ╔{'═'*66}╗")
        print(f"  ║  ★  DIRECT MATCH  —  '{co_q}'")
        print(f"  ║  Confidence: {primary.get('match_confidence',100)}%  |  "
              f"Designation filter: '{meta.get('desg_label','All')}'")
        print(f"  ╚{'═'*66}╝")
        print_company_card(primary, rank=1, label="DIRECT MATCH")
    else:
        print(f"\n  '{co_q}' — No Direct Match found in dataset.")
        if vert and vert != "?":
            print(f"  Inferred vertical: {vert}  →  "
                  f"showing {len(recs)} recommendation(s) below")
        else:
            print(f"  Showing best ICP-match companies for '{d_q}'")

    #RECOMMENDATIONS 
    if recs:
        rec_hdr = (
            f"RECOMMENDED PEERS  (same niche: {vert}  |  designation: "
            f"{meta.get('desg_label','All')})"
            if primary else
            f"VERTICAL RECOMMENDATIONS  ({vert})  — "
            f"designation: {meta.get('desg_label','All')}"
        )
        print(f"\n  {'─'*68}")
        print(f"  {rec_hdr}")
        print(f"  {len(recs)} companies  |  Score ≥{thr}/100  |  "
              f"Always-On: even Direct Match triggers recommendations")
        print(f"  {'─'*68}")
        for i, co in enumerate(recs, 1):
            print_company_card(co, rank=i)
    else:
        print(f"\n  No recommendations found above threshold {thr}.")
        print(f"  Try: threshold 30  or  a broader designation / sector query")

    all_shown  = ([primary] if primary else []) + recs
    if all_shown:
        total_p = sum(len(c.get("people",[])) for c in all_shown)
        hot     = sum(1 for c in all_shown if c.get("composite_score",0) >= 80)
        warm    = sum(1 for c in all_shown if 50 <= c.get("composite_score",0) < 80)
        print(f"\n  {'─'*68}")
        print(f"  SUMMARY: {len(all_shown)} companies shown  "
              f"[Direct: {1 if primary else 0}  Rec: {len(recs)}]")
        print(f"  Contacts: {total_p} people  |  HOT: {hot}  WARM: {warm}")
        print(f"\n  THRESHOLD EXPLAINED:")
        print(f"    Score = Vertical(50) + Scale(30) + Type(20) → max 100")
        print(f"    Current threshold = {thr}  "
              f"(vertical match = 50, hence all recs share same niche)")
    print()


def export_csv(output: dict, filename: str = "") -> str:
    """
    Export full results to CSV — one row per person.

    Columns:
      Result Type, Company, Vertical, Size, Type, Revenue, Score,
      Name, Role Label, Tier, Designation Category, Email, Phone, LinkedIn
    """
    if not filename:
        filename = f"icp_results_{int(time.time())}.csv"

    rows: list[dict] = []
    for bucket in ("primary", "recommended"):
        co = output.get(bucket)
        if bucket == "primary":
            bucket_list = [co] if co else []
        else:
            bucket_list = co if isinstance(co, list) else []

        for company in bucket_list:
            co_name  = company.get("company_name","")
            vertical = company.get("industry_vertical","")
            size     = company.get("company_size","")
            co_type  = company.get("company_type","")
            revenue  = company.get("company_revenue","")
            score    = company.get("composite_score",0)
            r_type   = "Direct Match" if company.get("result_type") == "direct_match" \
                       else "Recommended"

            for p in company.get("people",[]):
                rows.append({
                    "Result Type":          r_type,
                    "Company":              co_name,
                    "Industry Vertical":    vertical,
                    "Company Size":         size,
                    "Company Type":         co_type,
                    "Company Revenue":      revenue,
                    "Composite Score":      score,
                    "Name":                 p.get("name",""),
                    "Role Label":           p.get("role_label",""),
                    "Role Tier":            p.get("role_tier",9),
                    "Designation Category": p.get("designation_category",""),
                    "Designation Subtype":  p.get("designation_subtype",""),
                    "Title (Raw)":          p.get("title_raw",""),
                    "Email":                p.get("email",""),
                    "Phone":                p.get("phone",""),
                    "LinkedIn":             p.get("linkedin",""),
                    "Contact Score":        p.get("contact_score",0),
                    "Is CTO":               p.get("is_cto",False),
                })

    if not rows:
        print("  Nothing to export.")
        return ""

    save_path = SCRIPT_DIR / filename
    with open(str(save_path), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Exported {len(rows)} rows → {save_path}")
    return str(save_path)

def interactive_mode(companies: list[dict]) -> None:
   
    print("\n" + "=" * 68)
    print("  ObserveNow.ai — ICP Lead Recommendation Engine  v5.0")
    print("─" * 68)
    print("  COMPOSITE SEARCH: Company Name  +  Target Designation")
    print("  Dataset : 1,159 companies | 2,808 people | all roles")
    print("  Matching: Exact phrase (no tokenization)")
    print("  Output  : Company Profile → People → Title + Contact")
    print("─" * 68)
    print("  Commands:")
    print("    search         → enter company + designation (two prompts)")
    print("    quick <query>  → single-field search (sector / role / company)")
    print("    export         → export last results to CSV")
    print("    benchmark      → run 8 demo queries")
    print("    threshold <N>  → change rec threshold (default 50)")
    print("    recs <N>       → change max recommendations (default 10)")
    print("    help           → show this menu")
    print("    quit           → exit")
    print("─" * 68)
    print("  Example inputs:")
    print("    Company : Deutsche Bank          Designation: CTO")
    print("    Company : Axis Bank              Designation: VP")
    print("    Company : BNP Paribas            Designation: Director")
    print("    Company : Razorpay               Designation: (empty = all roles)")
    print("    Quick   : banking                (sector query)")
    print("    Quick   : Chief Technology Officer (role query)")
    print("=" * 68)

    last_output:  dict        = {}
    threshold:    int         = RECOMMENDATION_THRESHOLD
    max_recs:     int         = MAX_RECOMMENDATIONS

    while True:
        try:
            raw = input("\n  Command → ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n  Exiting."); break

        if not raw:
            continue
        cmd = raw.lower()

        if cmd in ("quit", "exit", "q"):
            print("  Exiting."); break

        elif cmd == "help":
            print("  Commands: search | quick <q> | export | benchmark | "
                  "threshold <N> | recs <N> | quit")

        elif cmd.startswith("threshold "):
            val = cmd.split()[1] if len(cmd.split()) > 1 else ""
            if val.isdigit():
                threshold = int(val)
                print(f"  Threshold set to {threshold}")
            else:
                print("  Usage: threshold 50")

        elif cmd.startswith("recs "):
            val = cmd.split()[1] if len(cmd.split()) > 1 else ""
            if val.isdigit():
                max_recs = int(val)
                print(f"  Max recommendations set to {max_recs}")
            else:
                print("  Usage: recs 5")

        elif cmd == "export":
            if last_output:
                export_csv(last_output)
            else:
                print("  Run a search first.")

        elif cmd == "benchmark":
            demos = [
                ("Deutsche Bank",     "CTO",       "company+designation, exact name"),
                ("Axis Bank",         "VP",         "company+designation, VP tier"),
                ("BNP Paribas",       "Director",   "company+designation, Director"),
                ("Razorpay",          "",           "company only — not in dataset → recs"),
                ("Global Health",     "CIO",        "partial name → vertical fallback"),
                ("banking",           "CTO",        "sector query + designation"),
                ("fintech",           "VP",         "sector + VP filter"),
                ("",                  "CTO",        "role-only → all CTO contacts"),
            ]
            print(f"\n  {'Company':<22} {'Designation':<14} {'DM':<5} "
                  f"{'Rec':<5} {'People':<8} {'ms':<7} Note")
            print(f"  {'─'*22} {'─'*14} {'─'*5} {'─'*5} {'─'*8} {'─'*7} {'─'*25}")
            for cq, dq, note in demos:
                out = search(cq, dq, companies=companies,
                             rec_threshold=threshold,
                             max_recs=max_recs, verbose=False)
                dm = out.get("primary")
                rc = out.get("recommended", [])
                pp = sum(len(c.get("people",[])) for c in
                         ([dm] if dm else []) + rc)
                m  = out["meta"]
                print(f"  {cq:<22} {dq:<14} "
                      f"{'Y' if dm else 'N':<5} {m['rec_count']:<5} "
                      f"{pp:<8} {m['ms']:<7} {note}")
            print()

        elif cmd.startswith("quick "):
            q = raw[6:].strip()
            out = search(q, "", companies=companies,
                         rec_threshold=threshold,
                         max_recs=max_recs, verbose=True)
            print_results(out)
            last_output = out

        elif cmd == "search" or True:
            # Default: any other input is treated as composite search prompt
            if cmd != "search":
                # User typed the company directly
                co_input = raw.strip()
            else:
                try:
                    co_input = input("  Company   → ").strip()
                except (KeyboardInterrupt, EOFError):
                    print(); continue

            try:
                d_input = input("  Designation (Enter = all roles) → ").strip()
            except (KeyboardInterrupt, EOFError):
                print(); continue

            out = search(co_input, d_input, companies=companies,
                         rec_threshold=threshold,
                         max_recs=max_recs, verbose=True)
            print_results(out)
            last_output = out

def main() -> None:
    print("\n" + "=" * 68)
    print("  ObserveNow.ai — ICP Lead Recommendation Engine  v5.0")
    print("  Composite Search: Company + Designation")
    print("  Always-On Recommendations: 5–10 per query")
    print("=" * 68)

    #  Load dataset 
    companies = load_dataset()

    if len(sys.argv) >= 2:
        co_arg  = sys.argv[1].strip()
        d_arg   = sys.argv[2].strip() if len(sys.argv) >= 3 else ""
        out = search(co_arg, d_arg, companies=companies)
        print_results(out)
        return

    # ── Mode selection ─────────────────────────────────────────────────────
    print("\n  Choose mode:")
    print("    1 — Interactive search (recommended)")
    print("    2 — Demo: 5 preset composite queries")
    print("    3 — Benchmark: all 8 test queries")

    try:
        choice = input("\n  Enter 1 / 2 / 3: ").strip()
    except (KeyboardInterrupt, EOFError):
        choice = "2"

    if choice == "1":
        interactive_mode(companies)

    elif choice == "3":
        demos = [
            ("Deutsche Bank",     "CTO"),
            ("Axis Bank",         "VP"),
            ("BNP Paribas",       "Director"),
            ("Razorpay",          ""),
            ("banking",           "CTO"),
            ("fintech",           "VP"),
            ("manufacturing",     "Director"),
            ("",                  "CTO"),
        ]
        print(f"\n  {'Company':<22} {'Designation':<14} "
              f"{'DM':<5} {'Rec':<5} {'ms'}")
        print(f"  {'─'*22} {'─'*14} {'─'*5} {'─'*5} {'─'*6}")
        for cq, dq in demos:
            out = search(cq, dq, companies=companies, verbose=False)
            m   = out["meta"]
            dm  = "Y" if out.get("primary") else "N"
            print(f"  {cq:<22} {dq:<14} {dm:<5} "
                  f"{m['rec_count']:<5} {m['ms']}")

    else:
        demo_queries = [
            ("Deutsche Bank",   "CTO"),
            ("Axis Bank",       "VP"),
            ("Razorpay",        "Director"),
            ("banking",         "CTO"),
            ("fintech",         "VP"),
        ]
        for cq, dq in demo_queries:
            out = search(cq, dq, companies=companies,
                         max_recs=5, verbose=True)
            print_results(out)


if __name__ == "__main__":
    main()