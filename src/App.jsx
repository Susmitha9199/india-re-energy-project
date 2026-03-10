import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine, AreaChart, Area
} from 'recharts';
import { STATE_SUMMARY, STATE_MONTHLY, STATE_FC, YR_BY_STATE, NATIONAL_YEARLY } from './energyData.js';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const STATES = Object.keys(STATE_SUMMARY);
const NAT_AVG_USAGE = 120;
const NAT_AVG_ADEQUACY = (
  Object.values(STATE_SUMMARY).reduce((s, v) => s + v.adequacy, 0) /
  Object.values(STATE_SUMMARY).length
).toFixed(4);

const SOLAR_IDX  = { 'RAJASTHAN':92,'GUJARAT':88,'ANDHRA PRADESH':85,'TAMIL NADU':82,'TELANGANA':80,'MADHYA PRADESH':75,'MAHARASHTRA':70,'KARNATAKA':78,'KERALA':55,'BIHAR':60,'HARYANA':65,'ODISHA':68,'PUNJAB':62,'UTTAR PRADESH':67,'WEST BENGAL':58 };
const WIND_IDX   = { 'TAMIL NADU':95,'KARNATAKA':88,'GUJARAT':78,'ANDHRA PRADESH':82,'MAHARASHTRA':65,'RAJASTHAN':45,'TELANGANA':55,'KERALA':60,'MADHYA PRADESH':40,'HARYANA':50,'ODISHA':55,'PUNJAB':38,'BIHAR':30,'UTTAR PRADESH':35,'WEST BENGAL':42 };
const STATE_REGION = { 'ANDHRA PRADESH':'South','BIHAR':'East','GUJARAT':'West','HARYANA':'North','KARNATAKA':'South','KERALA':'South','MADHYA PRADESH':'Central','MAHARASHTRA':'West','ODISHA':'East','PUNJAB':'North','RAJASTHAN':'North','TAMIL NADU':'South','TELANGANA':'South','UTTAR PRADESH':'North','WEST BENGAL':'East' };

// ── QUESTIONS ─────────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: 'name', type: 'text',
    icon: '👤', title: "Let's start with you",
    subtitle: 'What should we call you? (Your name or organisation)',
    placeholder: 'e.g. Susmitha / IIT Madras Energy Lab',
  },
  {
    id: 'state', type: 'select',
    icon: '🗺️', title: 'Which Indian state are you analysing?',
    subtitle: 'We pull real generation, consumption & surplus data from CEA reports.',
    options: STATES,
  },
  {
    id: 'source', type: 'chips',
    icon: '⚡', title: 'Primary energy source mix',
    subtitle: 'Select all sources contributing to the RE generation in your region.',
    options: [
      { value:'solar',   label:'☀️ Solar'   },
      { value:'wind',    label:'🌬️ Wind'    },
      { value:'hydro',   label:'💧 Hydro'   },
      { value:'biomass', label:'🌿 Biomass' },
      { value:'grid',    label:'🔌 Grid'    },
    ],
    multi: true,
  },
  {
    id: 'usage', type: 'slider',
    icon: '📊', title: 'Monthly electricity usage',
    subtitle: 'Estimated consumption (kWh/month) for the region or facility you are studying.',
    min: 50, max: 2000, step: 10, unit: 'kWh/mo',
  },
  {
    id: 'household', type: 'cards',
    icon: '🏢', title: 'Facility / consumer type',
    subtitle: 'What best describes the consumption profile you are studying?',
    options: [
      { value:'residential',  label:'Residential',    desc:'Households & apartments',      emoji:'🏠' },
      { value:'commercial',   label:'Commercial',     desc:'Offices, malls, retail',        emoji:'🏬' },
      { value:'industrial',   label:'Industrial',     desc:'Factories, heavy load',         emoji:'🏭' },
      { value:'agricultural', label:'Agricultural',   desc:'Farms, irrigation pumps',       emoji:'🌾' },
    ],
  },
  {
    id: 'goal', type: 'cards',
    icon: '🎯', title: 'Primary research goal',
    subtitle: 'What is the main outcome of this analysis?',
    options: [
      { value:'forecast',   label:'Demand Forecast',   desc:'Predict future consumption',       emoji:'📈' },
      { value:'deficit',    label:'Deficit Reduction', desc:'Close the generation gap',         emoji:'⚠️' },
      { value:'renewable',  label:'RE Integration',    desc:'Maximise clean energy share',      emoji:'♻️' },
      { value:'policy',     label:'Policy Planning',   desc:'Inform energy policy decisions',   emoji:'📋' },
    ],
  },
];

