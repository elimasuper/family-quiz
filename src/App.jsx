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
    const ex = await sbFetch(`families?name=eq.${encodeURIComponent(name)}&select=name,pin`);
    if (ex && ex.length > 0) {
      return ex[0].pin === pin ? { ok: true } : { ok: false, error: "PIN שגוי" };
    }
    await sbFetch("families", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ name, pin, created_at: new Date().toISOString() }) });
    return { ok: true };
  }, { ok: false, error: "שגיאת תקשורת" }, setOnline);
}

async function saveQuizRoom(code, topic, familyName, familyPct, setOnline) {
  return sbSafe(() => sbFetch("quiz_rooms", {
    method: "POST", prefer: "return=minimal",
    body: JSON.stringify({ code, topic, creator_family: familyName, creator_pct: familyPct, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }),
  }), null, setOnline);
}

async function loadQuizByCode(code, setOnline) {
  return sbSafe(async () => {
    const r = await sbFetch(`quiz_rooms?code=eq.${code}&select=*`);
    return r && r.length > 0 ? r[0] : null;
  }, null, setOnline);
}

async function saveChallenge(code, familyName, familyPct, setOnline) {
  return sbSafe(() => sbFetch("quiz_challenges", {
    method: "POST", prefer: "return=minimal",
    body: JSON.stringify({ code, family_name: familyName, family_pct: familyPct, played_at: new Date().toISOString() }),
  }), null, setOnline);
}

async function getChallenges(code, setOnline) {
  return sbSafe(async () => {
    const r = await sbFetch(`quiz_challenges?code=eq.${code}&select=family_name,family_pct&order=family_pct.desc&limit=20`);
    return r || [];
  }, [], setOnline);
}

async function hasPlayedQuiz(code, familyName, setOnline) {
  return sbSafe(async () => {
    const r = await sbFetch(`quiz_challenges?code=eq.${code}&family_name=eq.${encodeURIComponent(familyName)}&select=id&limit=1`);
    return r && r.length > 0;
  }, false, setOnline);
}

async function getMonthlyBoard(setOnline) {
  return sbSafe(async () => {
    const [pts, avg] = await Promise.all([
      sbFetch(`family_scores?select=family_name,monthly_points&order=monthly_points.desc&limit=10`),
      sbFetch(`family_scores?select=family_name,monthly_avg,monthly_games&order=monthly_avg.desc&limit=10`),
    ]);
    return { pts: pts||[], avg: avg||[] };
  }, { pts:[], avg:[] }, setOnline);
}

async function upsertScore(familyName, rawScore, pct, setOnline) {
  return sbSafe(async () => {
    const ex = await sbFetch(`family_scores?family_name=eq.${encodeURIComponent(familyName)}&select=*`);
    const today = todayStr();
    const thisMonth = today.slice(0,7); // "2026-03"
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (ex && ex.length > 0) {
      const r = ex[0];
      let streak = r.streak;
      if (r.last_played === yesterday) streak += 1;
      else if (r.last_played !== today) streak = 1;
      // חודשי: אפס אם חודש חדש
      const sameMonth = (r.last_month || "") === thisMonth;
      const mGames = sameMonth ? (r.monthly_games||0)+1 : 1;
      const mPoints = sameMonth ? (r.monthly_points||0)+rawScore : rawScore;
      const mAvg = sameMonth ? Math.round(((r.monthly_avg||0)*(mGames-1)+pct)/mGames) : pct;
      await sbFetch(`family_scores?family_name=eq.${encodeURIComponent(familyName)}`, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({ weekly_points: rawScore, total_games: r.total_games+1, streak, last_played: today, last_month: thisMonth, monthly_points: mPoints, monthly_games: mGames, monthly_avg: mAvg }),
      });
    } else {
      await sbFetch("family_scores", {
        method: "POST", prefer: "return=minimal",
        body: JSON.stringify({ family_name: familyName, weekly_points: rawScore, total_games: 1, streak: 1, last_played: today, last_month: thisMonth, monthly_points: rawScore, monthly_games: 1, monthly_avg: pct }),
      });
    }
  }, null, setOnline);
}

// ─── WIKIPEDIA ────────────────────────────────────────────────────────────────
const ag = (age) => {
  if (age <= 5)  return { label: "גן",     color: "#f472b6", emoji: "🌸", qCount: 5,  timer: 0,  bonus: false };
  if (age <= 9)  return { label: "צעיר",   color: "#34d399", emoji: "🌱", qCount: 5,  timer: 0,  bonus: false };
  if (age <= 12) return { label: "בינוני", color: "#60a5fa", emoji: "⚡", qCount: 8,  timer: 20, bonus: true  };
  return              { label: "מתקדם",  color: "#a78bfa", emoji: "🔥", qCount: 8,  timer: 15, bonus: true  };
};

async function fetchWiki(topic) {
  const get = async (title) => {
    const r = await fetch(`https://he.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=true&exsectionformat=plain&format=json&origin=*&redirects=1`);
    const d = await r.json();
    const p = Object.values(d.query.pages)[0];
    if (p.extract && p.extract.length >= 300) return { text: p.extract.slice(0, 2000), lang: "he", title: p.title };
    return null;
  };
  const direct = await get(topic);
  if (direct) return direct;
  const sr = await fetch(`https://he.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=3&format=json&origin=*`);
  const hits = ((await sr.json())?.query?.search) || [];
  for (const h of hits) { const r = await get(h.title); if (r) return r; }
  throw new Error(`לא נמצא מאמר בויקיפדיה על "${topic}". נסו נושא אחר.`);
}

// ─── AI ───────────────────────────────────────────────────────────────────────
async function generateQuestions(wikiText, wikiLang, members, seed = "") {
  const desc = members.map(m => { const g = ag(m.age); return `- ${m.name}, גיל ${m.age}: ${g.qCount} שאלות, רמה ${g.label}`; }).join("\n");
  const rules = members.map(m => {
    if (m.age <= 5)  return `${m.name} (גיל ${m.age}): שאלות מאוד קלות — דברים שילד בגן מכיר. לדוגמה: צבעים, חיות. תשובות של מילה אחת.`;
    if (m.age <= 8)  return `${m.name} (גיל ${m.age}): שאלות פשוטות ומהנות. תשובות קצרות.`;
    if (m.age <= 12) return `${m.name} (גיל ${m.age}): שאלות ברמת בית ספר יסודי.`;
    return             `${m.name} (גיל ${m.age}): שאלות מאתגרות עם פרטים ספציפיים מהטקסט.`;
  }).join("\n");
  const example = '{"members":[{"name":"שם","questions":[{"question":"...","emoji":"🦕","answers":["א","ב","ג","ד"],"correct_index":0,"explanation":"..."}]}]}';
  const prompt = "טקסט ויקיפדיה:\n" + wikiText + "\n\nמשתתפים:\n" + desc + "\n\nכללי גיל:\n" + rules + "\n\nחוקים: 1. שאלות בעברית רק מהטקסט — אל תמציא עובדות. 2. אל תחזור על אותה שאלה — פזר נושאים שונים מהטקסט. 3. לכל שאלה emoji. 4. וודא שה-correct_index נכון עובדתית. 5. אל תשאל על המשתתפים עצמם — רק על הנושא. 6. אם יש מספרים בטקסט — ציין במדויק. 7. נסח כל שאלה בעברית תקנית וברורה — שאלה אחת ברורה עם 4 תשובות מובחנות. 8. החזר JSON בלבד:\n" + example;
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error("שגיאת API: " + (data.error.message || JSON.stringify(data.error)));
  const raw = (data.content?.[0]?.text || "").trim();
  if (!raw) throw new Error("תשובה ריקה — בדוק ANTHROPIC_API_KEY ב-Vercel");
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("תגובת AI לא תקינה: " + raw.slice(0, 100));
  const text = jsonMatch[0];
  try { return JSON.parse(text); } catch {}
  try { return JSON.parse(text.replace(/,\s*([\]\}])/g, "$1")); } catch {}
  throw new Error("שגיאה בפענוח תשובת ה-AI — נסו שנית");
}

