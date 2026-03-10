import { useState, useEffect, useRef } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://bqboyursgerrejqvmvhq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYm95dXJzZ2VycmVqcXZtdmhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTc0NDQsImV4cCI6MjA4ODYzMzQ0NH0.OPudQau6wVdUfKzLCMCxKG5F5VlYhCL_1Sfak0V1F8o";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const sbFetch = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};
const sbSafe = async (fn, fallback = null, setOnline) => {
  try { const r = await fn(); if (setOnline) setOnline(true); return r; }
  catch (e) { console.error("Supabase error:", e); if (setOnline) setOnline(false); return fallback; }
};

// ─── LOCAL STORAGE ────────────────────────────────────────────────────────────
const LS = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const FAMILY_KEY = "fq_family";
const getFamily = () => LS.get(FAMILY_KEY);
const saveFamily = (f) => LS.set(FAMILY_KEY, f);
const clearFamily = () => LS.del(FAMILY_KEY);

// ─── SUPABASE OPS ─────────────────────────────────────────────────────────────
const makeCode = () => String(Math.floor(1000 + Math.random() * 9000));
const todayStr = () => new Date().toISOString().split("T")[0];

async function registerFamily(name, pin, setOnline) {
  return sbSafe(async () => {
    const ex = await sbFetch(`families?name=eq.${encodeURIComponent(name)}&select=*`);
    if (ex && ex.length > 0) {
      return ex[0].pin === pin ? { ok: true, data: ex[0] } : { ok: false, error: "PIN שגוי" };
    }
    const newUser = await sbFetch("families", { 
      method: "POST", 
      body: JSON.stringify({ name, pin, created_at: new Date().toISOString() }) 
    });
    return { ok: true, data: newUser[0] };
  }, { ok: false, error: "שגיאת תקשורת" }, setOnline);
}

async function upsertScore(familyName, pct, setOnline) {
  return sbSafe(async () => {
    const ex = await sbFetch(`family_scores?family_name=eq.${encodeURIComponent(familyName)}&select=*`);
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (ex && ex.length > 0) {
      const r = ex[0];
      let streak = r.streak;
      if (r.last_played === yesterday) streak += 1;
      else if (r.last_played !== today) streak = 1; // תיקון: אם שיחקו היום, הסטריק נשאר
      
      await sbFetch(`family_scores?family_name=eq.${encodeURIComponent(familyName)}`, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({ weekly_points: r.weekly_points + pct, total_games: r.total_games + 1, streak, last_played: today }),
      });
    } else {
      await sbFetch("family_scores", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({ family_name: familyName, weekly_points: pct, total_games: 1, streak: 1, last_played: today }),
      });
    }
  }, null, setOnline);
}

// ─── AI & JSON REPAIR ────────────────────────────────────────────────────────
const smartParse = (str) => {
  try {
    let clean = str.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    try { return JSON.parse(clean); } catch (e) {}

    // מנגנון תיקון קטיעות
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace !== -1) {
      let repaired = clean.substring(0, lastBrace + 1);
      if (!repaired.endsWith(']')) repaired += ']';
      if (!repaired.startsWith('[')) repaired = '[' + repaired;
      return JSON.parse(repaired);
    }
    throw new Error("JSON שבור מדי");
  } catch (err) {
    console.error("Parse error:", err);
    return [];
  }
};

async function generateQuestions(topic, members) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, members }),
  });
  
  const data = await res.json();
  if (!data.content || !data.content[0]) throw new Error("תשובה ריקה מה-AI");
  
  return smartParse(data.content[0].text);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const ag = (age) => {
  if (age <= 5)  return { label: "גן",     color: "#f472b6", emoji: "🌸", qCount: 5,  timer: 0,  bonus: false };
  if (age <= 8)  return { label: "צעיר",   color: "#34d399", emoji: "🌱", qCount: 5,  timer: 30, bonus: false };
  if (age <= 12) return { label: "בינוני", color: "#60a5fa", emoji: "⚡", qCount: 8,  timer: 20, bonus: true  };
  return              { label: "מתקדם",  color: "#a78bfa", emoji: "🔥", qCount: 8,  timer: 15, bonus: true  };
};