// ── SCORE ENGINE ──────────────────────────────────────────────────────────────
function computeScore(answers) {
  const state   = STATE_SUMMARY[answers.state] || {};
  const usage   = Number(answers.usage) || 120;
  const sources = answers.source || [];

  let reScore = 0;
  if (sources.includes('solar'))   reScore += (SOLAR_IDX[answers.state] || 60);
  if (sources.includes('wind'))    reScore += (WIND_IDX[answers.state]  || 40);
  if (sources.includes('hydro'))   reScore += 55;
  if (sources.includes('biomass')) reScore += 30;
  if (sources.includes('grid'))    reScore += 10;
  reScore = Math.min(100, Math.round(reScore / Math.max(1, sources.length)));

  const effScore  = Math.max(0, Math.min(100, Math.round(100 - ((usage - 50) / 19.5))));
  const surpScore = state.surplus_mu >= 0
    ? Math.min(100, 55 + Math.round((state.surplus_mu / state.gen_mu) * 200))
    : Math.max(0,   40 + Math.round((state.surplus_mu / state.cons_mu) * 100));
  const adeqScore = Math.min(100, Math.max(0, Math.round((state.adequacy - 0.98) * 2000)));

  const overall = Math.round(reScore * 0.3 + effScore * 0.25 + surpScore * 0.25 + adeqScore * 0.2);
  return { reScore, effScore, surpScore, adeqScore, overall };
}

function getRating(score) {
  if (score >= 80) return { label: 'Excellent',       color: '#39d98a', icon: '🟢' };
  if (score >= 60) return { label: 'Good',             color: '#00e5ff', icon: '🔵' };
  if (score >= 40) return { label: 'Moderate',         color: '#ffb300', icon: '🟡' };
  return               { label: 'Needs Attention',   color: '#ff5c5c', icon: '🔴' };
}

function buildTips(answers, scores) {
  const state   = STATE_SUMMARY[answers.state] || {};
  const sources = answers.source || [];
  const usage   = Number(answers.usage) || 120;
  const tips    = [];

  if (!sources.includes('solar') && (SOLAR_IDX[answers.state] || 0) > 75)
    tips.push({ icon:'☀️', color:'#ffb300', title:'Untapped Solar Potential',
      text:`${answers.state} has a solar viability index of ${SOLAR_IDX[answers.state]}/100. Adding rooftop or utility-scale solar could significantly reduce grid dependency and improve the adequacy index.` });

  if (!sources.includes('wind') && (WIND_IDX[answers.state] || 0) > 75)
    tips.push({ icon:'🌬️', color:'#00e5ff', title:'High Wind Viability',
      text:`Wind index in ${answers.state} is ${WIND_IDX[answers.state]}/100. Wind integration can provide 24×7 baseload support especially during low-solar periods.` });

  if (state.status === 'Deficit')
    tips.push({ icon:'⚠️', color:'#ff5c5c', title:'State Currently in Deficit',
      text:`${answers.state} generated ${Math.abs(state.surplus_mu).toFixed(2)} MU less than it consumed in 2023. Demand-side management or interstate power purchase agreements are recommended.` });

  if (usage > NAT_AVG_USAGE * 1.3)
    tips.push({ icon:'📉', color:'#ff5c5c', title:'Above-Average Consumption',
      text:`Your reported usage (${usage} kWh/mo) is ${Math.round((usage/NAT_AVG_USAGE - 1)*100)}% above the national residential average. An energy audit could identify quick efficiency wins.` });

  if (answers.household === 'industrial')
    tips.push({ icon:'🏭', color:'#a78bfa', title:'Industrial Load Shifting',
      text:`Industrial consumers benefit most from time-of-use tariffs. Shifting heavy processes to off-peak solar hours (10am–3pm) can reduce costs and grid stress simultaneously.` });

  if (answers.goal === 'forecast')
    tips.push({ icon:'📈', color:'#39d98a', title:'ML Forecast Insight',
      text:`Your dataset includes statewise monthly forecasts through 2042. Consider ensemble stacking (RF + LSTM) for improved seasonal accuracy. MAPE should be tracked per month, not annually.` });

  if (sources.includes('grid') && sources.length === 1)
    tips.push({ icon:'🔌', color:'#ffb300', title:'Grid-Only Risk Exposure',
      text:`Relying solely on grid power exposes this region to tariff volatility and outage risk. A hybrid RE + battery storage model is advised for long-term resilience.` });

  if (state.adequacy < 1.0)
    tips.push({ icon:'📊', color:'#ff5c5c', title:'Adequacy Below 1.0',
      text:`An adequacy index of ${state.adequacy} means generation cannot fully meet demand. Priority actions: demand-side management, peak shaving, and accelerated RE capacity addition.` });

  return tips.slice(0, 4);
}

