import React, { useState, useEffect, useCallback } from 'react';

const API_BASE           = '';   // proxy → localhost:5000 (set in package.json)
const REC_THRESHOLD      = 80;  
const DEFAULT_MAX_PEOPLE = 4;
const DEFAULT_MAX_RECS   = 9;

const SECTOR_COLOURS = {
  banking:        '#2563eb',
  fintech:        '#0891b2',
  insurance:      '#d97706',
  saas:           '#7c3aed',
  it_services:    '#0369a1',
  ecommerce:      '#be185d',
  manufacturing:  '#c2410c',
  healthtech:     '#059669',
  pharma:         '#7c3aed',
  telecom:        '#0e7490',
  media:          '#b91c1c',
  fmcg:           '#b45309',
  edtech:         '#4338ca',
  analytics:      '#0f766e',
  gaming:         '#6d28d9',
  technology:     '#1d4ed8',
  proptech:       '#4d7c0f',
  hospitality:    '#9f1239',
  travel:         '#c2410c',
  marketing:      '#86198f',
  infrastructure: '#166534',
};

const DESIGNATION_OPTIONS = [
  { value: '',                   label: '— All Designations —' },
  { value: 'CTO',                label: 'CTO  (C-Suite Technology)' },
  { value: 'CIO',                label: 'CIO  (Chief Information Officer)' },
  { value: 'CISO',               label: 'CISO  (Info Security Officer)' },
  { value: 'CDO',                label: 'CDO  (Chief Digital/Data Officer)' },
  { value: 'CEO',                label: 'CEO  (Chief Executive Officer)' },
  { value: 'COO',                label: 'COO  (Chief Operating Officer)' },
  { value: 'CMO',                label: 'CMO  (Chief Marketing Officer)' },
  { value: 'CHRO',               label: 'CHRO  (Chief HR Officer)' },
  { value: 'Founder',            label: 'Founder / Co-Founder' },
  { value: 'SVP',                label: 'SVP  (Senior Vice President)' },
  { value: 'VP',                 label: 'VP  (Vice President)' },
  { value: 'AVP',                label: 'AVP  (Associate VP)' },
  { value: 'Director',           label: 'Director' },
  { value: 'Head of',            label: 'Head of Function' },
  { value: 'C-Suite',            label: 'C-Suite  (All C-Suite)' },
  { value: 'C-Suite Technology', label: 'C-Suite Technology (T1)' },
  { value: 'All Roles',          label: 'All Roles' },
];

function getInitials(name = '') {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '??';
}

function sectorLabel(v = '') {
  const overrides = { it_services: 'IT Services', saas: 'SaaS', fmcg: 'FMCG' };
  return overrides[v] || v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—';
}