const C = {
  card: { background: "rgba(255,255,255,0.055)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 22, padding: "18px", marginBottom: 14 },
  lbl:  { color: "#64748b", fontFamily: "'Fredoka One',cursive", fontSize: 13, display: "block", marginBottom: 7 },
  inp:  { width: "100%", background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 16, fontFamily: "'Varela Round',sans-serif", outline: "none", transition: "border-color 0.2s", marginBottom: 4 },
  btnP: { width: "100%", padding: "15px", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", borderRadius: 18, color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 20, cursor: "pointer", boxShadow: "0 4px 24px #7c3aed55", transition: "all 0.2s", marginBottom: 8, display: "block" },
  btnS: { width: "100%", padding: "13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, color: "#94a3b8", fontFamily: "'Fredoka One',cursive", fontSize: 16, cursor: "pointer", transition: "all 0.2s", marginBottom: 8, display: "block" },
};

// ─── MAIN APP COMPONENT ──────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [family, setFamily] = useState(getFamily());
  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");

  const handleStartQuiz = async (selectedTopic) => {
    setLoading(true);
    setTopic(selectedTopic);
    try {
      const questions = await generateQuestions(selectedTopic, family.members);
      setQuizData(questions);
      setScreen("quiz");
    } catch (err) {
      alert("שגיאה בייצור החידון. נסו נושא אחר.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "#fff", padding: 20 }}>
      {loading && <div style={{ textAlign: "center", marginTop: 50 }}>טוען חידון... 🧠</div>}
      
      {!loading && screen === "welcome" && (
        <WelcomeScreen onDone={(f) => { setFamily(f); setScreen("home"); }} />
      )}

      {!loading && screen === "home" && family && (
        <div style={{ textAlign: "center" }}>
          <h1>שלום משפחת {family.name}!</h1>
          <input style={C.inp} placeholder="על מה נשחק היום?" value={topic} onChange={e => setTopic(e.target.value)} />
          <button style={C.btnP} onClick={() => handleStartQuiz(topic)}>התחל חידון</button>
        </div>
      )}

      {!loading && screen === "quiz" && quizData && (
        <QuizScreen 
          quizData={quizData} 
          members={family.members} 
          onFinish={(score) => { upsertScore(family.name, score); setScreen("home"); }} 
        />
      )}
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
function WelcomeScreen({ onDone }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const go = async () => {
    const res = await registerFamily(name, pin);
    if (res.ok) onDone(res.data);
    else setErr(res.error);
  };

  return (
    <div style={C.card}>
      <h2>ברוכים הבאים!</h2>
      {err && <p style={{ color: "red" }}>{err}</p>}
      <input style={C.inp} placeholder="שם משפחה" value={name} onChange={e => setName(e.target.value)} />
      <input style={C.inp} placeholder="PIN (4 ספרות)" type="password" value={pin} onChange={e => setPin(e.target.value)} />
      <button style={C.btnP} onClick={go}>כניסה</button>
    </div>
  );
}

function QuizScreen({ quizData, onFinish }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const q = quizData[idx];

  const next = (isCorrect) => {
    if (isCorrect) setScore(s => s + 10);
    if (idx + 1 < quizData.length) setIdx(idx + 1);
    else onFinish(score + (isCorrect ? 10 : 0));
  };

  if (!q) return null;

  return (
    <div style={C.card}>
      <p style={{ color: "#a78bfa" }}>תור של: {q.m}</p>
      <h3>{q.q}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.o.map((opt, i) => (
          <button key={i} style={C.btnS} onClick={() => next(i === q.a)}>{opt}</button>
        ))}
      </div>
    </div>
  );
}