// ── CUSTOM TOOLTIP ────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:10, padding:'12px 16px', fontSize:12, fontFamily:'var(--sans)' }}>
      {label && <div style={{ color:'#7a8fa6', marginBottom:8, fontWeight:600 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#e2e8f0', marginBottom:3 }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── PROGRESS BAR ──────────────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  return (
    <div style={{ marginBottom:36 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:12, color:'var(--sub)', fontWeight:600, letterSpacing:1 }}>
          STEP {current + 1} OF {total}
        </span>
        <span style={{ fontSize:12, color:'var(--cyan)', fontFamily:'var(--mono)' }}>
          {Math.round(((current + 1) / total) * 100)}%
        </span>
      </div>
      <div style={{ display:'flex', gap:6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex:1, height:3, borderRadius:4,
            background: i < current ? 'var(--cyan)' : i === current ? 'var(--cyan)' : 'var(--border)',
            opacity: i < current ? 0.6 : 1,
            boxShadow: i === current ? '0 0 8px var(--cyan)' : 'none',
            transition: 'all 0.4s',
          }} />
        ))}
      </div>
    </div>
  );
}

// ── SCORE RING ────────────────────────────────────────────────────────────────
function ScoreRing({ score, color, size = 140 }) {
  const r    = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2d3d" strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition:'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)', filter:`drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:32, fontWeight:700, color, lineHeight:1 }}>{score}</span>
        <span style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>/ 100</span>
      </div>
    </div>
  );
}