function sizeLabel(s = '') {
  const m = { startup: 'Startup', smb: 'SMB', midmarket: 'Mid-Market', enterprise: 'Enterprise' };
  return m[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
}

function sectorColour(sector = '') {
  return SECTOR_COLOURS[(sector || '').toLowerCase()] || '#64748b';
}

function icpBand(score) {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'cool';
}

const BAND = {
  hot:  { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  warm: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  cool: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
};

function maskEmail(email = '') {
  if (!email || !email.includes('@')) return '—';
  const atIdx  = email.indexOf('@');
  const local  = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!local) return '—';
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone = '') {
  if (!phone) return '—';
  const clean = phone.replace(/[^\d+]/g, '');
  const last2 = clean.slice(-2);
  if (clean.startsWith('+91') && clean.length >= 10) return `+91 XXXX XXXX ${last2}`;
  if (clean.startsWith('+1')  && clean.length >= 8)  return `+1 XXXX XXXX ${last2}`;
  return `XXXX XXXX ${last2}`;
}

function exportCSV(primary, recommended) {
  const rows = [];

  const addCompany = (label, co) => {
    if (!co) return;
    (co.people || []).forEach(p => {
      rows.push({
        'Result Type':          label,
        Company:                co.company_name       || '',
        'Industry Vertical':    co.industry_vertical  || '',
        'Company Size':         co.company_size        || '',
        'Company Type':         co.company_type        || '',
        'Company Revenue':      co.company_revenue     || '',
        'ICP Score':            co.composite_score     ?? '',
        Name:                   p.name                 || '',
        Role:                   p.role_label           || '',
        Tier:                   p.role_tier            ?? '',
        'Designation Category': p.designation_category || '',
        Email:                  p.email                || '',
        Phone:                  p.phone                || '',
        LinkedIn:               p.linkedin             || '',
        'Contact Score':        p.contact_score        ?? '',
      });
    });
  };

  if (primary) addCompany('Direct Match', primary);
  (recommended || []).forEach(co => addCompany('Recommended', co));
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `icp_leads_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const GLOBAL_CSS = `
  :root {
    --bg:       #f4f6f8;
    --white:    #ffffff;
    --s1:       #f8fafc;
    --s2:       #f1f4f7;
    --br:       #dde3ea;
    --br-hi:    #c8d0da;
    --brand:    #1a56db;
    --brand-lt: #eff4ff;
    --brand-bd: #c7d9ff;
    --t1:       #0d1117;
    --t2:       #23303f;
    --t3:       #4b5c6b;
    --t4:       #8898a9;
    --green:    #059669;
    --f-ui:     'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    --f-mono:   'IBM Plex Mono', 'Courier New', monospace;
    --r4:  4px;
    --r6:  6px;
    --r8:  8px;
    --r12: 12px;
    --sh1: 0 1px 2px rgba(0,0,0,0.06);
    --sh2: 0 1px 4px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04);
  }

  /*Base */
  .app-shell {
    min-height: 100vh;
    background: var(--bg);
    font-family: var(--f-ui);
    color: var(--t2);
  }
  .topbar {
    background: var(--white);
    border-bottom: 1px solid var(--br);
    padding: 0 2.5rem;
  }
  .topbar-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 0;
  }
  .main-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2.5rem 5rem;
  }

  /*Brand */
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-mark {
    width: 38px; height: 38px;
    background: var(--brand);
    border-radius: var(--r6);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 17px; color: #fff; flex-shrink: 0;
  }
  .brand-name { font-size: 17px; font-weight: 700; color: var(--t1); letter-spacing: -0.2px; }
  .brand-sub  { font-family: var(--f-mono); font-size: 10px; color: var(--t4); margin-top: 2px; }
  .topbar-stats { display: flex; gap: 28px; }
  .tstat { text-align: right; }
  .tstat-val { font-size: 18px; font-weight: 700; color: var(--brand); letter-spacing: -0.4px; }
  .tstat-lbl { font-family: var(--f-mono); font-size: 9px; color: var(--t4); text-transform: uppercase; letter-spacing: 0.6px; }

  /*Search panel */
  .search-wrap {
    background: var(--white);
    border: 1px solid var(--br);
    border-top: 3px solid var(--brand);
    border-radius: var(--r12);
    padding: 22px 24px 18px;
    margin: 24px 0 0;
    box-shadow: var(--sh1);
  }
  .search-grid {
    display: grid;
    grid-template-columns: 5fr 4fr 2fr;
    gap: 16px;
    align-items: end;
  }
  @media (max-width: 700px) { .search-grid { grid-template-columns: 1fr; } }
  .field-lbl {
    font-family: var(--f-mono); font-size: 10px; font-weight: 600;
    color: var(--t3); text-transform: uppercase;
    letter-spacing: 0.8px; margin-bottom: 6px; display: block;
  }
  .badge-req {
    background: #fef2f2; color: #b71c1c;
    font-size: 8.5px; font-weight: 600;
    padding: 1px 5px; border-radius: var(--r4); margin-left: 5px;
    text-transform: uppercase; vertical-align: middle;
  }
  .badge-opt {
    background: var(--s2); color: var(--t4);
    font-size: 8.5px; padding: 1px 5px;
    border-radius: var(--r4); margin-left: 5px;
    text-transform: uppercase; vertical-align: middle;
  }
  .field-hint { font-size: 11px; color: var(--t4); margin-top: 4px; }
  .txt-input {
    width: 100%; padding: 9px 12px;
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r6); color: var(--t1);
    font-family: var(--f-ui); font-size: 13.5px;
    outline: none; transition: border-color 0.15s;
  }
  .txt-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(26,86,219,0.10);
  }
  .txt-input::placeholder { color: var(--t4); }
  .sel-input {
    width: 100%; padding: 9px 12px;
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r6); color: var(--t1);
    font-family: var(--f-ui); font-size: 13.5px;
    outline: none; cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238898a9' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 32px;
    transition: border-color 0.15s;
  }
  .sel-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(26,86,219,0.10);
  }
  .btn-search {
    width: 100%; padding: 10px 20px;
    background: var(--brand); color: #fff;
    border: none; border-radius: var(--r6);
    font-family: var(--f-ui); font-size: 13.5px; font-weight: 600;
    cursor: pointer; transition: background 0.15s, transform 0.12s;
    white-space: nowrap;
  }
  .btn-search:hover  { background: #1648c4; transform: translateY(-1px); }
  .btn-search:active { transform: translateY(0); }
  .btn-search:disabled { background: var(--t4); cursor: not-allowed; transform: none; }
  .custom-expander {
    margin-top: 12px; padding-top: 12px;
    border-top: 1px solid var(--br);
  }

  /* Controls row */
  .controls-row {
    display: flex; align-items: center; gap: 24px;
    margin: 18px 0 4px;
    padding: 10px 16px;
    background: var(--white);
    border: 1px solid var(--br);
    border-radius: var(--r8);
    box-shadow: var(--sh1);
  }
  .ctrl-group { display: flex; align-items: center; gap: 8px; }
  .ctrl-lbl {
    font-family: var(--f-mono); font-size: 10px; color: var(--t4);
    text-transform: uppercase; letter-spacing: 0.6px; white-space: nowrap;
  }
  .ctrl-val {
    font-family: var(--f-mono); font-size: 11px;
    color: var(--brand); min-width: 18px; text-align: center;
  }
  input[type="range"] { accent-color: var(--brand); width: 80px; cursor: pointer; }

  /* Meta bar  */
  .meta-bar {
    display: flex; align-items: stretch;
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r8); overflow: hidden;
    margin: 20px 0 24px; box-shadow: var(--sh1);
    flex-wrap: wrap;
  }
  .meta-seg {
    padding: 9px 16px; display: flex; align-items: center;
    gap: 6px; border-right: 1px solid var(--br); white-space: nowrap;
  }
  .meta-seg:last-child { border-right: none; margin-left: auto; }
  .mk  { font-family: var(--f-mono); font-size: 9.5px; color: var(--t4); text-transform: uppercase; letter-spacing: 0.5px; }
  .mv  { font-family: var(--f-ui); font-size: 12px; color: var(--t2); font-weight: 500; }
  .mv-hi { font-family: var(--f-ui); font-size: 12px; color: var(--brand); font-weight: 600; }

  /* ── Section header ────────────────────────────────────────── */
  .sec-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .sec-accent { width: 3px; height: 18px; border-radius: 2px; flex-shrink: 0; }
  .sec-title  { font-size: 12.5px; font-weight: 700; color: var(--t1); text-transform: uppercase; letter-spacing: 0.6px; }
  .sec-sub    { font-family: var(--f-mono); font-size: 10.5px; color: var(--t4); }

  /* ── Direct Match card ─────────────────────────────────────── */
  .dm-card {
    background: var(--white);
    border: 1px solid var(--brand-bd);
    border-top: 3px solid var(--brand);
    border-radius: var(--r12);
    overflow: hidden;
    box-shadow: var(--sh2);
    margin-bottom: 6px;
  }
  .dm-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px 13px;
    background: var(--brand-lt);
    border-bottom: 1px solid var(--brand-bd);
    gap: 16px;
  }
  .dm-co-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
  .dm-co-icon {
    width: 44px; height: 44px;
    background: var(--brand); border-radius: var(--r6);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px; color: #fff;
    flex-shrink: 0; letter-spacing: -1px;
  }
  .dm-co-name {
    font-size: 17px; font-weight: 700; color: var(--t1);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .dm-co-sub  { font-size: 11.5px; color: var(--t3); margin-top: 2px; }
  .dm-score-pill {
    font-size: 13px; font-weight: 700;
    padding: 4px 12px; border-radius: 20px;
    white-space: nowrap; border: 1px solid;
  }
  .dm-label {
    font-family: var(--f-mono); font-size: 9px; font-weight: 600;
    padding: 2px 8px; border-radius: var(--r4);
    background: var(--white); color: var(--brand);
    border: 1px solid var(--brand-bd);
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .dm-body { display: flex; }
  .dm-left {
    width: 260px; flex-shrink: 0;
    padding: 18px 20px;
    background: var(--s1);
    border-right: 1px solid var(--br);
  }
  .dm-panel-title {
    font-family: var(--f-mono); font-size: 9.5px; font-weight: 600;
    color: var(--t4); text-transform: uppercase;
    letter-spacing: 0.8px; margin-bottom: 12px;
  }
  .dm-info-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 9px; }
  .dm-key {
    font-family: var(--f-mono); font-size: 9.5px; color: var(--t4);
    text-transform: uppercase; letter-spacing: 0.4px;
    min-width: 72px; flex-shrink: 0; padding-top: 1px;
  }
  .dm-val { font-size: 12.5px; color: var(--t2); font-weight: 500; }
  .dm-dims { display: flex; gap: 4px; margin-top: 10px; flex-wrap: wrap; }
  .dm-dim {
    font-family: var(--f-mono); font-size: 9px;
    padding: 2px 7px; border-radius: var(--r4); border: 1px solid;
    white-space: nowrap;
  }
  .dim-hit  { background: #f0fdf4; color: #059669; border-color: #a7f3d0; }
  .dim-miss { background: var(--s2); color: var(--t4); border-color: var(--br); }
  .dm-right { flex: 1; overflow: hidden; }
  .dm-contacts-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 18px 8px;
    background: var(--s1);
    border-bottom: 1px solid var(--br);
  }
  .dm-contacts-lbl {
    font-family: var(--f-mono); font-size: 9.5px; font-weight: 600;
    color: var(--t3); text-transform: uppercase; letter-spacing: 0.7px;
  }

  /* ── Contact rows (shared by DM + Rec cards) ───────────────── */
  .contact-row {
    display: flex; align-items: flex-start; gap: 11px;
    padding: 11px 18px; border-bottom: 1px solid #f1f4f7;
    transition: background 0.1s;
  }
  .contact-row:last-child { border-bottom: none; }
  .contact-row:hover { background: var(--s1); }
  .av {
    width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: -1px; margin-top: 1px; border: 1px solid;
  }
  .av-t1 { background: #eff4ff; color: var(--brand); border-color: var(--brand-bd); }
  .av-t2 { background: #f0fdf4; color: var(--green); border-color: #a7f3d0; }
  .av-t3 { background: var(--s2); color: var(--t3); border-color: var(--br-hi); }
  .contact-info { flex: 1; min-width: 0; }
  .c-name { font-size: 13px; font-weight: 600; color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
  .c-role { font-size: 11.5px; color: var(--t2); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
  .c-cat  { font-family: var(--f-mono); font-size: 9.5px; color: var(--t4); text-transform: uppercase; letter-spacing: 0.2px; }
  .contact-chips { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
  .chip {
    font-family: var(--f-mono); font-size: 9.5px; padding: 2px 8px;
    border-radius: var(--r4); white-space: nowrap;
    max-width: 200px; overflow: hidden; text-overflow: ellipsis;
  }
  .chip-masked {
    background: var(--s1); border: 1px dashed var(--br-hi); color: var(--t4);
  }
  .li-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: var(--r4);
    font-family: var(--f-mono); font-size: 9px; font-weight: 500;
    text-decoration: none; background: #eff4ff;
    color: var(--brand); border: 1px solid var(--brand-bd);
    transition: background 0.12s; white-space: nowrap;
  }
  .li-btn:hover { background: #dce8ff; }
  .extra-stub {
    text-align: center; padding: 8px 0;
    font-family: var(--f-mono); font-size: 10px; color: var(--t4);
    background: var(--s1); border-top: 1px solid var(--br);
  }

  /* ── Recommendation grid ───────────────────────────────────── */
  .recs-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 8px;
  }
  @media (max-width: 1024px) { .recs-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 640px)  { .recs-grid { grid-template-columns: 1fr; } }

  .rec-card {
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r12); overflow: hidden;
    box-shadow: var(--sh1); display: flex; flex-direction: column;
    transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s;
    animation: fadeUp 0.25s ease both;
  }
  .rec-card:hover { box-shadow: var(--sh2); transform: translateY(-2px); border-color: var(--br-hi); }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  .rc-stripe { height: 3px; width: 100%; flex-shrink: 0; }
  .rc-co {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 14px 14px 12px; border-bottom: 1px solid var(--br);
  }
  .rc-icon {
    width: 36px; height: 36px; background: var(--s2);
    border: 1px solid var(--br); border-radius: var(--r4);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px; color: var(--t3);
    flex-shrink: 0; text-transform: uppercase; letter-spacing: -1.5px;
  }
  .rc-co-body { flex: 1; min-width: 0; }
  .rc-co-name {
    font-size: 13.5px; font-weight: 700; color: var(--t1);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.2; margin-bottom: 5px;
  }
  .rc-tags { display: flex; flex-wrap: wrap; gap: 3px; }
  .rtag {
    font-family: var(--f-mono); font-size: 9px; font-weight: 500;
    padding: 2px 6px; border-radius: var(--r4); text-transform: uppercase;
    letter-spacing: 0.2px; border: 1px solid; white-space: nowrap;
  }
  .rtag-sector  { background: #eff4ff; color: #1648c4; border-color: #c7d9ff; }
  .rtag-size    { background: #f0fdf4; color: #0d7a4e; border-color: #a7f3d0; }
  .rtag-product { background: #f5f3ff; color: #5b21b6; border-color: #ddd6fe; }
  .rtag-service { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
  .rtag-rev     { background: #fffbeb; color: #92500b; border-color: #fde68a; }
  .rc-score-col { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .rc-score-pill { font-size: 14px; font-weight: 700; padding: 4px 10px; border-radius: var(--r4); white-space: nowrap; border: 1px solid; }
  .rc-dims { display: flex; gap: 3px; margin-top: 2px; }
  .rc-dim {
    font-family: var(--f-mono); font-size: 8px;
    padding: 1px 5px; border-radius: var(--r4); border: 1px solid;
  }
  .rcd-hit  { background: #f0fdf4; color: var(--green); border-color: #a7f3d0; }
  .rcd-miss { background: var(--s2); color: var(--t4); border-color: var(--br); }
  .rc-leads { flex: 1; }
  .rc-leads-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 14px; background: var(--s1); border-bottom: 1px solid var(--br);
  }
  .rc-leads-lbl {
    font-family: var(--f-mono); font-size: 9px; font-weight: 600;
    color: var(--t4); text-transform: uppercase; letter-spacing: 0.6px;
  }
  .rc-lead-row {
    display: flex; align-items: flex-start; gap: 9px;
    padding: 8px 14px; border-bottom: 1px solid #f1f4f7;
    transition: background 0.1s;
  }
  .rc-lead-row:last-child { border-bottom: none; }
  .rc-lead-row:hover { background: var(--s1); }
  .rl-av {
    width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: -1px; margin-top: 1px; border: 1px solid;
  }
  .rl-info { flex: 1; min-width: 0; }
  .rl-name { font-size: 12px; font-weight: 600; color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rl-role { font-size: 11px; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rl-cat  { font-family: var(--f-mono); font-size: 8.5px; color: var(--t4); text-transform: uppercase; }
  .rl-contact { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
  .rc-footer {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 14px 9px; background: var(--s1); border-top: 1px solid var(--br);
  }
  .rc-footer-stat { font-family: var(--f-mono); font-size: 9px; color: var(--t4); white-space: nowrap; }
  .score-bar-bg   { flex: 1; height: 2px; background: var(--s2); border-radius: 1px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 1px; }

  /*Export bar */
  .export-bar {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 0 4px;
    border-top: 1px solid var(--br); margin-top: 16px;
  }
  .btn-export {
    padding: 7px 16px; background: var(--white); color: var(--brand);
    border: 1px solid var(--brand-bd); border-radius: var(--r6);
    font-family: var(--f-mono); font-size: 11.5px; font-weight: 500;
    cursor: pointer; transition: background 0.12s;
  }
  .btn-export:hover { background: var(--brand-lt); }
  .export-note { font-family: var(--f-mono); font-size: 10.5px; color: var(--t4); }

  /* Empty / landing */
  .empty-card {
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r12); padding: 44px 24px;
    text-align: center; box-shadow: var(--sh1); margin-bottom: 20px;
  }
  .empty-icon  { font-size: 28px; opacity: 0.3; margin-bottom: 10px; }
  .empty-title { font-size: 15px; font-weight: 700; color: var(--t1); margin-bottom: 4px; }
  .empty-sub   { font-size: 12.5px; color: var(--t4); }

  .stat-tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin: 24px 0; }
  @media (max-width: 640px) { .stat-tiles { grid-template-columns: repeat(2,1fr); } }
  .stat-tile {
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r8); padding: 20px; text-align: center;
    box-shadow: var(--sh1); transition: border-color 0.15s, box-shadow 0.15s;
  }
  .stat-tile:hover { border-color: var(--brand-bd); box-shadow: var(--sh2); }
  .stat-val { font-size: 26px; font-weight: 700; color: var(--brand); letter-spacing: -0.5px; }
  .stat-lbl { font-size: 11.5px; color: var(--t4); margin-top: 3px; }

  .sector-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 24px; }
  .sector-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 11px; border-radius: 20px;
    background: var(--white); border: 1px solid var(--br);
    font-family: var(--f-mono); font-size: 10.5px; color: var(--t2);
    box-shadow: var(--sh1); white-space: nowrap;
  }
  .sector-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .sector-cnt { color: var(--t4); font-size: 9.5px; }

  .how-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
  @media (max-width: 640px) { .how-grid { grid-template-columns: 1fr; } }
  .how-card {
    background: var(--white); border: 1px solid var(--br);
    border-radius: var(--r8); padding: 20px; box-shadow: var(--sh1);
  }
  .how-num   { font-size: 22px; font-weight: 700; color: var(--brand); opacity: 0.2; line-height: 1; margin-bottom: 8px; }
  .how-title { font-size: 13.5px; font-weight: 700; color: var(--t1); margin-bottom: 6px; }
  .how-desc  { font-size: 12px; color: var(--t3); line-height: 1.65; }

  /*Loader / error */
  .loader-wrap {
    display: flex; align-items: center; justify-content: center;
    gap: 12px; padding: 40px;
  }
  .spinner {
    width: 22px; height: 22px;
    border: 2px solid var(--br);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loader-txt { font-size: 13px; color: var(--t4); }
  .error-card {
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: var(--r8); padding: 14px 18px;
    margin: 16px 0; font-size: 12.5px; color: #b71c1c;
  }
`;

function LinkedInIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function FirmTags({ vertical, size, companyType, revenue }) {
  return (
    <div className="rc-tags">
      {vertical    && <span className="rtag rtag-sector">{sectorLabel(vertical)}</span>}
      {size        && <span className="rtag rtag-size">{sizeLabel(size)}</span>}
      {companyType && (
        <span className={`rtag ${companyType === 'product' ? 'rtag-product' : 'rtag-service'}`}>
          {companyType.charAt(0).toUpperCase() + companyType.slice(1)}
        </span>
      )}
      {revenue && <span className="rtag rtag-rev">{revenue}</span>}
    </div>
  );
}

function DimPills({ breakdown }) {
  if (!breakdown) return null;
  return (
    <div className="rc-dims">
      {[['V','vertical'],['S','scale'],['M','model']].map(([lbl, key]) => {
        const hit = breakdown[key]?.match;
        return (
          <span key={key} className={`rc-dim ${hit ? 'rcd-hit' : 'rcd-miss'}`}>
            {hit ? '✓' : '✗'}{lbl}
          </span>
        );
      })}
    </div>
  );
}

function ExtraStub({ count }) {
  if (!count) return null;
  return (
    <div className="extra-stub">
      + {count} more contact{count !== 1 ? 's' : ''}
    </div>
  );
}

function SectionHeader({ title, sub, colour = 'var(--brand)' }) {
  return (
    <div className="sec-hdr">
      <div className="sec-accent" style={{ background: colour }} />
      <span className="sec-title">{title}</span>
      {sub && <span className="sec-sub">{sub}</span>}
    </div>
  );
}

function ContactRow({ person, rowClass = 'contact-row', avClass = 'av', chipSize = 32 }) {
  const { name, role_label, role_tier, designation_category, email, phone, linkedin } = person;
  const avTier = role_tier === 1 ? 'av-t1' : role_tier === 2 ? 'av-t2' : 'av-t3';

  return (
    <div className={rowClass}>
      <div
        className={`${avClass} ${avTier}`}
        style={{ width: chipSize, height: chipSize, fontSize: chipSize * 0.34 }}
      >
        {getInitials(name)}
      </div>
      <div className="contact-info">
        <div className="c-name">{name}</div>
        <div className="c-role">{role_label}</div>
        <div className="c-cat">{designation_category}</div>
      </div>
      <div className="contact-chips">
        {/* Change 3: always masked */}
        <span className="chip chip-masked">{maskEmail(email)}</span>
        <span className="chip chip-masked">{maskPhone(phone)}</span>
        {linkedin && linkedin !== 'nan' && (
          <a href={linkedin} target="_blank" rel="noopener noreferrer" className="li-btn">
            <LinkedInIcon /> LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

// DIRECT MATCH CARD
function DirectMatchCard({ company, maxPeople }) {
  const {
    company_name, industry_vertical, company_size, company_type,
    company_revenue, composite_score, match_confidence,
    score_breakdown, people = [],
  } = company;

  const band  = icpBand(composite_score);
  const s     = BAND[band];
  const shown = people.slice(0, maxPeople);
  const extra = Math.max(0, people.length - maxPeople);

  const infoRows = [
    { key: 'Industry',   val: sectorLabel(industry_vertical) },
    { key: 'Size',       val: sizeLabel(company_size) },
    { key: 'Type',       val: company_type ? company_type.charAt(0).toUpperCase() + company_type.slice(1) : '' },
    { key: 'Revenue',    val: company_revenue || '' },
    { key: 'Confidence', val: `${match_confidence}%` },
    { key: 'Contacts',   val: String(people.length) },
  ].filter(r => r.val);

  return (
    <div className="dm-card">
      {/* Top band */}
      <div className="dm-top">
        <div className="dm-co-left">
          <div className="dm-co-icon">{getInitials(company_name)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="dm-co-name">{company_name}</div>
            <div className="dm-co-sub">
              {sectorLabel(industry_vertical)} &nbsp;·&nbsp; {sizeLabel(company_size)}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
          <span className="dm-score-pill" style={{ background: s.bg, color: s.color, borderColor: s.border }}>
            ICP {composite_score}%
          </span>
          <span className="dm-label">Direct Match</span>
        </div>
      </div>

      {/* Two-panel body */}
      <div className="dm-body">
        {/* Left: Company Profile */}
        <div className="dm-left">
          <div className="dm-panel-title">Company Profile</div>
          {infoRows.map(({ key, val }) => (
            <div key={key} className="dm-info-row">
              <span className="dm-key">{key}</span>
              <span className="dm-val">{val}</span>
            </div>
          ))}
          {score_breakdown && (
            <div className="dm-dims">
              {['vertical','scale','model'].map(k => {
                const hit = score_breakdown[k]?.match;
                const pts = score_breakdown[k]?.pts ?? 0;
                return (
                  <span key={k} className={`dm-dim ${hit ? 'dim-hit' : 'dim-miss'}`}>
                    {hit ? '✓' : '✗'} {k.charAt(0).toUpperCase() + k.slice(1)} {pts}pts
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Contacts — masked (Change 3) */}
        <div className="dm-right">
          <div className="dm-contacts-hdr">
            <span className="dm-contacts-lbl">
              Designated Contacts &nbsp;·&nbsp; {people.length}
            </span>
          </div>
          {shown.length > 0 ? (
            shown.map((p, i) => (
              <ContactRow key={i} person={p} rowClass="contact-row" avClass="av" chipSize={32} />
            ))
          ) : (
            <div style={{ padding:'14px 18px', fontSize:12, color:'var(--t4)' }}>
              No contacts match the selected designation.
            </div>
          )}
          <ExtraStub count={extra} />
        </div>
      </div>
    </div>
  );
}

// RECOMMENDATION CARD

function RecCard({ company, maxPeople, animDelay }) {
  const {
    company_name, industry_vertical, company_size, company_type,
    company_revenue, composite_score, score_breakdown, people = [],
  } = company;

  const band     = icpBand(composite_score);
  const s        = BAND[band];
  const accent   = sectorColour(industry_vertical);
  const shown    = people.slice(0, maxPeople);
  const extra    = Math.max(0, people.length - maxPeople);
  const avTier   = t => t === 1 ? 'av-t1' : t === 2 ? 'av-t2' : 'av-t3';

  return (
    <div className="rec-card" style={{ animationDelay: `${animDelay}ms` }}>
      <div className="rc-stripe" style={{ background: accent }} />

      {/* Company header */}
      <div className="rc-co">
        <div className="rc-icon">{getInitials(company_name)}</div>
        <div className="rc-co-body">
          <div className="rc-co-name">{company_name}</div>
          <FirmTags
            vertical={industry_vertical}
            size={company_size}
            companyType={company_type}
            revenue={company_revenue}
          />
        </div>
        <div className="rc-score-col">
          <span className="rc-score-pill" style={{ background: s.bg, color: s.color, borderColor: s.border }}>
            {composite_score}%
          </span>
          <DimPills breakdown={score_breakdown} />
        </div>
      </div>

      {/* Leads — masked */}
      <div className="rc-leads">
        <div className="rc-leads-hdr">
          <span className="rc-leads-lbl">Leads &nbsp;·&nbsp; {people.length}</span>
        </div>
        {shown.length > 0 ? (
          shown.map((p, i) => (
            <div key={i} className="rc-lead-row">
              <div className={`rl-av ${avTier(p.role_tier)}`}>
                {getInitials(p.name)}
              </div>
              <div className="rl-info">
                <div className="rl-name">{p.name}</div>
                <div className="rl-role">{p.role_label}</div>
                <div className="rl-cat">{p.designation_category}</div>
              </div>
              <div className="rl-contact">
                <span className="chip chip-masked">{maskEmail(p.email)}</span>
                <span className="chip chip-masked">{maskPhone(p.phone)}</span>
                {p.linkedin && p.linkedin !== 'nan' && (
                  <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="li-btn">
                    <LinkedInIcon /> LinkedIn
                  </a>
                )}
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding:'10px 14px', fontSize:11.5, color:'var(--t4)' }}>
            No contacts for this designation.
          </div>
        )}
        <ExtraStub count={extra} />
      </div>

      {/* Footer */}
      <div className="rc-footer">
        <span className="rc-footer-stat">{people.length} contacts</span>
        <div className="score-bar-bg">
          <div
            className="score-bar-fill"
            style={{ width:`${Math.min(composite_score,100)}%`, background: s.color }}
          />
        </div>
        <span className="rc-footer-stat">ICP {composite_score}/100</span>
      </div>
    </div>
  );
}

// TOPBAR

function TopBar({ stats }) {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">O</div>
          <div>
            <div className="brand-name">ObserveNow · ICP Engine</div>
            <div className="brand-sub">Lead Intelligence Platform</div>
          </div>
        </div>
        <div className="topbar-stats">
          <div className="tstat">
            <div className="tstat-val">{stats?.total_companies?.toLocaleString() || '—'}</div>
            <div className="tstat-lbl">Companies</div>
          </div>
          <div className="tstat">
            <div className="tstat-val">{stats?.total_people?.toLocaleString() || '—'}</div>
            <div className="tstat-lbl">Contacts</div>
          </div>
          <div className="tstat">
            <div className="tstat-val">3D</div>
            <div className="tstat-lbl">ICP Score</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// SEARCH PANEL

function SearchPanel({ onSearch, loading }) {
  const [companyQuery, setCompanyQuery] = useState('');
  const [desgQuery,    setDesgQuery]    = useState('');
  const [customDesg,   setCustomDesg]   = useState('');
  const [showCustom,   setShowCustom]   = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalDesg = customDesg.trim() || desgQuery;
    onSearch(companyQuery.trim(), finalDesg.trim());
  };

  const canSearch = companyQuery.trim() || desgQuery || customDesg.trim();

  return (
    <form onSubmit={handleSubmit}>
      <div className="search-wrap">
        <div className="search-grid">
          <div>
            <label className="field-lbl">
              Company Name <span className="badge-req">Required</span>
            </label>
            <input
              className="txt-input"
              value={companyQuery}
              onChange={e => setCompanyQuery(e.target.value)}
              placeholder="Deutsche Bank  ·  Axis Bank  ·  banking  ·  fintech"
            />
            <div className="field-hint">Company name or sector keyword</div>
          </div>

          <div>
            <label className="field-lbl">
              Target Designation <span className="badge-opt">Optional</span>
            </label>
            <select
              className="sel-input"
              value={desgQuery}
              onChange={e => { setDesgQuery(e.target.value); setCustomDesg(''); }}
            >
              {DESIGNATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div
              className="field-hint"
              style={{ cursor:'pointer', color:'var(--brand)' }}
              onClick={() => setShowCustom(v => !v)}
            >
              {showCustom ? '▲' : '▼'}&nbsp; Custom role
            </div>
          </div>

          <div>
            <div style={{ height: 22 }} />
            <button
              type="submit"
              className="btn-search"
              disabled={loading || !canSearch}
            >
              {loading ? 'Searching…' : 'Search →'}
            </button>
          </div>
        </div>

        {showCustom && (
          <div className="custom-expander">
            <label className="field-lbl">Custom Designation</label>
            <input
              className="txt-input"
              style={{ maxWidth: 380 }}
              value={customDesg}
              onChange={e => setCustomDesg(e.target.value)}
              placeholder="VP Sales  ·  Director Engineering  ·  Head of IT"
            />
          </div>
        )}
      </div>
    </form>
  );
}

// META BAR

function MetaBar({ meta }) {
  if (!meta) return null;
  const { company_query, desg_label, ref_vertical, ref_size, ms, rec_count, primary_found } = meta;

  const segs = [
    { k: 'Company',  v: company_query || '—', hi: true },
    { k: 'Role',     v: desg_label || 'All Roles' },
    { k: 'Vertical', v: (ref_vertical || '—').toUpperCase() },
    ...(ref_size ? [{ k: 'Scale', v: sizeLabel(ref_size) }] : []),
    { k: 'Results',  v: `${primary_found ? 1 : 0} Direct · ${rec_count} Rec` },
    { k: 'Time',     v: `${ms}ms`, right: true },
  ];

  return (
    <div className="meta-bar">
      {segs.map(({ k, v, hi, right }) => (
        <div key={k} className="meta-seg" style={right ? { marginLeft:'auto' } : {}}>
          <span className="mk">{k}</span>
          <span className={hi ? 'mv-hi' : 'mv'}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// LANDING STATE

function LandingState({ stats }) {
  const sectors = Object.entries(stats?.sectors || {}).slice(0, 16);

  return (
    <div style={{ marginTop: 24 }}>
      <div className="stat-tiles">
        {[
          { val: '1,159', lbl: 'Companies' },
          { val: '2,808', lbl: 'Contacts' },
          { val: '20+',   lbl: 'Verticals' },
          { val: '≥ 80',  lbl: 'ICP Threshold' },
        ].map(({ val, lbl }) => (
          <div key={lbl} className="stat-tile">
            <div className="stat-val">{val}</div>
            <div className="stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>
        Dataset Coverage
      </div>
      <div className="sector-pills">
        {sectors.map(([sec, cnt]) => (
          <div key={sec} className="sector-pill">
            <span className="sector-dot" style={{ background: sectorColour(sec) }} />
            {sectorLabel(sec)}
            <span className="sector-cnt">{cnt}</span>
          </div>
        ))}
      </div>

      <div className="how-grid">
        {[
          { n:'01', t:'Exact-Phrase Search',    d:"Type the full company name or a sector keyword. Matching is phrase-level — 'Deutsche Bank' is never split into tokens." },
          { n:'02', t:'3-D Composite ICP Score', d:'Vertical (50pts) + Scale (30pts) + Model (20pts). Only companies scoring ≥ 80 appear as recommendations.' },
          { n:'03', t:'Masked Contact Details',  d:'All contacts show masked email and phone as a teaser. Export CSV to get the complete unmasked data.' },
        ].map(({ n, t, d }) => (
          <div key={n} className="how-card">
            <div className="how-num">{n}</div>
            <div className="how-title">{t}</div>
            <div className="how-desc">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// RESULTS VIEW

function ResultsView({ result, maxPeople }) {
  const { primary, recommended = [], meta } = result;

  const totalContacts = [primary, ...recommended]
    .filter(Boolean)
    .reduce((sum, co) => sum + (co.people?.length || 0), 0);

  return (
    <div>
      <MetaBar meta={meta} />

      {/* Direct Match */}
      {primary ? (
        <>
          <SectionHeader
            title="Direct Match"
            sub={`1 company · ${primary.people?.length || 0} contacts`}
            colour="var(--brand)"
          />
          <DirectMatchCard company={primary} maxPeople={maxPeople} />
          <div style={{ height: 24 }} />
        </>
      ) : meta?.company_query ? (
        <div className="empty-card" style={{ padding:'24px', marginBottom:20 }}>
          <div className="empty-icon">◎</div>
          <div className="empty-title">No exact match for &ldquo;{meta.company_query}&rdquo;</div>
          <div className="empty-sub">Showing {recommended.length} recommendation(s) from the inferred niche</div>
        </div>
      ) : null}

      {/* Recommendations — 3-column grid */}
      {recommended.length > 0 && (
        <>
          <SectionHeader
            title="Recommendations"
            sub={`${recommended.length} companies · ICP ≥ ${REC_THRESHOLD}`}
            colour="var(--green)"
          />
          <div className="recs-grid">
            {recommended.map((co, i) => (
              <RecCard
                key={co.company_name + i}
                company={co}
                maxPeople={maxPeople}
                animDelay={i * 35}
              />
            ))}
          </div>
        </>
      )}

      {!primary && recommended.length === 0 && (
        <div className="empty-card">
          <div className="empty-icon">◈</div>
          <div className="empty-title">No results found</div>
          <div className="empty-sub">Try: banking · fintech · saas · manufacturing</div>
        </div>
      )}

      {/* Export — always at the bottom if there are any results */}
      {(primary || recommended.length > 0) && (
        <div className="export-bar">
          <button className="btn-export" onClick={() => exportCSV(primary, recommended)}>
            ⬇ Export CSV
          </button>
          <span className="export-note">
            {totalContacts} contacts · {(primary ? 1 : 0) + recommended.length} companies
          </span>
        </div>
      )}
    </div>
  );
}


export default function App() {
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState('');
  const [maxPeople, setMaxPeople] = useState(DEFAULT_MAX_PEOPLE);
  const [maxRecs,   setMaxRecs]   = useState(DEFAULT_MAX_RECS);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Load dataset stats
  useEffect(() => {
    fetch(`${API_BASE}/api/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats({ total_companies: 1159, total_people: 2808, sectors: {} }));
  }, []);

  const handleSearch = useCallback(async (companyQuery, desgQuery) => {
    if (!companyQuery && !desgQuery) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_query:  companyQuery,
          desg_query:     desgQuery,
          max_recs:       maxRecs,
          rec_threshold:  REC_THRESHOLD,   // Change 1: strict 80
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Search failed');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(`Cannot reach API. Make sure the Flask server is running: python api.py`);
    } finally {
      setLoading(false);
    }
  }, [maxRecs]);

  return (
    <div className="app-shell">
      <TopBar stats={stats} />

      <div className="main-content">
        {/* Search */}
        <SearchPanel onSearch={handleSearch} loading={loading} />

        {/* Controls */}
        <div className="controls-row">
          <div className="ctrl-group">
            <span className="ctrl-lbl">Contacts / card</span>
            <input
              type="range" min={1} max={12} value={maxPeople}
              onChange={e => setMaxPeople(+e.target.value)}
            />
            <span className="ctrl-val">{maxPeople}</span>
          </div>
          <div className="ctrl-group">
            <span className="ctrl-lbl">Max recommendations</span>
            <input
              type="range" min={3} max={15} value={maxRecs}
              onChange={e => setMaxRecs(+e.target.value)}
            />
            <span className="ctrl-val">{maxRecs}</span>
          </div>
          <div style={{ marginLeft:'auto', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
            ICP Threshold: <strong style={{ color:'var(--brand)' }}>≥ {REC_THRESHOLD}</strong>
          </div>
        </div>

        {/* Error */}
        {error && <div className="error-card">⚠ {error}</div>}

        {/* Loader */}
        {loading && (
          <div className="loader-wrap">
            <div className="spinner" />
            <span className="loader-txt">Searching dataset…</span>
          </div>
        )}

        {/* Results or Landing */}
        {!loading && result && (
          <ResultsView result={result} maxPeople={maxPeople} />
        )}
        {!loading && !result && !error && (
          <LandingState stats={stats} />
        )}
      </div>
    </div>
  );
}