// ─── QUESTION VALIDATION ─────────────────────────────────────────────────────
async function validateQuestions(quizData, wikiText) {
  // pass שני — בדוק שכל שאלה מבוססת על הטקסט ושה-correct_index נכון
  const allQuestions = quizData.members.flatMap(m =>
    m.questions.map((q, qi) => ({ member: m.name, qi, question: q.question, answers: q.answers, correct_index: q.correct_index, correct_answer: q.answers[q.correct_index] }))
  );
  if (!allQuestions.length) return quizData;

  const list = allQuestions.map((q, i) => `${i+1}. שאלה: "${q.question}" | תשובה נכונה: "${q.correct_answer}"`).join("\n");
  const prompt = `טקסט מקור:\n${wikiText.slice(0, 1500)}\n\nרשימת שאלות ותשובות:\n${list}\n\nבדוק כל שאלה: האם התשובה הנכונה מופיעה או נובעת מהטקסט? החזר JSON בלבד, מערך של מספרי השאלות הבעייתיות (שאינן מבוססות על הטקסט): {"invalid":[1,3,5]} — אם הכל תקין: {"invalid":[]}`;

  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const raw = (data.content?.[0]?.text || "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return quizData;
    const result = JSON.parse(match[0]);
    const invalidSet = new Set((result.invalid || []).map(n => n - 1)); // 0-indexed
    if (!invalidSet.size) return quizData;

    // הסר שאלות בעייתיות
    let globalIdx = 0;
    const cleaned = {
      ...quizData,
      members: quizData.members.map(m => ({
        ...m,
        questions: m.questions.filter(() => !invalidSet.has(globalIdx++))
      }))
    };
    return cleaned;
  } catch {
    return quizData; // אם הvalidation נכשל — השתמש בשאלות המקוריות
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const PRAISE = ["וואו! 🎉","מדהים! ⭐","אלוף! 🏆","נכון! 💥","כל הכבוד! 🌟","מושלם! ✨","גאון! 🧠"];
const MISS   = ["כמעט! 💪","ניסיון טוב 😊","בפעם הבאה! 🎯","אל תוותר! 🔥"];
const rnd    = (a) => a[Math.floor(Math.random() * a.length)];

const TMAP   = { "דינוזאורים":"🦕","חלל":"🚀","אריות":"🦁","דולפינים":"🐬","מצרים":"🏛️","ים":"🌊","כדורגל":"⚽","מדע":"🔬","ציפורים":"🦅","הר":"🗻" };
const te     = (t) => { for (const [k,v] of Object.entries(TMAP)) if (t?.includes(k)) return v; return "🌟"; };
const fp = (members, scores) => {
  const valid = members.filter(m => scores[m.name]?.total > 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((s,m) => { const sc=scores[m.name]; return s + sc.correct/sc.total*100; }, 0) / valid.length);
};
// ציון גולמי: (% נכון × 100) + ממוצע שניות שנשארו
const calcRawScore = (members, scores) => {
  const valid = members.filter(m => scores[m.name]?.total > 0);
  if (!valid.length) return 0;
  const pct = valid.reduce((s,m) => { const sc=scores[m.name]; return s + sc.correct/sc.total*100; }, 0) / valid.length;
  const timerScores = valid.filter(m => scores[m.name].timerCount > 0);
  const avgSecs = timerScores.length
    ? timerScores.reduce((s,m) => s + scores[m.name].timerSum/scores[m.name].timerCount, 0) / timerScores.length
    : 0;
  return Math.round(pct * 100 + avgSecs);
};

const LOAD_MSGS = ["🔍 מחפש בויקיפדיה...","📖 קורא את המאמר...","🧠 יוצר שאלות...","✨ מותאם לכל גיל...","🎮 כמעט מוכן!"];
// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const C = {
  card: { background: "rgba(255,255,255,0.055)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 22, padding: "clamp(14px,2vw,28px)", marginBottom: 14 },
  lbl:  { color: "#64748b", fontFamily: "'Fredoka One',cursive", fontSize: 13, display: "block", marginBottom: 7 },
  inp:  { width: "100%", background: "rgba(255,255,255,0.07)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 16, fontFamily: "'Varela Round',sans-serif", outline: "none", transition: "border-color 0.2s", marginBottom: 4 },
  btnP: { width: "100%", padding: "15px", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", borderRadius: 18, color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 20, cursor: "pointer", boxShadow: "0 4px 24px #7c3aed55", transition: "all 0.2s", marginBottom: 8, display: "block" },
  btnS: { width: "100%", padding: "13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, color: "#94a3b8", fontFamily: "'Fredoka One',cursive", fontSize: 16, cursor: "pointer", transition: "all 0.2s", marginBottom: 8, display: "block" },
};

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  const cols = ["#fbbf24","#4ade80","#a78bfa","#60a5fa","#f87171","#34d399","#f472b6","#fb923c"];
  if (!active) return null;
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:9999, overflow:"hidden" }}>
      {Array.from({length:55}).map((_,i) => (
        <div key={i} style={{ position:"absolute", left:`${Math.random()*100}%`, top:"-20px", width:6+Math.random()*10, height:6+Math.random()*10, borderRadius:Math.random()>.5?"50%":"2px", background:cols[i%cols.length], animation:`fall ${1+Math.random()*1.5}s ease-in forwards`, animationDelay:`${Math.random()*.8}s` }} />
      ))}
    </div>
  );
}

function FloatEmoji({ emoji }) {
  if (!emoji) return null;
  return <div style={{ position:"fixed", top:"30%", left:"50%", fontSize:"clamp(80px, 36vw, 96px)", zIndex:9998, animation:"floatUp 1.2s ease forwards", pointerEvents:"none" }}>{emoji}</div>;
}

function Spotlight({ member, onDone }) {
  const g = ag(member.age);
  useEffect(() => { const t = setTimeout(onDone, 1400); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", animation:"fadeSpot 1.4s ease forwards" }}>
      <div style={{ textAlign:"center", animation:"popIn .4s ease" }}>
        <div style={{ width:90, height:90, borderRadius:"50%", background:`${g.color}22`, border:`3px solid ${g.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(44px, 23vw, 53px)", margin:"0 auto 12px", boxShadow:`0 0 40px ${g.color}88` }}>{g.emoji}</div>
        <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(32px, 19vw, 40px)" }}>תור של {member.name}!</div>
        <div style={{ color:g.color, fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(18px, 13vw, 25px)", marginTop:6 }}>{g.label}</div>
      </div>
    </div>
  );
}

function TimerBar({ seconds, color, onExpire, onTick }) {
  const [left, setLeft] = useState(seconds);
  const iv = useRef();
  useEffect(() => {
    if (!seconds) return;
    setLeft(seconds);
    iv.current = setInterval(() => setLeft(l => { if (l <= 1) { clearInterval(iv.current); onExpire(); return 0; } return l - 1; }), 1000);
    return () => clearInterval(iv.current);
  }, [seconds]);
  if (!seconds) return null;
  const pct = left / seconds;
  const col = pct < .3 ? "#f87171" : pct < .6 ? "#fbbf24" : color;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ flex:1, background:"rgba(255,255,255,0.1)", borderRadius:20, height:10, overflow:"hidden" }}>
        <div style={{ width:`${pct*100}%`, height:"100%", background:col, borderRadius:20, transition:"width 1s linear, background .3s" }} />
      </div>
      <div style={{ color:col, fontFamily:"'Fredoka One',cursive", fontSize:"clamp(20px, 14vw, 26px)", minWidth:32, textAlign:"center", animation:left<=5?"shake .3s ease infinite":"none" }}>{left}</div>
    </div>
  );
}

// ─── PWA INSTALL BANNER ───────────────────────────────────────────────────────
function InstallBanner({ onDismiss }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (LS.get("pwa_dismissed")) return;
    if (isIOS) { setShow(true); return; }
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; }
    dismiss();
  };
  const dismiss = () => { LS.set("pwa_dismissed", true); setShow(false); onDismiss?.(); };

  if (!show) return null;
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:500, padding:"12px 16px", background:"linear-gradient(135deg,#1e1b4b,#0f172a)", borderTop:"1px solid rgba(167,139,250,0.3)", animation:"slideUp .4s ease" }}>
      <div style={{ maxWidth:900, margin:"0 auto", display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ fontSize:"clamp(36px, 20vw, 45px)" }}>📲</div>
        <div style={{ flex:1 }}>
          <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)" }}>הוסיפו לדף הבית!</div>
          <div style={{ color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 22px)", marginTop:2 }}>
            {isIOS ? "לחצו על Share ← Add to Home Screen" : "גישה מהירה כמו אפליקציה"}
          </div>
        </div>
        {!isIOS && <button onClick={install} style={{ background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:12, color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 24px)", padding:"8px 16px", cursor:"pointer" }}>התקן</button>}
        <button onClick={dismiss} style={{ background:"none", border:"none", color:"#475569", fontSize:"clamp(22px, 15vw, 29px)", cursor:"pointer", padding:"4px" }}>×</button>
      </div>
    </div>
  );
}

// ─── SCREEN: WELCOME / LOGIN ──────────────────────────────────────────────────
function WelcomeScreen({ onDone }) {
  const [mode, setMode] = useState("new"); // new | returning
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [members, setMembers] = useState([{ name:"", age:"" }, { name:"", age:"" }]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (i,f,v) => setMembers(m => m.map((x,j) => j===i ? {...x,[f]:v} : x));

  const go = async () => {
    if (!name.trim()) return setErr("נא להכניס שם משפחה");
    if (pin.length !== 4) return setErr("PIN חייב להיות 4 ספרות");
    if (mode === "new") {
      const valid = members.filter(m => m.name.trim() && m.age);
      if (!valid.length) return setErr("נא להוסיף לפחות משתתף אחד");
      setLoading(true);
      const res = await registerFamily(name.trim(), pin);
      if (!res?.ok) { setLoading(false); return setErr(res?.error || "שגיאה"); }
      const family = { name: name.trim(), pin, members: valid.map(m => ({ name: m.name.trim(), age: parseInt(m.age) })) };
      saveFamily(family);
      setLoading(false);
      onDone(family);
    } else {
      setLoading(true);
      const res = await registerFamily(name.trim(), pin);
      if (!res?.ok) { setLoading(false); return setErr(res?.error || "שם משפחה או PIN שגוי"); }
      const family = { name: name.trim(), pin, members: [] };
      saveFamily(family);
      setLoading(false);
      onDone(family);
    }
  };

  return (
    <div style={{ animation:"slideIn .4s ease" }}>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:"clamp(64px, 30vw, 77px)", animation:"bounce 2s ease infinite" }}>🦊</div>
        <h1 style={{ fontFamily:"'Fredoka One',cursive", color:"#fff", fontSize:"clamp(32px, 19vw, 40px)", margin:"8px 0 4px" }}>חידון המשפחה</h1>
        <p style={{ color:"#475569", fontSize:"clamp(17px, 12vw, 24px)", fontFamily:"'Varela Round',sans-serif", margin:0 }}>מבוסס ויקיפדיה · חידון יומי · תחרות משפחות 🏆</p>
      </div>

      <div style={{ display:"flex", gap:0, marginBottom:16, background:"rgba(255,255,255,0.06)", borderRadius:14, padding:4 }}>
        {[{k:"new",l:"✨ משפחה חדשה"},{k:"returning",l:"👋 כבר רשומים"}].map(({k,l}) => (
          <button key={k} onClick={() => setMode(k)} style={{ flex:1, padding:"10px", border:"none", borderRadius:11, cursor:"pointer", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 24px)", background:mode===k?"rgba(124,58,237,0.4)":"transparent", color:mode===k?"#c4b5fd":"#475569", transition:"all .2s" }}>{l}</button>
        ))}
      </div>

      <div style={C.card}>
        <label style={C.lbl}>🏠 שם המשפחה</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="משפחת..."
          style={C.inp} onFocus={e=>e.target.style.borderColor="#fbbf24"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"} />

        <label style={{ ...C.lbl, marginTop:12 }}>🔐 PIN (4 ספרות)</label>
        <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="בחרו קוד סודי" type="password" inputMode="numeric" maxLength={4}
          style={{ ...C.inp, letterSpacing:8, fontSize:"clamp(22px, 15vw, 29px)", textAlign:"center" }}
          onFocus={e=>e.target.style.borderColor="#a78bfa"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"} />
        <p style={{ color:"#334155", fontSize:"clamp(15px, 11vw, 21px)", fontFamily:"'Varela Round',sans-serif", margin:"2px 0 0" }}>
          {mode==="new" ? "בחרו PIN שתזכרו — תצטרכו אותו בכניסות הבאות" : "הכניסו את ה-PIN שבחרתם בפעם הראשונה"}
        </p>

        {mode === "new" && (
          <>
            <label style={{ ...C.lbl, marginTop:16 }}>👨‍👩‍👧‍👦 מי משחק?</label>
            {members.map((m,i) => {
              const g = m.age ? ag(parseInt(m.age)) : null;
              return (
                <div key={i} style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:g?`${g.color}22`:"rgba(255,255,255,.08)", border:`2px solid ${g?g.color:"rgba(255,255,255,.15)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(18px, 13vw, 25px)", flexShrink:0, transition:"all .3s" }}>{g?g.emoji:"👤"}</div>
                  <input value={m.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="שם"
                    style={{ ...C.inp, flex:2, padding:"9px 12px", marginBottom:0 }}
                    onFocus={e=>e.target.style.borderColor="#4ade80"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"} />
                  <input value={m.age} onChange={e=>upd(i,"age",e.target.value)} placeholder="גיל" type="number" min="1" max="99"
                    style={{ ...C.inp, flex:1, padding:"9px 10px", marginBottom:0 }}
                    onFocus={e=>e.target.style.borderColor="#4ade80"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"} />
                  {members.length > 1 && <button onClick={() => setMembers(m=>m.filter((_,j)=>j!==i))} style={{ background:"rgba(239,68,68,.15)", border:"1px solid #ef444466", borderRadius:10, color:"#f87171", width:32, height:32, cursor:"pointer", fontSize:"clamp(19px, 14vw, 25px)", flexShrink:0 }}>×</button>}
                </div>
              );
            })}
            <button onClick={() => setMembers(m=>[...m,{name:"",age:""}])} style={{ background:"rgba(255,255,255,.04)", border:"1px dashed rgba(255,255,255,.15)", borderRadius:12, padding:"9px", color:"#475569", cursor:"pointer", width:"100%", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", marginTop:4 }}>+ הוסף משתתף</button>
          </>
        )}
      </div>

      {err && <div style={{ color:"#f87171", textAlign:"center", marginBottom:12, fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)" }}>⚠️ {err}</div>}
      <button onClick={go} disabled={loading} style={{ ...C.btnP, opacity:loading?0.7:1 }}>
        {loading ? "⏳ רגע..." : mode==="new" ? "🚀 בואו נשחק!" : "👋 כניסה"}
      </button>
    </div>
  );
}

// ─── SCREEN: HOME ─────────────────────────────────────────────────────────────
function HomeScreen({ family, onPlay, onJoin, onEditFamily, onLogout, onSetOnline }) {
  const [code, setCode] = useState("");
  const [tab, setTab] = useState("play");
  const [monthly, setMonthly] = useState({pts:[],avg:[]});

  useEffect(() => { getMonthlyBoard(onSetOnline).then(d => setMonthly(d || {pts:[],avg:[]})); }, []);

  // detect code from URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("code");
    if (c) { setCode(c); setTab("join"); }
  }, []);

  return (
    <div style={{ animation:"slideIn .4s ease" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, padding:"12px 16px", background:"rgba(255,255,255,0.05)", borderRadius:18, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:"clamp(32px, 19vw, 40px)" }}>🦊</div>
        <div style={{ flex:1 }}>
          <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)" }}>שלום משפחת {family.name}! 👋</div>
          <div style={{ color:"#334155", fontSize:"clamp(16px, 12vw, 22px)", fontFamily:"'Varela Round',sans-serif" }}>{family.members.length} משתתפים</div>
        </div>
        <button onClick={onEditFamily} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 22px)", padding:"6px 12px", cursor:"pointer" }}>✏️ עדכון</button>
        <button onClick={onLogout} style={{ background:"none", border:"none", color:"#334155", fontSize:"clamp(18px, 13vw, 25px)", cursor:"pointer", padding:"4px" }}>🔓</button>
      </div>

      <div style={{ display:"flex", gap:0, marginBottom:14, background:"rgba(255,255,255,0.06)", borderRadius:14, padding:4 }}>
        {[{k:"play",l:"🎮 שחק"},{k:"join",l:"⚔️ אתגר"},{k:"board",l:"🏆 לוח"}].map(({k,l}) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex:1, padding:"9px", border:"none", borderRadius:11, cursor:"pointer", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 24px)", background:tab===k?"rgba(124,58,237,0.4)":"transparent", color:tab===k?"#c4b5fd":"#475569", transition:"all .2s" }}>{l}</button>
        ))}
      </div>

      {tab === "play" && (
        <div style={C.card}>
          <TopicPicker onStart={(topic) => onPlay(topic)} />
        </div>
      )}

      {tab === "join" && (
        <div style={C.card}>
          <p style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", margin:"0 0 14px" }}>קיבלתם קוד מחברים? הכניסו אותו ותתחרו!</p>
          <label style={C.lbl}>🔑 קוד החידון</label>
          <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="1234" maxLength={4} type="text" inputMode="numeric"
            style={{ ...C.inp, fontSize:"clamp(32px, 19vw, 40px)", textAlign:"center", letterSpacing:10, fontFamily:"'Fredoka One',cursive" }}
            onFocus={e=>e.target.style.borderColor="#fbbf24"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"}
            onKeyDown={e=>e.key==="Enter"&&code.length===4&&onJoin(code)} />
          <button onClick={() => code.length===4&&onJoin(code)} disabled={code.length!==4}
            style={{ ...C.btnP, opacity:code.length===4?1:0.4, background:"linear-gradient(135deg,#d97706,#b45309)" }}>
            ⚔️ קבל את האתגר!
          </button>
        </div>
      )}

      {tab === "board" && (
        <div style={C.card}>
          <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 24px)", marginBottom:12 }}>🏆 לוח הגיבורים החודשי</div>
          {(monthly.pts||[]).length === 0 && <div style={{ color:"#334155", textAlign:"center", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", padding:"20px 0" }}>אין עדיין תוצאות — היו הראשונים! 🎉</div>}
          {(monthly.pts||[]).map((r,i) => {
            const isMe = r.family_name === family.name;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", marginBottom:6, background:isMe?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.03)", borderRadius:12, border:`1px solid ${isMe?"#a78bfa44":"transparent"}` }}>
                <span style={{ fontSize:"clamp(18px, 13vw, 25px)", minWidth:24 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`}</span>
                <span style={{ flex:1, color:isMe?"#c4b5fd":"#fff", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)" }}>{r.family_name}{isMe?" (אתם)":""}</span>
                <span style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)" }}>{r.monthly_points}נק'</span>
                {r.streak > 1 && <span style={{ fontSize:"clamp(15px, 11vw, 21px)" }}>🔥{r.streak}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopicPicker({ onStart }) {
  const [topic, setTopic] = useState("");
  const quick = [{e:"🦕",t:"דינוזאורים"},{e:"🚀",t:"חלל"},{e:"🦁",t:"אריות"},{e:"🐬",t:"דולפינים"},{e:"🏛️",t:"מצרים העתיקה"},{e:"🌋",t:"הרי געש"},{e:"🐳",t:"לוויתנים"},{e:"🧠",t:"מדע"},{e:"🌍",t:"מדינות העולם"}];
  return (
    <>
      <label style={C.lbl}>📚 נושא החידון</label>
      <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="לדוגמה: דינוזאורים, חלל..."
        style={C.inp} onFocus={e=>e.target.style.borderColor="#a78bfa"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"}
        onKeyDown={e=>e.key==="Enter"&&topic.trim()&&onStart(topic.trim())} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginTop:8, marginBottom:10 }}>
        {quick.map(({e,t}) => (
          <button key={t} onClick={() => setTopic(t)} style={{ background:topic===t?"rgba(167,139,250,.25)":"rgba(255,255,255,.05)", border:`1px solid ${topic===t?"#a78bfa":"rgba(255,255,255,.1)"}`, borderRadius:12, padding:"9px 4px", cursor:"pointer", color:"#fff", fontSize:"clamp(15px, 11vw, 21px)", fontFamily:"'Varela Round',sans-serif", textAlign:"center", transition:"all .2s" }}>
            <div style={{ fontSize:"clamp(20px, 14vw, 26px)", marginBottom:2 }}>{e}</div>{t}
          </button>
        ))}
      </div>
      <p style={{ color:"#334155", fontSize:"clamp(15px, 11vw, 21px)", fontFamily:"'Varela Round',sans-serif", margin:"0 0 12px" }}>💡 שאלות מבוססות ויקיפדיה בלבד — מידע מאומת</p>
      <button onClick={() => topic.trim() && onStart(topic.trim())} disabled={!topic.trim()}
        style={{ ...C.btnP, opacity:topic.trim()?1:0.4, marginBottom:0 }}>🚀 צור חידון!</button>
    </>
  );
}

// ─── SCREEN: EDIT FAMILY ──────────────────────────────────────────────────────
function EditFamilyScreen({ family, onSave, onBack, onDelete }) {
  const [members, setMembers] = useState(family.members.map(m => ({ ...m, age: String(m.age) })));
  const [familyName, setFamilyName] = useState(family.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const upd = (i,f,v) => setMembers(m => m.map((x,j) => j===i ? {...x,[f]:v} : x));

  const save = () => {
    const valid = members.filter(m => m.name.trim() && m.age);
    if (!valid.length || !familyName.trim()) return;
    onSave({ ...family, name: familyName.trim(), members: valid.map(m => ({ name:m.name.trim(), age:parseInt(m.age) })) });
  };

  return (
    <div style={{ animation:"slideIn .4s ease" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", marginBottom:12, padding:0 }}>← חזרה</button>
      <div style={C.card}>
        <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)", marginBottom:14 }}>✏️ עדכון הקבוצה</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(14px, 11vw, 18px)", marginBottom:6 }}>שם הקבוצה</div>
          <input value={familyName} onChange={e=>setFamilyName(e.target.value)} placeholder="שם הקבוצה"
            style={{ ...C.inp, marginBottom:0 }}
            onFocus={e=>e.target.style.borderColor="#fbbf24"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"} />
        </div>
        <p style={{ color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", margin:"0 0 14px" }}>ילד גדל? נולד תינוק? הצטרף סב/סבתא? עדכנו כאן.</p>
        {members.map((m,i) => {
          const g = m.age ? ag(parseInt(m.age)) : null;
          return (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:g?`${g.color}22`:"rgba(255,255,255,.08)", border:`2px solid ${g?g.color:"rgba(255,255,255,.15)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(18px, 13vw, 25px)", flexShrink:0 }}>{g?g.emoji:"👤"}</div>
              <input value={m.name} onChange={e=>upd(i,"name",e.target.value)} placeholder="שם"
                style={{ ...C.inp, flex:2, padding:"9px 12px", marginBottom:0 }}
                onFocus={e=>e.target.style.borderColor="#4ade80"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"} />
              <input value={m.age} onChange={e=>upd(i,"age",e.target.value)} placeholder="גיל" type="number"
                style={{ ...C.inp, flex:1, padding:"9px 10px", marginBottom:0 }}
                onFocus={e=>e.target.style.borderColor="#4ade80"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"} />
              {members.length > 1 && <button onClick={() => setMembers(m=>m.filter((_,j)=>j!==i))} style={{ background:"rgba(239,68,68,.15)", border:"1px solid #ef444466", borderRadius:10, color:"#f87171", width:32, height:32, cursor:"pointer", fontSize:"clamp(19px, 14vw, 25px)", flexShrink:0 }}>×</button>}
            </div>
          );
        })}
        <button onClick={() => setMembers(m=>[...m,{name:"",age:""}])} style={{ background:"rgba(255,255,255,.04)", border:"1px dashed rgba(255,255,255,.15)", borderRadius:12, padding:"9px", color:"#475569", cursor:"pointer", width:"100%", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", marginTop:4, marginBottom:14 }}>+ הוסף משתתף</button>
        <button onClick={save} style={C.btnP}>💾 שמור שינויים</button>
        {!confirmDelete ? (
          <button onClick={()=>setConfirmDelete(true)} style={{ ...C.btnS, color:"#f87171", marginTop:8 }}>🗑️ מחק קבוצה</button>
        ) : (
          <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid #ef444466", borderRadius:14, padding:"12px", marginTop:8, textAlign:"center" }}>
            <div style={{ color:"#f87171", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(15px, 11vw, 18px)", marginBottom:10 }}>בטוח? כל הנתונים יימחקו</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={onDelete} style={{ ...C.btnP, background:"linear-gradient(135deg,#dc2626,#b91c1c)", flex:1, marginBottom:0 }}>כן, מחק</button>
              <button onClick={()=>setConfirmDelete(false)} style={{ ...C.btnS, flex:1, marginBottom:0 }}>ביטול</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SCREEN: LOADING ─────────────────────────────────────────────────────────
function LoadingScreen({ msg, emoji }) {
  return (
    <div style={{ textAlign:"center", padding:"80px 20px", animation:"slideIn .4s ease" }}>
      <div style={{ fontSize:"clamp(72px, 33vw, 86px)", marginBottom:16, animation:"spin 2s linear infinite", display:"inline-block" }}>{emoji}</div>
      <h2 style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(26px, 16vw, 32px)", marginBottom:8 }}>{msg}</h2>
      <p style={{ color:"#475569", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)" }}>מכין חידון מותאם לכל אחד...</p>
      <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:24 }}>
        {[0,1,2,3].map(i => <div key={i} style={{ width:10, height:10, borderRadius:"50%", background:"#a78bfa", animation:`pulse 1.4s ease ${i*.3}s infinite` }} />)}
      </div>
    </div>
  );
}

// ─── SCREEN: QUIZ ─────────────────────────────────────────────────────────────
function QuizScreen({ quizData, members, onFinish }) {
  const turns = (() => {
    const qs = quizData.members.map((m,i) => ({ member:members[i]||members[0], questions:m.questions, idx:0 }));
    const t = []; let rem = true;
    while (rem) { rem = false; for (const q of qs) { if (q.idx < q.questions.length) { t.push({member:q.member,question:q.questions[q.idx]}); q.idx++; rem=true; } } }
    return t;
  })();

  const [ti, setTi] = useState(0);
  const [sel, setSel] = useState(null);
  const [done, setDone] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [floatE, setFloatE] = useState(null);
  const [msg, setMsg] = useState("");
  const [spot, setSpot] = useState(true);
  const [timerKey, setTimerKey] = useState(0);
  const [scores, setScores] = useState(() => Object.fromEntries(members.map(m => [m.name, {correct:0,total:0,points:0,timerSum:0,timerCount:0}])));
  const [timeLeft, setTimeLeft] = useState(0);

  const finished = ti >= turns.length;
  useEffect(() => {
    if (finished) onFinish(scores);
  }, [finished]);
  if (finished) return null;
  const { member, question } = turns[ti];
  const g = ag(member.age);
  const progress = Math.round(ti / turns.length * 100);
  const labels = ["א","ב","ג","ד"];

  const answer = (i) => {
    if (done) return;
    setSel(i); setDone(true);
    const ok = i === question.correct_index;
    if (ok) { setConfetti(true); setTimeout(()=>setConfetti(false),2200); setFloatE(question.emoji||"⭐"); setTimeout(()=>setFloatE(null),1300); setMsg(rnd(PRAISE)); }
    else setMsg(rnd(MISS));
    // Points: base 10 per correct answer. Bonus for speed (timer>0): +1 per second left
    const base = ok ? 10 : 0;
    const bonus = ok && g.timer > 0 ? timeLeft : 0;
    const pts = base + bonus;
    const timerAdd = g.timer > 0 ? { timerSum: (scores[member.name].timerSum||0)+timeLeft, timerCount: (scores[member.name].timerCount||0)+1 } : {};
    setScores(s => ({ ...s, [member.name]: { ...s[member.name], correct:s[member.name].correct+(ok?1:0), total:s[member.name].total+1, points:(s[member.name].points||0)+pts, ...timerAdd } }));
    // Auto-advance for young kids (no timer), or after delay for others
    if (!g.timer) { setTimeout(() => next(), ok ? 1500 : 2000); }
    else if (ok)  { setTimeout(() => next(), 1200); }
    // Wrong answer with timer: show explanation briefly then advance
    else          { setTimeout(() => next(), 2500); }
  };

  const next = () => { setTi(i=>i+1); setSel(null); setDone(false); setMsg(""); setSpot(true); setTimerKey(k=>k+1); };

  return (
    <div>
      <Confetti active={confetti} />
      <FloatEmoji emoji={floatE} />
      {spot && <Spotlight member={member} onDone={() => setSpot(false)} />}

      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", color:"#475569", fontSize:"clamp(16px, 12vw, 22px)", fontFamily:"'Varela Round',sans-serif", marginBottom:5 }}>
          <span>שאלה {ti+1} / {turns.length}</span><span>{progress}%</span>
        </div>
        <div style={{ background:"rgba(255,255,255,.08)", borderRadius:20, height:8, overflow:"hidden" }}>
          <div style={{ width:`${progress}%`, height:"100%", background:"linear-gradient(90deg,#a78bfa,#60a5fa)", borderRadius:20, transition:"width .5s ease" }} />
        </div>
        <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
          {members.map(m => { const mg=ag(m.age); const s=scores[m.name]; return (
            <div key={m.name} style={{ display:"flex", alignItems:"center", gap:4, opacity:m.name===member.name?1:.4, transition:"opacity .3s", background:m.name===member.name?`${mg.color}22`:"transparent", borderRadius:20, padding:"2px 8px 2px 4px", border:m.name===member.name?`1px solid ${mg.color}44`:"1px solid transparent" }}>
              <span style={{ fontSize:"clamp(17px, 12vw, 24px)" }}>{mg.emoji}</span>
              <span style={{ color:mg.color, fontFamily:"'Fredoka One',cursive", fontSize:"clamp(15px, 11vw, 21px)" }}>{s.points||0}נק'</span>
            </div>
          ); })}
        </div>
      </div>

      <div style={{ ...C.card, borderColor:`${g.color}44`, animation:"slideIn .3s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:42, height:42, borderRadius:"50%", background:`${g.color}22`, border:`2.5px solid ${g.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(20px, 14vw, 26px)", flexShrink:0, boxShadow:!done?`0 0 16px ${g.color}66`:"none", transition:"box-shadow .3s" }}>{g.emoji}</div>
          <div style={{ flex:1 }}>
            <div style={{ color:g.color, fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)" }}>תור של {member.name}</div>
            <div style={{ color:"#334155", fontSize:"clamp(15px, 11vw, 21px)", fontFamily:"'Varela Round',sans-serif" }}>{g.label}{g.bonus?" · ⚡ בונוס מהירות":""}</div>
          </div>
          <div style={{ fontSize:"clamp(28px, 17vw, 35px)" }}>{question.emoji||"❓"}</div>
        </div>

        {g.timer > 0 && !done && <TimerBar key={timerKey} seconds={g.timer} color={g.color} onExpire={() => answer(-1)} onTick={setTimeLeft} />}

        <p style={{ color:"#fff", fontFamily:"'Varela Round',sans-serif", fontSize:member.age<=5?20:17, lineHeight:1.6, margin:"0 0 14px" }}>{question.question}</p>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {question.answers.map((ans,i) => {
            let bg="rgba(255,255,255,.06)", brd="rgba(255,255,255,.12)";
            if (done) { if(i===question.correct_index){bg="#16a34a33";brd="#4ade80";}else if(i===sel){bg="#dc262633";brd="#f87171";} }
            return (
              <button key={i} onClick={() => answer(i)}
                style={{ background:bg, border:`2px solid ${brd}`, borderRadius:14, padding:member.age<=5?"16px 10px":"11px 12px", cursor:done?"default":"pointer", display:"flex", alignItems:"center", gap:8, transition:"all .2s", fontFamily:"'Varela Round',sans-serif", color:"#fff", fontSize:member.age<=5?16:14, textAlign:"right", animation:done&&i===question.correct_index?"correctPulse .5s ease":done&&i===sel&&i!==question.correct_index?"shake .3s ease":"" }}
                onMouseEnter={e=>{ if(!done){e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.background="rgba(255,255,255,.12)"}}}
                onMouseLeave={e=>{ if(!done){e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background=bg}}}>
                <span style={{ background:`${g.color}22`, color:g.color, borderRadius:"50%", width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(15px, 11vw, 21px)", fontWeight:"bold", flexShrink:0 }}>{labels[i]}</span>
                <span style={{ flex:1 }}>{ans}</span>
                {done&&i===question.correct_index&&<span>✅</span>}
                {done&&i===sel&&i!==question.correct_index&&<span>❌</span>}
              </button>
            );
          })}
        </div>

        {done && (
          <div style={{ marginTop:12, animation:"slideIn .3s ease" }}>
            <div style={{ textAlign:"center", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(22px, 15vw, 29px)", color:sel===question.correct_index?"#4ade80":"#f87171", marginBottom:8 }}>{msg}</div>
            {question.explanation && <div style={{ background:"rgba(255,255,255,.06)", borderRadius:12, padding:"10px 14px", color:"#94a3b8", fontSize:"clamp(17px, 12vw, 24px)", fontFamily:"'Varela Round',sans-serif", borderRight:`3px solid ${g.color}` }}>💡 {question.explanation}</div>}
          </div>
        )}
      </div>

      {done && ti+1>=turns.length && (
        <button onClick={next} style={{ ...C.btnP, background:`linear-gradient(135deg,${g.color},${g.color}99)`, color:"#000", animation:"slideIn .3s ease" }}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          🏆 לתוצאות!
        </button>
      )}
    </div>
  );
}

// ─── SCREEN: SHARE ────────────────────────────────────────────────────────────
function ShareScreen({ code, topic, familyName, pct, onContinue }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
  const waText = encodeURIComponent(`🎮 חידון המשפחה — ${topic}\nמשפחת ${familyName} השיגה ${pct}%!\n\nהאם תוכלו לנצח? 🏆\n\nקוד: *${code}*\n${url}`);

  const copy = () => { navigator.clipboard?.writeText(url).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  return (
    <div style={{ ...C.card, textAlign:"center", animation:"slideIn .4s ease" }}>
      <div style={{ fontSize:"clamp(52px, 26vw, 62px)", marginBottom:8 }}>🎉</div>
      <h2 style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(24px, 16vw, 31px)", margin:"0 0 6px" }}>שלחו את האתגר!</h2>
      <p style={{ color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", margin:"0 0 20px" }}>הזמינו משפחה אחרת לאותו חידון</p>

      <div style={{ background:"rgba(251,191,36,.1)", border:"1px solid rgba(251,191,36,.25)", borderRadius:16, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ color:"#64748b", fontSize:"clamp(16px, 12vw, 22px)", fontFamily:"'Varela Round',sans-serif", marginBottom:4 }}>קוד החידון</div>
        <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(56px, 28vw, 67px)", letterSpacing:10, lineHeight:1 }}>{code}</div>
      </div>

      <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer"
        style={{ display:"block", padding:"15px", background:"linear-gradient(135deg,#16a34a,#15803d)", borderRadius:18, color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(20px, 14vw, 26px)", textDecoration:"none", marginBottom:8, boxShadow:"0 4px 20px #16a34a55" }}>
        📱 שליחה בוואטסאפ
      </a>
      <button onClick={copy} style={{ ...C.btnS, color:copied?"#4ade80":"#94a3b8" }}>{copied?"✅ הועתק!":"🔗 העתק קישור"}</button>
      <button onClick={onContinue} style={C.btnP}>📊 לתוצאות</button>
    </div>
  );
}

// ─── SCREEN: RESULTS ─────────────────────────────────────────────────────────
function ConfettiOnce() {
  const [active, setActive] = useState(true);
  useEffect(() => { const t = setTimeout(() => setActive(false), 3000); return () => clearTimeout(t); }, []);
  return <Confetti active={active} />;
}

function ResultsScreen({ scores, members, familyName, topic, code, creatorPct, onHome, onSameTopic, onSetOnline, onShare, beatenBy, onRematch }) {
  const [board, setBoard] = useState([]);
  const [monthly, setMonthly] = useState({pts:[],avg:[]});
  const [tab, setTab] = useState("challenge");
  const pct = fp(members, scores);
  const beat = creatorPct !== null && pct > creatorPct;
  const msg = pct>=85?"🏆 משפחת אלופים!":pct>=65?"🌟 כל הכבוד!":"💪 ניסיון מצוין!";

  useEffect(() => {
    setBoard([]); setMonthly({pts:[],avg:[]});
    if (code) getChallenges(code, null).then(d => setBoard(d||[])).catch(()=>{});
    getMonthlyBoard(null).then(d => setMonthly(d||{pts:[],avg:[]})).catch(()=>{});
  }, [code]);

  const myRank = board.findIndex(r => r.family_name===familyName) + 1;

  return (
    <div style={{ animation:"slideIn .5s ease" }} key="results-screen">
      <ConfettiOnce />
      <div style={{ ...C.card, textAlign:"center", marginBottom:14 }}>
        <div style={{ fontSize:"clamp(56px, 28vw, 67px)", marginBottom:8, animation:"bounce 1s ease infinite" }}>{pct>=85?"🏆":pct>=65?"🌟":"💪"}</div>
        <h2 style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(26px, 16vw, 32px)", margin:"0 0 4px" }}>{msg}</h2>
        {beat && <div style={{ color:"#4ade80", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)", marginBottom:6 }}>🎯 ניצחתם! ({pct}% vs {creatorPct}%)</div>}
        <p style={{ color:"#475569", fontFamily:"'Varela Round',sans-serif", margin:"0 0 14px", fontSize:"clamp(17px, 12vw, 24px)" }}>משפחת {familyName} · {topic}</p>
        <div style={{ background:"rgba(255,255,255,.08)", borderRadius:16, padding:"14px 24px", display:"inline-block" }}>
          <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(52px, 26vw, 62px)", lineHeight:1 }}>{pct}%</div>
          {myRank>0&&<div style={{ color:"#a78bfa", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 22px)", marginTop:4 }}>מקום {myRank} מבין {board.length} משפחות</div>}
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(19px, 14vw, 25px)", marginBottom:10 }}>🎖️ גיבורי המשפחה</div>
        {[...members].sort((a,b) => {
          const pa = scores[a.name]; const pb = scores[b.name];
          const pctA = pa?.total ? pa.correct/pa.total : 0;
          const pctB = pb?.total ? pb.correct/pb.total : 0;
          return pctB - pctA;
        }).map((m,i) => {
          const g=ag(m.age); const s=scores[m.name]; const p=s.total?Math.round(s.correct/s.total*100):0;
          return (
            <div key={m.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, padding:"12px", background:"rgba(255,255,255,.04)", borderRadius:14, border:`1px solid ${g.color}33` }}>
              <span style={{ fontSize:"clamp(20px, 14vw, 26px)" }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":"🎖️"}</span>
              <div style={{ width:36, height:36, borderRadius:"50%", background:`${g.color}22`, border:`2px solid ${g.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(18px, 13vw, 25px)" }}>{g.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(16px, 12vw, 22px)" }}>{m.name}</div>
                <div style={{ color:"#64748b", fontSize:"clamp(13px, 10vw, 20px)", fontFamily:"'Varela Round',sans-serif" }}>{s.correct}/{s.total} נכון · {p}%{g.bonus?" · ⚡ בונוס זמן":""}</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ color:g.color, fontFamily:"'Fredoka One',cursive", fontSize:"clamp(26px, 16vw, 32px)" }}>{s.points||0}</div>
                <div style={{ color:"#475569", fontSize:"clamp(12px, 9vw, 18px)", fontFamily:"'Varela Round',sans-serif" }}>נקודות</div>
              </div>
            </div>
          );
        })}
      </div>

      {code && (
        <div style={C.card}>
          <div style={{ display:"flex", gap:0, marginBottom:10, background:"rgba(255,255,255,.06)", borderRadius:12, padding:3 }}>
            {[{k:"challenge",l:"⚔️ אתגר זה"},{k:"mpts",l:"🏆 חודשי"},{k:"mavg",l:"⭐ איכות"}].map(({k,l}) => (
              <button key={k} onClick={()=>setTab(k)} style={{ flex:1, padding:"7px", border:"none", borderRadius:10, cursor:"pointer", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(14px, 11vw, 21px)", background:tab===k?"rgba(124,58,237,.35)":"transparent", color:tab===k?"#c4b5fd":"#475569", transition:"all .2s" }}>{l}</button>
            ))}
          </div>
          {(() => {
            const rows = tab==="challenge" ? board : tab==="mpts" ? monthly.pts : monthly.avg;
            const getVal = (r) => tab==="challenge" ? r.family_pct+"%" : tab==="mpts" ? r.monthly_points+"נק'" : r.monthly_avg+"%";
            const getSub = (r) => tab==="mavg" ? `(${r.monthly_games||0} משחקים)` : "";
            return (rows||[]).slice(0,8).map((r,i) => {
              const isMe = r.family_name===familyName;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", marginBottom:5, background:isMe?"rgba(167,139,250,.15)":"rgba(255,255,255,.03)", borderRadius:12, border:`1px solid ${isMe?"#a78bfa44":"transparent"}` }}>
                  <span style={{ fontSize:"clamp(19px, 14vw, 25px)", minWidth:22 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ color:isMe?"#c4b5fd":"#fff", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 22px)" }}>{r.family_name}{isMe?" ← אתם":""}</div>
                    {getSub(r)&&<div style={{ color:"#475569", fontSize:"clamp(12px, 9vw, 18px)" }}>{getSub(r)}</div>}
                  </div>
                  <span style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 24px)" }}>{getVal(r)}</span>
                </div>
              );
            });
          })()}
          {(tab==="challenge"?board:tab==="mpts"?monthly.pts:monthly.avg).length===0&&<div style={{ color:"#334155", textAlign:"center", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", padding:"12px 0" }}>אתם הראשונים! 🎉</div>}
        </div>
      )}

      {beatenBy && onRematch && (
        <div style={{ ...C.card, background:"rgba(251,191,36,.08)", border:"1px solid rgba(251,191,36,.25)", textAlign:"center", marginBottom:14 }}>
          <div style={{ fontSize:"clamp(32px, 19vw, 40px)", marginBottom:6 }}>⚔️</div>
          <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(20px, 14vw, 26px)", marginBottom:4 }}>
            משפחת {beatenBy.name} עקפה אותכם!
          </div>
          <div style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(15px, 11vw, 21px)", marginBottom:12 }}>
            הם השיגו {beatenBy.score} נקודות. רוצים להחזיר?
          </div>
          <button onClick={onRematch} style={{ ...C.btnP, background:"linear-gradient(135deg,#f59e0b,#d97706)" }}>
            🔥 אתגר חוזר — שאלות חדשות!
          </button>
        </div>
      )}
      {code && onShare && (
        <button onClick={onShare} style={{ ...C.btnP, background:"linear-gradient(135deg,#16a34a,#15803d)", boxShadow:"0 4px 20px #16a34a55" }}>
          📱 שתף את האתגר
        </button>
      )}
      <button onClick={onSameTopic} style={C.btnP}>🔄 חידון נוסף על {topic}</button>
      <button onClick={onHome} style={C.btnS}>🏠 לדף הבית</button>
    </div>
  );
}

export default function App() {
  const [family, setFamily]       = useState(null);        // loaded from LS on boot
  const [screen, setScreen]       = useState("boot");      // boot|welcome|home|loading|editFamily|quiz|share|results
  const [topic, setTopic]         = useState("");
  const [quizData, setQuizData]   = useState(null);
  const [scores, setScores]       = useState({});
  const [code, setCode]           = useState("");
  const [creatorPct, setCreatorPct] = useState(null);
  const [isChallenger, setIsChallenger] = useState(false);
  const [loadMsg, setLoadMsg]     = useState(LOAD_MSGS[0]);
  const [error, setError]         = useState("");
  const [blockedTopic, setBlockedTopic] = useState("");
  const [sbOnline, setSbOnline]         = useState(true);
  const [beatenBy, setBeatenBy]   = useState(null); // {name, score} של מי שעקף

  // boot: check localStorage + URL code
  useEffect(() => {
    const saved = getFamily();
    const urlCode = new URLSearchParams(window.location.search).get("code");
    if (saved) {
      setFamily(saved);
      if (urlCode) {
        // יש קוד ב-URL — הצטרף אוטומטית
        setTimeout(() => handleJoinWithFamily(saved, urlCode), 100);
      } else {
        setScreen("home");
      }
    } else {
      if (urlCode) setCode(urlCode); // שמור קוד לאחרי הרשמה
      setScreen("welcome");
    }
  }, []);

  const handleJoinWithFamily = async (fam, c) => {
    const stop = startLoad();
    try {
      const room = await loadQuizByCode(c, setSbOnline);
      if (!room) { stop(); setError(`לא נמצא חידון עם קוד ${c}`); setScreen("home"); return; }
      const played = await hasPlayedQuiz(c, fam.name, setSbOnline);
      if (played) {
        stop(); setTopic(room.topic); setBlockedTopic(room.topic); setCode(c); setScreen("alreadyPlayed"); return;
      }
      // צור שאלות מותאמות לגילאי המשפחה המצטרפת
      const wiki = await fetchWiki(room.topic);
      const seed = Math.random().toString(36).slice(2,8);
      const data = await generateQuestions(wiki.text, wiki.lang, fam.members, seed);
      const validated = await validateQuestions(data, wiki.text);
      stop(); setTopic(room.topic); setCode(c); setCreatorPct(room.creator_pct);
      setQuizData(validated); setIsChallenger(true); setScreen("quiz");
      // נקה URL
      window.history.replaceState({}, "", window.location.pathname);
    } catch(e) { stop(); setError("שגיאה בטעינת החידון"); setScreen("home"); }
  };

  const startLoad = () => {
    setScreen("loading"); setError("");
    let mi = 0;
    const iv = setInterval(() => setLoadMsg(LOAD_MSGS[mi++ % LOAD_MSGS.length]), 2000);
    return () => clearInterval(iv);
  };

  const handlePlay = async (t) => {
    setTopic(t); setIsChallenger(false); setCreatorPct(null);
    const stop = startLoad();
    try {
      const wiki = await fetchWiki(t);
      const seed = Math.random().toString(36).slice(2,8);
      const data = await generateQuestions(wiki.text, wiki.lang, family.members, seed);
      const validated = await validateQuestions(data, wiki.text);
      stop(); setQuizData(validated); setScreen("quiz");
    } catch(e) { stop(); setError(e.message||"שגיאה"); setScreen("home"); }
  };

  const handleJoin = async (c) => {
    const stop = startLoad();
    try {
      const room = await loadQuizByCode(c, setSbOnline);
      if (!room) { stop(); setError(`לא נמצא חידון עם קוד ${c}`); setScreen("home"); return; }

      // check if already played this exact quiz
      const played = await hasPlayedQuiz(c, family.name, setSbOnline);
      if (played) {
        stop();
        setTopic(room.topic);
        setBlockedTopic(room.topic);
        setCode(c);
        setScreen("alreadyPlayed");
        return;
      }

      // צור שאלות מותאמות לגילאי המשפחה המצטרפת
      const wiki = await fetchWiki(room.topic);
      const seed = Math.random().toString(36).slice(2,8);
      const data = await generateQuestions(wiki.text, wiki.lang, family.members, seed);
      const validated = await validateQuestions(data, wiki.text);
      stop(); setTopic(room.topic); setCode(c); setCreatorPct(room.creator_pct);
      setQuizData(validated); setIsChallenger(true); setScreen("quiz");
      window.history.replaceState({}, "", window.location.pathname);
    } catch(e) { stop(); setError("שגיאה בטעינת החידון"); setScreen("home"); }
  };

  const handleFinish = async (s) => {
    setScores(s);
    const pct = fp(family.members, s);
    const rawScore = calcRawScore(family.members, s);
    if (isChallenger) {
      await saveChallenge(code, family.name, pct, null);
      await upsertScore(family.name, rawScore, pct, null);
      // בדוק אם עקפת את היוצר או מישהו אחר
      if (creatorPct !== null && rawScore > creatorPct) setBeatenBy(null);
      setScreen("results");
    } else {
      const newCode = makeCode();
      setCode(newCode);
      await saveQuizRoom(newCode, topic, family.name, pct, null);
      await saveChallenge(newCode, family.name, pct, null);
      await upsertScore(family.name, rawScore, pct, null);
      // בדוק אם יש מישהו עם ציון גבוה יותר באתגר
      const challenges = await getChallenges(code || "", null).catch(()=>[]);
      const beaten = (challenges||[]).find(r => r.family_name !== family.name && r.family_pct > pct);
      if (beaten) setBeatenBy({ name: beaten.family_name, score: beaten.family_pct });
      setScreen("share");
    }
  };

  const handleSameTopic = async () => {
    const stop = startLoad();
    try {
      const wiki = await fetchWiki(topic);
      const seed = Math.random().toString(36).slice(2,8);
      const data = await generateQuestions(wiki.text, wiki.lang, family.members, seed);
      const validated = await validateQuestions(data, wiki.text);
      stop(); setQuizData(validated); setIsChallenger(false); setCreatorPct(null); setScreen("quiz");
    } catch(e) { stop(); setError(e.message); setScreen("home"); }
  };

  const handleRematch = async () => {
    // אתגר חוזר — שאלות חדשות על אותו נושא, שומר קוד קיים
    const stop = startLoad();
    try {
      const wiki = await fetchWiki(topic);
      const seed = Math.random().toString(36).slice(2,8);
      const data = await generateQuestions(wiki.text, wiki.lang, family.members, seed);
      // שמור חידון חדש על אותו קוד
      const newCode = makeCode();
      setCode(newCode);
      stop(); setQuizData(data); setIsChallenger(false); setBeatenBy(null); setScreen("quiz");
    } catch(e) { stop(); setError(e.message); setScreen("home"); }
  };

  const handleWelcomeDone = (f) => {
    setFamily(f);
    if (code) { setTimeout(() => handleJoinWithFamily(f, code), 100); }
    else setScreen("home");
  };
  const handleEditSave = (f) => { saveFamily(f); setFamily(f); setScreen("home"); };
  const handleDeleteFamily = () => { clearFamily(); setFamily(null); setScreen("welcome"); };
  const handleLogout = () => { clearFamily(); setFamily(null); setScreen("welcome"); };

  if (screen === "boot") return <div style={{ minHeight:"100vh", background:"#05050f" }} />;

  const pct = fp(family?.members||[], scores);

  return (
    <>
      <style>{`
        @keyframes slideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fall{to{transform:translateY(105vh) rotate(720deg);opacity:0}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes floatUp{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}100%{opacity:0;transform:translateX(-50%) translateY(-110px) scale(1.6)}}
        @keyframes fadeSpot{0%,80%{opacity:1}100%{opacity:0;pointer-events:none}}
        @keyframes popIn{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
        @keyframes correctPulse{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
      `}</style>

      <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#05050f 0%,#0f172a 40%,#1a1540 70%,#0a0a18 100%)", padding:"clamp(16px, 3vw, 40px) clamp(16px, 4vw, 60px) 80px", display:"flex", flexDirection:"column", alignItems:"center" }}>
        {!sbOnline && (
          <div style={{ width:"100%", maxWidth:900, background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.2)", borderRadius:12, padding:"8px 14px", marginBottom:10, color:"#f87171", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 22px)", textAlign:"center" }}>
            ⚠️ מצב לא מקוון — לוח התוצאות לא זמין כרגע
          </div>
        )}
        {error && (
          <div style={{ width:"100%", maxWidth:900, background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.2)", borderRadius:12, padding:"10px 14px", marginBottom:12, color:"#f87171", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", textAlign:"center" }}>
            ⚠️ {error} <button onClick={()=>setError("")} style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", marginRight:8, fontSize:"clamp(19px, 14vw, 25px)" }}>×</button>
          </div>
        )}

        <div style={{ width:"100%", maxWidth:900 }}>
          {screen==="welcome"      && <WelcomeScreen onDone={handleWelcomeDone} />}
          {screen==="home"         && family && <HomeScreen family={family} onPlay={handlePlay} onJoin={handleJoin} onEditFamily={()=>setScreen("editFamily")} onLogout={handleLogout} onSetOnline={setSbOnline} />}
          {screen==="editFamily"   && family && <EditFamilyScreen family={family} onSave={handleEditSave} onBack={()=>setScreen("home")} onDelete={handleDeleteFamily} />}
          {screen==="loading"      && <LoadingScreen msg={loadMsg} emoji={te(topic)||"📖"} />}
          {screen==="alreadyPlayed"&& (
            <div style={{ ...C.card, textAlign:"center", animation:"slideIn .4s ease" }}>
              <div style={{ fontSize:"clamp(56px, 28vw, 67px)", marginBottom:12 }}>🔒</div>
              <h2 style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(24px, 16vw, 31px)", margin:"0 0 8px" }}>כבר שיחקתם!</h2>
              <p style={{ color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", margin:"0 0 6px" }}>
                משפחת {family?.name} כבר שיחקה את החידון הזה.
              </p>
              <p style={{ color:"#475569", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", margin:"0 0 20px" }}>
                כל קוד חידון ניתן לשחק פעם אחת בלבד — זה מה שהופך את התחרות להוגנת! 🏆
              </p>
              <button onClick={() => handlePlay(blockedTopic)} style={C.btnP}>🎲 חידון חדש על {blockedTopic}</button>
              <button onClick={() => setScreen("home")} style={C.btnS}>🏠 לדף הבית</button>
            </div>
          )}
          {screen==="quiz"         && quizData && family && <QuizScreen quizData={quizData} members={family.members} onFinish={handleFinish} />}
          {screen==="share"        && <ShareScreen code={code} topic={topic} familyName={family?.name} pct={pct} onContinue={()=>setScreen("results")} />}
          {screen==="results"      && <ResultsScreen scores={scores} members={family?.members||[]} familyName={family?.name} topic={topic} code={code} creatorPct={creatorPct} onHome={()=>setScreen("home")} onSameTopic={handleSameTopic} onSetOnline={setSbOnline} onShare={()=>setScreen("share")} beatenBy={beatenBy} onRematch={handleRematch} />}
        </div>
      </div>

      <InstallBanner />
    </>
  );
}