// ── QUESTION SCREEN ───────────────────────────────────────────────────────────
function QuestionScreen({ q, value, onChange, onNext, onBack, idx, total }) {
  const [localVal, setLocalVal] = useState(
    value !== null && value !== undefined ? value
      : q.type === 'slider' ? q.min
      : q.type === 'chips'  ? []
      : ''
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t); }, []);

  const update = v => { setLocalVal(v); onChange(v); };
  const chipToggle = v => {
    const arr = Array.isArray(localVal) ? localVal : [];
    update(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };
  const canNext = () => {
    if (q.type === 'text')  return String(localVal).trim().length > 0;
    if (q.type === 'chips') return Array.isArray(localVal) && localVal.length > 0;
    return Boolean(localVal) || q.type === 'slider';
  };

  return (
    <div style={{
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'none' : 'translateY(24px)',
      transition: 'all 0.45s cubic-bezier(.4,0,.2,1)',
      maxWidth: 640, margin: '0 auto', padding: '0 8px',
    }}>
      <ProgressBar current={idx} total={total} />

      <div style={{ fontSize:40, marginBottom:14 }}>{q.icon}</div>
      <h2 style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:8, lineHeight:1.2 }}>{q.title}</h2>
      <p  style={{ fontSize:14, color:'var(--sub)', marginBottom:36, lineHeight:1.6 }}>{q.subtitle}</p>

      {/* TEXT */}
      {q.type === 'text' && (
        <input type="text" value={localVal} onChange={e => update(e.target.value)}
          placeholder={q.placeholder}
          onKeyDown={e => e.key === 'Enter' && canNext() && onNext()}
          style={{
            width:'100%', padding:'16px 20px', fontSize:16,
            background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
            color:'var(--text)',
          }}
        />
      )}

      {/* SELECT */}
      {q.type === 'select' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:400, overflowY:'auto', paddingRight:4 }}>
          {q.options.map(opt => (
            <div key={opt} onClick={() => update(opt)} style={{
              padding:'14px 20px', borderRadius:12, cursor:'pointer',
              border:`1px solid ${localVal === opt ? 'var(--cyan)' : 'var(--border)'}`,
              background: localVal === opt ? 'rgba(0,229,255,0.08)' : 'var(--card)',
              color: localVal === opt ? 'var(--cyan)' : 'var(--text)',
              fontWeight: localVal === opt ? 700 : 400, fontSize:15,
              transition:'all 0.2s',
              boxShadow: localVal === opt ? '0 0 14px rgba(0,229,255,0.18)' : 'none',
            }}>
              {opt}
            </div>
          ))}
        </div>
      )}

      {/* CHIPS */}
      {q.type === 'chips' && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
          {q.options.map(opt => {
            const sel = Array.isArray(localVal) && localVal.includes(opt.value);
            return (
              <div key={opt.value} onClick={() => chipToggle(opt.value)} style={{
                padding:'12px 24px', borderRadius:40, cursor:'pointer',
                border:`1px solid ${sel ? 'var(--cyan)' : 'var(--border)'}`,
                background: sel ? 'rgba(0,229,255,0.12)' : 'var(--card)',
                color: sel ? 'var(--cyan)' : 'var(--sub)',
                fontWeight: sel ? 700 : 400, fontSize:14,
                transition:'all 0.2s',
                boxShadow: sel ? '0 0 12px rgba(0,229,255,0.2)' : 'none',
              }}>{opt.label}</div>
            );
          })}
          <p style={{ width:'100%', fontSize:12, color:'var(--muted)', marginTop:4 }}>Select one or more</p>
        </div>
      )}

      {/* SLIDER */}
      {q.type === 'slider' && (
        <div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:16 }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:48, fontWeight:700, color:'var(--cyan)', lineHeight:1 }}>{localVal}</span>
            <span style={{ color:'var(--sub)', marginBottom:8 }}>{q.unit}</span>
          </div>
          <input type="range" min={q.min} max={q.max} step={q.step}
            value={localVal} onChange={e => update(Number(e.target.value))} />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:12, color:'var(--muted)' }}>
            <span>{q.min} {q.unit}</span><span>{q.max} {q.unit}</span>
          </div>
          <div style={{ marginTop:20, padding:'14px 18px', borderRadius:12, background:'var(--card)', border:'1px solid var(--border)', fontSize:13 }}>
            🇮🇳 National avg (residential): <strong style={{ color:'var(--text)' }}>120 kWh/mo</strong>
            {localVal > NAT_AVG_USAGE
              ? <span style={{ color:'var(--red)', marginLeft:8 }}>↑ {Math.round((localVal/NAT_AVG_USAGE-1)*100)}% above avg</span>
              : <span style={{ color:'var(--green)', marginLeft:8 }}>↓ {Math.round((1-localVal/NAT_AVG_USAGE)*100)}% below avg</span>
            }
          </div>
        </div>
      )}

      {/* CARDS */}
      {q.type === 'cards' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {q.options.map(opt => (
            <div key={opt.value} onClick={() => update(opt.value)} style={{
              padding:'22px', borderRadius:14, cursor:'pointer',
              border:`1px solid ${localVal === opt.value ? 'var(--cyan)' : 'var(--border)'}`,
              background: localVal === opt.value ? 'rgba(0,229,255,0.07)' : 'var(--card)',
              transition:'all 0.2s',
              boxShadow: localVal === opt.value ? '0 0 18px rgba(0,229,255,0.2)' : 'none',
            }}>
              <div style={{ fontSize:32, marginBottom:10 }}>{opt.emoji}</div>
              <div style={{ fontSize:15, fontWeight:700, color: localVal === opt.value ? 'var(--cyan)' : 'var(--text)', marginBottom:4 }}>{opt.label}</div>
              <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.5 }}>{opt.desc}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:12, marginTop:40 }}>
        {idx > 0 && (
          <button onClick={onBack} style={{
            padding:'14px 28px', borderRadius:12, border:'1px solid var(--border)',
            background:'transparent', color:'var(--sub)', fontSize:14, fontWeight:600,
          }}>← Back</button>
        )}
        <button onClick={onNext} disabled={!canNext()} style={{
          flex:1, padding:'16px 28px', borderRadius:12,
          background: canNext() ? 'var(--cyan)' : 'var(--border)',
          color: canNext() ? '#07090f' : 'var(--muted)',
          fontSize:15, fontWeight:800, letterSpacing:0.5,
          cursor: canNext() ? 'pointer' : 'not-allowed',
          boxShadow: canNext() ? '0 0 24px rgba(0,229,255,0.4)' : 'none',
          transition:'all 0.25s',
        }}>
          {idx === total - 1 ? '⚡ Generate Report' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

// ── LOADING ───────────────────────────────────────────────────────────────────
function LoadingScreen({ name }) {
  const [step, setStep] = useState(0);
  const steps = [
    'Loading CEA state energy data…',
    'Computing RE viability scores…',
    'Analysing monthly surplus/deficit trends…',
    'Running demand forecast model…',
    'Benchmarking against national averages…',
    'Generating personalised insights…',
  ];
  useEffect(() => {
    const iv = setInterval(() => setStep(s => Math.min(s+1, steps.length-1)), 550);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ maxWidth:520, margin:'80px auto', textAlign:'center', padding:'0 16px' }}>
      <div style={{ fontSize:56, marginBottom:20 }}>⚡</div>
      <h2 style={{ fontSize:24, fontWeight:800, color:'var(--cyan)', marginBottom:6 }}>
        Analysing for {name}…
      </h2>
      <p style={{ color:'var(--sub)', fontSize:14, marginBottom:36 }}>Pulling real data from CEA statewise reports</p>
      <div style={{ height:4, background:'var(--border)', borderRadius:4, marginBottom:32, overflow:'hidden' }}>
        <div style={{
          height:'100%', borderRadius:4,
          background:'linear-gradient(90deg, var(--cyan), var(--green))',
          width:`${((step+1)/steps.length)*100}%`,
          transition:'width 0.5s ease',
        }} />
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{
          padding:'9px 16px', marginBottom:8, borderRadius:8, fontSize:13,
          background: i <= step ? 'rgba(0,229,255,0.07)' : 'transparent',
          color: i < step ? 'var(--green)' : i === step ? 'var(--cyan)' : 'var(--muted)',
          border:`1px solid ${i <= step ? 'rgba(0,229,255,0.2)' : 'transparent'}`,
          transition:'all 0.4s', textAlign:'left',
        }}>
          {i < step ? '✓ ' : i === step ? '⟳ ' : '· '}{s}
        </div>
      ))}
    </div>
  );
}

// ── REPORT SCREEN ─────────────────────────────────────────────────────────────
function ReportScreen({ answers, onReset }) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const scores   = computeScore(answers);
  const tips     = buildTips(answers, scores);
  const state    = STATE_SUMMARY[answers.state] || {};
  const rating   = getRating(scores.overall);
  const monthly  = STATE_MONTHLY[answers.state]  || [];
  const forecast = STATE_FC[answers.state]        || [];
  const yearly   = YR_BY_STATE[answers.state]     || [];
  const sources  = answers.source || [];

  const radarData = [
    { axis:'RE Score',   val: scores.reScore   },
    { axis:'Efficiency', val: scores.effScore   },
    { axis:'Surplus',    val: scores.surpScore  },
    { axis:'Adequacy',   val: scores.adeqScore  },
  ];

  const stateComparison = Object.entries(STATE_SUMMARY).map(([k, v]) => ({
    state:   k.split(' ')[0],
    fullName: k,
    gen:     v.gen_mu,
    cons:    v.cons_mu,
    surplus: v.surplus_mu,
    isSelected: k === answers.state,
  })).sort((a,b) => b.gen - a.gen);

  const combinedTrend = [
    ...monthly.slice(-12).map(d => ({ ...d, type:'actual' })),
    ...forecast.slice(0, 12).map(d => ({ ...d, type:'forecast' })),
  ];

  const TABS = [
    { id:'overview',  label:'📊 Overview'   },
    { id:'trends',    label:'📈 Trends'     },
    { id:'forecast',  label:'🔮 Forecast'   },
    { id:'compare',   label:'🗺️ Compare'   },
    { id:'insights',  label:'💡 Insights'   },
  ];

  return (
    <div style={{
      opacity: mounted ? 1 : 0, transition:'opacity 0.6s',
      maxWidth:960, margin:'0 auto', padding:'0 8px',
    }}>
      {/* ── HEADER ── */}
      <div style={{
        background:'linear-gradient(135deg,#0d1b2e,#071220)',
        border:'1px solid var(--border)', borderRadius:20,
        padding:'32px 36px', marginBottom:24,
        display:'flex', alignItems:'flex-start', justifyContent:'space-between',
        flexWrap:'wrap', gap:24,
      }}>
        <div style={{ flex:1, minWidth:260 }}>
          <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:3, textTransform:'uppercase', marginBottom:10 }}>
            🇮🇳 India RE Energy Analysis Report
          </div>
          <h1 style={{ fontSize:30, fontWeight:800, marginBottom:6 }}>{answers.name}</h1>
          <p  style={{ fontSize:14, color:'var(--sub)', marginBottom:20 }}>
            {answers.state} · {answers.household} · {sources.join(', ')}
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            <span style={{
              padding:'6px 16px', borderRadius:20, fontSize:13, fontWeight:600,
              background:`${rating.color}18`, color:rating.color,
              border:`1px solid ${rating.color}44`,
            }}>{rating.icon} {rating.label}</span>
            <span style={{
              padding:'6px 16px', borderRadius:20, fontSize:13, fontWeight:600,
              background: state.status === 'Surplus' ? 'rgba(57,217,138,0.12)' : 'rgba(255,92,92,0.12)',
              color: state.status === 'Surplus' ? 'var(--green)' : 'var(--red)',
              border:`1px solid ${state.status === 'Surplus' ? 'rgba(57,217,138,0.4)' : 'rgba(255,92,92,0.4)'}`,
            }}>{state.status === 'Surplus' ? '✅' : '⚠️'} {state.status}</span>
            <span style={{
              padding:'6px 16px', borderRadius:20, fontSize:13, fontWeight:600,
              background:'rgba(167,139,250,0.1)', color:'var(--purple)',
              border:'1px solid rgba(167,139,250,0.3)',
            }}>📍 {STATE_REGION[answers.state] || 'India'}</span>
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <ScoreRing score={scores.overall} color={rating.color} size={140} />
          <p style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>Overall RE Score</p>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {[
          { icon:'⚡', label:'RE Generation',    val:`${state.gen_mu} MU`,    color:'var(--cyan)' },
          { icon:'📉', label:'Consumption',       val:`${state.cons_mu} MU`,   color:'var(--red)'  },
          { icon: state.surplus_mu >= 0 ? '📈' : '📉',
            label:'Surplus / Deficit',
            val:`${state.surplus_mu >= 0 ? '+' : ''}${state.surplus_mu} MU`,
            color: state.surplus_mu >= 0 ? 'var(--green)' : 'var(--red)' },
          { icon:'⚖️', label:'Adequacy Index',    val:`${state.adequacy}×`,    color:'var(--amber)' },
        ].map((k, i) => (
          <div key={i} style={{
            background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
            padding:'18px 18px', display:'flex', flexDirection:'column', gap:8,
          }}>
            <span style={{ fontSize:22 }}>{k.icon}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:k.color }}>{k.val}</span>
            <span style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* ── TAB NAV ── */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding:'9px 18px', borderRadius:10,
            border:`1px solid ${activeTab === t.id ? 'var(--cyan)' : 'var(--border)'}`,
            background: activeTab === t.id ? 'rgba(0,229,255,0.1)' : 'var(--card)',
            color: activeTab === t.id ? 'var(--cyan)' : 'var(--sub)',
            fontSize:13, fontWeight: activeTab === t.id ? 700 : 400,
            boxShadow: activeTab === t.id ? '0 0 12px rgba(0,229,255,0.2)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div style={{ animation:'fadeUp 0.4s ease both' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
            {/* Radar */}
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 20px' }}>
              <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:16 }}>Dimension Scores</p>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill:'var(--sub)', fontSize:11 }} />
                  <PolarRadiusAxis angle={30} domain={[0,100]} tick={{ fill:'var(--muted)', fontSize:9 }} />
                  <Radar name="Score" dataKey="val" stroke="var(--cyan)" fill="var(--cyan)" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {/* Yearly trend */}
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 20px' }}>
              <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>Yearly RE Trend — {answers.state}</p>
              <p style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>2020–2023 actual (MU)</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yearly.filter(d => d.year <= 2023)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={{ fill:'var(--muted)', fontSize:11 }} />
                  <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize:11 }} />
                  <Bar dataKey="gen_mu"  name="Generation" fill="var(--cyan)"  opacity={0.85} radius={[4,4,0,0]} />
                  <Bar dataKey="cons_mu" name="Consumption" fill="var(--red)"  opacity={0.6}  radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Nat benchmark */}
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px' }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:20 }}>Benchmarks vs National Average</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
              {[
                { label:'Your Usage vs Nat. Avg', yours:answers.usage, nat:NAT_AVG_USAGE, unit:'kWh/mo',
                  better: Number(answers.usage) <= NAT_AVG_USAGE },
                { label:'State Adequacy vs Nat. Avg', yours:state.adequacy, nat:Number(NAT_AVG_ADEQUACY), unit:'×',
                  better: state.adequacy >= Number(NAT_AVG_ADEQUACY) },
                { label:'RE Score vs Good Threshold', yours:scores.overall, nat:60, unit:'pts',
                  better: scores.overall >= 60 },
              ].map((row, i) => (
                <div key={i} style={{ padding:'18px', background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)' }}>
                  <p style={{ fontSize:11, color:'var(--muted)', marginBottom:14, lineHeight:1.5 }}>{row.label}</p>
                  <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
                    <div>
                      <p style={{ fontSize:10, color:'var(--muted)' }}>Yours</p>
                      <p style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color: row.better ? 'var(--green)' : 'var(--red)' }}>
                        {typeof row.yours === 'number' ? row.yours.toFixed ? row.yours.toFixed(2) : row.yours : row.yours}
                      </p>
                    </div>
                    <p style={{ fontSize:16, color:'var(--muted)', marginBottom:2 }}>vs</p>
                    <div>
                      <p style={{ fontSize:10, color:'var(--muted)' }}>National</p>
                      <p style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color:'var(--sub)' }}>
                        {typeof row.nat === 'number' ? row.nat.toFixed ? row.nat.toFixed(2) : row.nat : row.nat}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{row.unit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {activeTab === 'trends' && (
        <div style={{ animation:'fadeUp 0.4s ease both' }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px', marginBottom:20 }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>Monthly Generation vs Consumption — {answers.state}</p>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Last 24 months of actual data (MU)</p>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthly}>
                <defs>
                  <linearGradient id="gGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00e5ff" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gCons" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff5c5c" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ff5c5c" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill:'var(--muted)', fontSize:10 }} interval={3} />
                <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Area type="monotone" dataKey="gen_mu"  name="Generation"  stroke="#00e5ff" fill="url(#gGen)"  strokeWidth={2.5} />
                <Area type="monotone" dataKey="cons_mu" name="Consumption" stroke="#ff5c5c" fill="url(#gCons)" strokeWidth={2.5} strokeDasharray="5 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px' }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>Monthly Surplus / Deficit (MU)</p>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Positive = surplus, negative = deficit</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill:'var(--muted)', fontSize:10 }} interval={3} />
                <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} />
                <Tooltip content={<ChartTip />} />
                <ReferenceLine y={0} stroke="var(--border2)" strokeWidth={2} />
                <Bar dataKey="surplus_mu" name="Surplus MU" radius={[3,3,0,0]}>
                  {monthly.map((d, i) => (
                    <Cell key={i} fill={d.surplus_mu >= 0 ? 'var(--green)' : 'var(--red)'} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── FORECAST TAB ── */}
      {activeTab === 'forecast' && (
        <div style={{ animation:'fadeUp 0.4s ease both' }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px', marginBottom:20 }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>12-Month RE Demand Forecast — {answers.state}</p>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Model-projected generation & consumption for 2024–2025 (MU)</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill:'var(--muted)', fontSize:10 }} interval={1} angle={-20} textAnchor="end" height={40} />
                <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Line type="monotone" dataKey="gen_mu"  name="Forecast Gen"   stroke="var(--cyan)"  strokeWidth={2.5} dot={{ fill:'var(--cyan)',  r:4 }} />
                <Line type="monotone" dataKey="cons_mu" name="Forecast Cons"  stroke="var(--amber)" strokeWidth={2.5} dot={{ fill:'var(--amber)', r:4 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px' }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>Actual → Forecast Transition</p>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Last 12 actual months + 12 forecasted months</p>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={combinedTrend}>
                <defs>
                  <linearGradient id="gFC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill:'var(--muted)', fontSize:9 }} interval={3} />
                <YAxis tick={{ fill:'var(--muted)', fontSize:11 }} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Area type="monotone" dataKey="gen_mu" name="Generation (MU)" stroke="var(--purple)" fill="url(#gFC)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── COMPARE TAB ── */}
      {activeTab === 'compare' && (
        <div style={{ animation:'fadeUp 0.4s ease both' }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px', marginBottom:20 }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>All States — RE Generation (MU, 2023)</p>
            <p style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}><span style={{ color:'var(--cyan)' }}>Cyan</span> = your selected state ({answers.state})</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stateComparison} layout="vertical" margin={{ left:100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill:'var(--muted)', fontSize:10 }} />
                <YAxis type="category" dataKey="state" tick={{ fill:'var(--sub)', fontSize:11 }} width={100} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="gen" name="Generation MU" radius={[0,4,4,0]}>
                  {stateComparison.map((d, i) => (
                    <Cell key={i} fill={d.isSelected ? 'var(--cyan)' : 'var(--muted)'} opacity={d.isSelected ? 1 : 0.5} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px' }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:20 }}>State Surplus / Deficit Ranking (MU, 2023)</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[...stateComparison].sort((a,b) => b.surplus - a.surplus)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="state" tick={{ fill:'var(--muted)', fontSize:9 }} angle={-30} textAnchor="end" height={48} />
                <YAxis tick={{ fill:'var(--muted)', fontSize:10 }} />
                <Tooltip content={<ChartTip />} />
                <ReferenceLine y={0} stroke="var(--border2)" strokeWidth={2} />
                <Bar dataKey="surplus" name="Surplus MU" radius={[3,3,0,0]}>
                  {[...stateComparison].sort((a,b) => b.surplus - a.surplus).map((d, i) => (
                    <Cell key={i}
                      fill={d.isSelected ? 'var(--cyan)' : d.surplus >= 0 ? 'var(--green)' : 'var(--red)'}
                      opacity={d.isSelected ? 1 : 0.65}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── INSIGHTS TAB ── */}
      {activeTab === 'insights' && (
        <div style={{ animation:'fadeUp 0.4s ease both' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            {tips.map((tip, i) => (
              <div key={i} style={{
                padding:'22px', borderRadius:14,
                background:'var(--card)', border:`1px solid ${tip.color}22`,
                boxShadow:`0 0 16px ${tip.color}10`,
              }}>
                <div style={{ fontSize:28, marginBottom:10 }}>{tip.icon}</div>
                <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:8 }}>{tip.title}</h3>
                <p  style={{ fontSize:13, color:'var(--sub)', lineHeight:1.7 }}>{tip.text}</p>
              </div>
            ))}
          </div>
          {/* Formula reference */}
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'22px 24px' }}>
            <p style={{ fontSize:11, color:'var(--muted)', letterSpacing:2, textTransform:'uppercase', marginBottom:20 }}>Formulas & Methodology</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { f:'Surplus = Generation − Consumption',        d:'Energy balance per period' },
                { f:'Adequacy = Generation / Consumption',       d:'Values > 1 indicate self-sufficiency' },
                { f:'MAPE = mean(|Actual − Predicted| / Actual)',d:'Forecast accuracy metric (lower = better)' },
                { f:'RE Score = Σ(wᵢ · dimensionᵢ)',            d:'Weighted composite index' },
              ].map((item, i) => (
                <div key={i} style={{ padding:'14px 16px', background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)' }}>
                  <p style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--cyan)', marginBottom:6 }}>{item.f}</p>
                  <p style={{ fontSize:11, color:'var(--muted)' }}>{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:36, paddingTop:24, borderTop:'1px solid var(--border)' }}>
        <p style={{ fontSize:11, color:'var(--muted)' }}>
          Data: CEA Statewise RE Reports · Monthly & Yearly · 2020–2023 actuals + 2024–2025 forecast
        </p>
        <button onClick={onReset} style={{
          padding:'12px 32px', borderRadius:12,
          border:'1px solid var(--cyan)', background:'transparent',
          color:'var(--cyan)', fontSize:14, fontWeight:700, letterSpacing:0.5,
        }}>↺ New Analysis</button>
      </div>
    </div>
  );
}

// ── LANDING ───────────────────────────────────────────────────────────────────
function Landing({ onStart }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      maxWidth:680, margin:'60px auto', textAlign:'center', padding:'0 16px',
      opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(20px)',
      transition:'all 0.5s cubic-bezier(.4,0,.2,1)',
    }}>
      <div style={{ fontSize:64, marginBottom:24, filter:'drop-shadow(0 0 20px rgba(0,229,255,0.5))' }}>⚡</div>
      <h1 style={{ fontSize:40, fontWeight:800, lineHeight:1.15, marginBottom:16 }}>
        India RE Energy<br />
        <span style={{ color:'var(--cyan)', textShadow:'0 0 30px rgba(0,229,255,0.4)' }}>Analyst Assessment</span>
      </h1>
      <p style={{ fontSize:16, color:'var(--sub)', lineHeight:1.8, marginBottom:48, maxWidth:520, margin:'0 auto 48px' }}>
        Answer 6 questions about your state and energy profile. Get a personalised report powered by
        real CEA statewise data — generation, surplus, demand forecasting, and recommendations.
      </p>
      <div style={{ display:'flex', justifyContent:'center', flexWrap:'wrap', gap:12, marginBottom:48 }}>
        {['🗺️ 15 States', '📊 Real CEA Data (2020–2023)', '🔮 Forecast to 2025', '💡 Personalised Tips', '📈 5 Report Views'].map((b, i) => (
          <div key={i} style={{ padding:'8px 18px', borderRadius:20, background:'var(--card)', border:'1px solid var(--border)', fontSize:13, color:'var(--sub)' }}>{b}</div>
        ))}
      </div>
      <button onClick={onStart} className="animate-glow" style={{
        padding:'18px 56px', borderRadius:14, border:'none',
        background:'linear-gradient(135deg, var(--cyan), #0099cc)',
        color:'#07090f', fontSize:18, fontWeight:800, letterSpacing:0.5,
        boxShadow:'0 0 40px rgba(0,229,255,0.35)',
      }}>Begin Assessment →</button>
      <p style={{ marginTop:16, fontSize:12, color:'var(--muted)' }}>~2 minutes · 6 questions · Instant personalised report</p>
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [phase,   setPhase]   = useState('landing');
  const [qIdx,    setQIdx]    = useState(0);
  const [answers, setAnswers] = useState({});
  const [curVal,  setCurVal]  = useState(null);

  const startQuiz = () => { setPhase('quiz'); setQIdx(0); setAnswers({}); setCurVal(null); };

  const handleNext = () => {
    const q   = QUESTIONS[qIdx];
    const val = curVal !== null ? curVal : q.type === 'slider' ? q.min : q.type === 'chips' ? [] : '';
    const newA = { ...answers, [q.id]: val };
    setAnswers(newA);
    setCurVal(null);
    if (qIdx < QUESTIONS.length - 1) {
      setQIdx(qIdx + 1);
    } else {
      setPhase('loading');
      setTimeout(() => setPhase('report'), 3800);
    }
  };

  const handleBack = () => {
    if (qIdx > 0) {
      setQIdx(qIdx - 1);
      setCurVal(answers[QUESTIONS[qIdx - 1].id] ?? null);
    } else {
      setPhase('landing');
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', padding:'40px 24px' }}>
      {phase === 'landing' && <Landing onStart={startQuiz} />}

      {phase === 'quiz' && (
        <QuestionScreen
          key={qIdx}
          q={QUESTIONS[qIdx]}
          value={answers[QUESTIONS[qIdx].id] ?? null}
          onChange={setCurVal}
          onNext={handleNext}
          onBack={handleBack}
          idx={qIdx}
          total={QUESTIONS.length}
        />
      )}

      {phase === 'loading' && <LoadingScreen name={answers.name || 'you'} />}

      {phase === 'report' && (
        <ReportScreen
          answers={{ ...answers, usage: answers.usage ?? 120 }}
          onReset={startQuiz}
        />
      )}
    </div>
  );
}
