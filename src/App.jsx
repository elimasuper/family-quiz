import { useState, useEffect, useRef, Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e.message || "שגיאה לא צפויה" }; }
  componentDidCatch(e, info) { console.error("App crash:", e, info); }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight:"100vh", background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", borderRadius:20, padding:24, textAlign:"center", maxWidth:340 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>😵</div>
          <div style={{ color:"#f87171", fontFamily:"Fredoka One,cursive", fontSize:22, marginBottom:8 }}>משהו השתבש</div>
          <div style={{ color:"#94a3b8", fontSize:14, marginBottom:20 }}>{this.state.error}</div>
          <button onClick={() => window.location.reload()} style={{ background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:12, color:"#fff", fontFamily:"Fredoka One,cursive", fontSize:18, padding:"10px 24px", cursor:"pointer" }}>
            🔄 טען מחדש
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://bqboyursgerrejqvmvhq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYm95dXJzZ2VycmVqcXZtdmhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTc0NDQsImV4cCI6MjA4ODYzMzQ0NH0.OPudQau6wVdUfKzLCMCxKG5F5VlYhCL_1Sfak0V1F8o";
const VAPID_PUBLIC_KEY = "BOMwhBgbC5dAsd7FufiTLQPceLVioktpoaDhS6yfL4OvmB4becP0PbVdhLDzDavbSPurpd50m6E83esINrG_T9E";

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────────────
async function registerPush(familyName) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    // אם המשתמש כבר דחה — לא נטריד שוב
    if (Notification.permission === "denied") return false;
    var reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    var existing = await reg.pushManager.getSubscription();
    if (existing) {
      savePushSubscription(familyName, existing);
      return true;
    }
    // רק אם כבר יש הרשאה או שעדיין לא נשאל
    if (Notification.permission === "granted" || Notification.permission === "default") {
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      savePushSubscription(familyName, sub);
      return true;
    }
    return false;
  } catch(e) {
    console.error("Push registration failed:", e);
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(base64);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function savePushSubscription(familyName, subscription) {
  var subJson = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
  return sbSafe(function() {
    return sbFetch("push_subscriptions", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ family_name: familyName, subscription: subJson }),
    });
  }, null, null);
}

async function notifyBeatenFamilies(code, beaterFamily, beaterPct, topic) {
  try {
    fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, beater_family: beaterFamily, beater_pct: beaterPct, topic: topic }),
    }).catch(function(){});
  } catch(e) {}
}

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const sbFetch = async (path, opts = {}) => {
  const res = await fetch((SUPABASE_URL + "/rest/v1/" + path), {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: ("Bearer " + SUPABASE_KEY),
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
const QHIST_KEY = "fq_qhist";
const getQHistory = (topic) => { const h = LS.get(QHIST_KEY) || {}; return h[topic] || []; };
const addQHistory = (topic, questions) => {
  const h = LS.get(QHIST_KEY) || {};
  const prev = h[topic] || [];
  const newQ = questions.map(q => q.question).filter(Boolean);
  h[topic] = [...new Set([...prev, ...newQ])].slice(-50); // שמור עד 50 שאלות אחרונות
  LS.set(QHIST_KEY, h);
};

// ─── SUPABASE OPS ─────────────────────────────────────────────────────────────
const makeCode = function() { return String(Math.floor(100000 + Math.random() * 900000)); };
const todayStr = () => new Date().toISOString().split("T")[0];

async function registerFamily(name, pin, members, setOnline) {
  return sbSafe(async () => {
    const ex = await sbFetch(("families?name=eq." + encodeURIComponent(name) + "&select=name,pin"));
    if (ex && ex.length > 0) {
      if (ex[0].pin !== pin) return { ok: false, error: "PIN שגוי" };
      // משפחה קיימת — טען members מה-DB
      const full = await sbFetch(("families?name=eq." + encodeURIComponent(name) + "&select=*"));
      const dbMembers = full?.[0]?.members || [];
      return { ok: true, members: dbMembers };
    }
    await sbFetch("families", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ name, pin, members: members||[], created_at: new Date().toISOString() }) });
    return { ok: true, members: members||[] };
  }, { ok: false, error: "שגיאת תקשורת" }, setOnline);
}

async function updateFamilyMembers(name, pin, members, setOnline) {
  return sbSafe(() => sbFetch(("families?name=eq." + encodeURIComponent(name)), {
    method: "PATCH", prefer: "return=minimal",
    body: JSON.stringify({ members }),
  }), null, setOnline);
}

async function saveQuizRoom(code, topic, familyName, familyPct, setOnline) {
  return sbSafe(function() {
    return sbFetch("quiz_rooms", {
      method: "POST", prefer: "return=representation",
      body: JSON.stringify({ code: code, topic: topic, creator_family: familyName, creator_pct: familyPct, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }),
    });
  }, null, setOnline);
}

async function loadQuizByCode(code, setOnline) {
  return sbSafe(async () => {
    const r = await sbFetch(("quiz_rooms?code=eq." + code + "&select=*"));
    return r && r.length > 0 ? r[0] : null;
  }, null, setOnline);
}

async function saveFamilyChallenge(code, familyName, setOnline) {
  return sbSafe(() => sbFetch("family_challenges", {
    method: "POST", prefer: "return=minimal",
    body: JSON.stringify({ family_name: familyName, challenge_code: code }),
  }), null, setOnline);
}

async function getMyActiveChallenges(familyName, setOnline) {
  return sbSafe(async () => {
    const now = new Date().toISOString();
    // קבל את כל קודי האתגרים של המשפחה
    const fc = await sbFetch(("family_challenges?family_name=eq." + encodeURIComponent(familyName) + "&select=challenge_code"));
    if (!fc || !fc.length) return [];
    const codes = fc.map(r => r.challenge_code);
    // קבל את פרטי החדרים הפעילים
    const rooms = await Promise.all(codes.map(c =>
      sbFetch(("quiz_rooms?code=eq." + c + "&expires_at=gte." + now + "&select=code,topic,creator_family,creator_pct"))
        .then(r => r && r.length ? r[0] : null).catch(() => null)
    ));
    const active = rooms.filter(Boolean);
    // קבל ציונים לכל אתגר
    const withScores = await Promise.all(active.map(async room => {
      const challenges = await sbFetch(("quiz_challenges?code=eq." + room.code + "&select=family_name,family_pct&order=family_pct.desc")).catch(() => []);
      const myScore = (challenges||[]).find(r => r.family_name === familyName);
      const myRank = myScore ? (challenges||[]).findIndex(r => r.family_name === familyName) + 1 : null;
      return { ...room, challenges: challenges||[], myScore: myScore?.family_pct || null, myRank, total: (challenges||[]).length };
    }));
    return withScores;
  }, [], setOnline);
}

async function saveChallenge(code, familyName, familyPct, setOnline) {
  return sbSafe(() => sbFetch("quiz_challenges", {
    method: "POST", prefer: "return=minimal",
    body: JSON.stringify({ code, family_name: familyName, family_pct: familyPct, played_at: new Date().toISOString() }),
  }), null, setOnline);
}

async function updateChallenge(code, familyName, familyPct, setOnline) {
  return sbSafe(async function() {
    var r = await sbFetch(("quiz_challenges?code=eq." + code + "&family_name=eq." + encodeURIComponent(familyName)), {
      method: "PATCH", prefer: "return=representation",
      body: JSON.stringify({ family_pct: familyPct, played_at: new Date().toISOString() }),
    });
    return r && r.length > 0 ? r[0] : null;
  }, null, setOnline);
}

async function getChallenges(code, setOnline) {
  return sbSafe(async () => {
    const r = await sbFetch(("quiz_challenges?code=eq." + code + "&select=family_name,family_pct&order=family_pct.desc&limit=20"));
    return r || [];
  }, [], setOnline);
}

async function hasPlayedQuiz(code, familyName, setOnline) {
  return sbSafe(async () => {
    const r = await sbFetch(("quiz_challenges?code=eq." + code + "&family_name=eq." + encodeURIComponent(familyName) + "&select=id&limit=1"));
    return r && r.length > 0;
  }, false, setOnline);
}

function calcBadges(scores, members, isChampion=false, streak=0) {
  const badges = [];
  const validMembers = (members||[]).filter(m => m && m.name && m.age != null);
  if (!validMembers.length) return badges;
  const pct = Math.round(validMembers.reduce((s,m) => {
    const sc = scores[m.name]; return s + (sc?.total ? sc.correct/sc.total*100 : 0);
  }, 0) / validMembers.length);
  if (pct === 100) badges.push({ emoji:"🎯", label:"מושלם!" });
  if (pct >= 90)  badges.push({ emoji:"⭐", label:"מצוין" });
  if (isChampion) badges.push({ emoji:"👑", label:"אלוף" });
  if (streak >= 7) badges.push({ emoji:"🔥", label:"רצף " + streak + " ימים" });
  else if (streak >= 3) badges.push({ emoji:"🔥", label:"רצף " + streak });
  const timerMembers = validMembers.filter(m => ag(m.age).timer > 0);
  if (timerMembers.length) {
    const avgSecs = timerMembers.reduce((s,m) => s + (scores[m.name]?.timerSum||0) / Math.max(scores[m.name]?.timerCount||1,1), 0) / timerMembers.length;
    const maxTimer = Math.max.apply(null, timerMembers.map(function(m) { return ag(m.age).timer; }));
    if (avgSecs >= maxTimer * 0.7) badges.push({ emoji:"⚡", label:"שיא מהירות!" });
    else if (avgSecs >= maxTimer * 0.4) badges.push({ emoji:"⚡", label:"מהיר כברק!" });
  }
  return badges;
}

async function getMonthlyBoard(setOnline) {
  return sbSafe(async () => {
    const [pts, avg] = await Promise.all([
      sbFetch("family_scores?select=family_name,monthly_points&order=monthly_points.desc&limit=10"),
      sbFetch("family_scores?select=family_name,monthly_avg,monthly_games&order=monthly_avg.desc&limit=10"),
    ]);
    return { pts: pts||[], avg: avg||[] };
  }, { pts:[], avg:[] }, setOnline);
}

async function upsertScore(familyName, rawScore, pct, setOnline) {
  return sbSafe(async () => {
    const ex = await sbFetch(("family_scores?family_name=eq." + encodeURIComponent(familyName) + "&select=*"));
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
      await sbFetch(("family_scores?family_name=eq." + encodeURIComponent(familyName)), {
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
  const a = parseInt(age) || 99;
  if (a <= 5)  return { label: "גן",     color: "#f472b6", emoji: "🌸", qCount: 3,  timer: 0,  bonus: false };
  if (a <= 9)  return { label: "צעיר",   color: "#34d399", emoji: "🌱", qCount: 5,  timer: 0,  bonus: false };
  if (a <= 12) return { label: "בינוני", color: "#60a5fa", emoji: "⚡", qCount: 6,  timer: 20, bonus: true  };
  return              { label: "מתקדם",  color: "#a78bfa", emoji: "🔥", qCount: 6,  timer: 15, bonus: true  };
};

async function searchWikiResults(query) {
  const sr = await fetch(("https://he.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(query) + "&srlimit=6&format=json&origin=*"));
  const hits = ((await sr.json())?.query?.search) || [];
  return hits.map(h => ({ title: h.title, snippet: h.snippet.replace(/<[^>]+>/g, '').slice(0, 80) }));
}

async function fetchWiki(topic) {
  var get = async function(title) {
    var r = await fetch(("https://he.wikipedia.org/w/api.php?action=query&titles=" + encodeURIComponent(title) + "&prop=extracts&explaintext=true&exsectionformat=plain&format=json&origin=*&redirects=1"));
    var d = await r.json();
    var p = Object.values(d.query.pages)[0];
    if (p.extract && p.extract.length >= 300) {
      return { text: p.extract, lang: "he", title: p.title };
    }
    return null;
  };

  // שלוף מאמר "ראו גם" — מאמרים קשורים מויקיפדיה
  var getSeeAlso = async function(title) {
    try {
      var r = await fetch(("https://he.wikipedia.org/w/api.php?action=parse&page=" + encodeURIComponent(title) + "&prop=sections&format=json&origin=*"));
      var d = await r.json();
      var sections = (d.parse && d.parse.sections) || [];
      var seeAlsoIdx = null;
      for (var i = 0; i < sections.length; i++) {
        var name = sections[i].line || "";
        if (name === "ראו גם" || name === "קישורים פנימיים" || name === "נושאים קשורים") {
          seeAlsoIdx = sections[i].index;
          break;
        }
      }
      if (!seeAlsoIdx) return [];
      // שלוף את הסקשיין
      var r2 = await fetch(("https://he.wikipedia.org/w/api.php?action=parse&page=" + encodeURIComponent(title) + "&prop=links&section=" + seeAlsoIdx + "&format=json&origin=*"));
      var d2 = await r2.json();
      var links = (d2.parse && d2.parse.links) || [];
      // סנן רק קישורים למאמרים (ns=0)
      return links.filter(function(l) { return l.ns === 0 && l.exists !== undefined; }).map(function(l) { return l["*"]; }).slice(0, 4);
    } catch(e) { return []; }
  };

  var direct = await get(topic);
  if (!direct) {
    var sr = await fetch(("https://he.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(topic) + "&srlimit=3&format=json&origin=*"));
    var hits = ((await sr.json())?.query?.search) || [];
    for (var h of hits) { var r = await get(h.title); if (r) { direct = r; break; } }
  }
  if (!direct) throw new Error("לא נמצא מאמר בויקיפדיה על \"" + topic + "\". נסו נושא אחר.");

  // אם המאמר קצר — העשר עם מאמרי "ראו גם"
  var MIN_RICH = 4000;
  if (direct.text.length < MIN_RICH) {
    var related = await getSeeAlso(direct.title);
    for (var i = 0; i < related.length && direct.text.length < MIN_RICH; i++) {
      var extra = await get(related[i]);
      if (extra) {
        direct.text = direct.text + "\n\n--- " + extra.title + " ---\n" + extra.text.slice(0, 2000);
      }
    }
  }

  direct.shortArticle = direct.text.length < 2500;
  return direct;
}

// ─── AI ───────────────────────────────────────────────────────────────────────
async function callHaiku(prompt, maxRetries) {
  var retries = maxRetries || 2;
  var lastError = null;
  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
      });
      var data = await res.json();
      if (data.error) {
        var errMsg = data.error.message || JSON.stringify(data.error);
        // rate limit or server error — retry
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          lastError = new Error("שגיאת API: " + errMsg);
          await new Promise(function(r) { setTimeout(r, 1000 * (attempt + 1)); });
          continue;
        }
        throw new Error("שגיאת API: " + errMsg);
      }
      var raw = (data.content && data.content[0] && data.content[0].text || "").trim();
      if (!raw) throw new Error("תשובה ריקה — בדוק ANTHROPIC_API_KEY ב-Vercel");
      var jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("תגובת AI לא תקינה: " + raw.slice(0, 150));
      var text = jsonMatch[0];
      var tryParse = function(t) {
        try { return JSON.parse(t); } catch(e1) {}
        try { return JSON.parse(t.replace(/,\s*([\]\}])/g, "$1")); } catch(e2) {}
        try {
          var fixed = t.replace(/:[ ]*"((?:[^"\\]|\\.)*)"/g, function(match, val) {
            var cleaned = val.replace(/(?<!\\)"/g, "'");
            return ': "' + cleaned + '"';
          });
          return JSON.parse(fixed);
        } catch(e3) {}
        return null;
      };
      var autoFix = function(t) {
        var fixed = t;
        var opens = (fixed.match(/\[/g)||[]).length - (fixed.match(/\]/g)||[]).length;
        var openc = (fixed.match(/\{/g)||[]).length - (fixed.match(/\}/g)||[]).length;
        for (var i=0; i<opens; i++) fixed += "]";
        for (var i=0; i<openc; i++) fixed += "}";
        return tryParse(fixed);
      };
      var parsed = tryParse(text) || autoFix(text);
      if (!parsed) throw new Error("JSON: " + text.slice(-150));
      return parsed;
    } catch(e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise(function(r) { setTimeout(r, 1000 * (attempt + 1)); });
        continue;
      }
    }
  }
  throw lastError || new Error("שגיאה לא צפויה");
}

// ─── AGE RULES ───────────────────────────────────────────────────────────────
function getAgeRule(age) {
  var a = parseInt(age) || 99;
  if (a <= 5)  return "שאלות לגיל גן (2-5). חובה: שאלות פשוטות בלבד על דברים שילד קטן יכול להבין — חיות, צבעים, גדול/קטן, כן/לא. אסור בהחלט: מספרים, תאריכים, שנים, שמות מדעיים, מושגים מופשטים. תשובות של מילה אחת בלבד.";
  if (a <= 9)  return "שאלות לגיל 6-9. שאלות פשוטות וברורות. אפשר שמות ומקומות בסיסיים. אסור: תאריכים מדויקים, מספרים גדולים, מושגים מדעיים מורכבים. תשובות של 1-2 מילים.";
  if (a <= 12) return "שאלות לגיל 10-12. שאלות ברמת בית ספר יסודי. אפשר תאריכים ומספרים פשוטים. תשובות של 1-3 מילים.";
  return "שאלות למבוגרים. שאלות מאתגרות עם פרטים ספציפיים — שנים, מספרים, שמות, קשרים סיבתיים. תשובות של 1-4 מילים.";
}

// ─── BATCH QUESTION GENERATION ───────────────────────────────────────────────
async function generateQuestionsForGroup(wikiText, groupMembers, totalQuestions, usedQuestions, batchNum) {
  var ageRule = getAgeRule(groupMembers[0].age);
  var seed = Math.random().toString(36).slice(2, 8);
   var usedBlock = "";
  var batchBlock = "";
  if ((batchNum || 1) > 1) {
    batchBlock = "\n12. זו קריאה מספר " + batchNum + " עבור אותה קבוצת גיל. חובה לייצר שאלות שונות בבירור מהקריאות האחרות — נושאים אחרים, עובדות אחרות, זווית אחרת.";
  }
  if (usedQuestions && usedQuestions.length) {
    var forbidden = [];
    usedQuestions.forEach(function(q) {
      if (Math.random() < 0.7) forbidden.push(q);
    });
    if (forbidden.length) {
      usedBlock = "\n\nשאלות שכבר נשאלו (העדף שאלות חדשות, מותר לחזור על 1-2 לחיזוק):\n" + forbidden.slice(-15).map(function(q,i) { return (i+1) + ". " + q; }).join("\n");
    }
  }
  var example = '{"questions":[{"question":"...","emoji":"🦕","answers":["נכונה","סבירה","סבירה","מצחיקה"],"correct_index":0}]}';
  var prompt = "טקסט:\n" + wikiText + usedBlock
    + "\n\nרמה: " + ageRule
    + "\nכמות שאלות: " + totalQuestions
    + "\n\nחוקים:"
    + "\n1. שאלות מהטקסט בלבד — אסור להמציא עובדות."
      + "\n2. קריטי: כל " + totalQuestions + " השאלות חייבות להיות על נושאים שונים. לפני שאתה כותב שאלה, ודא שלא דומה לאף שאלה קודמת — לא אותו נושא, עובדה או מושג."
    + "\n2b. אם כבר נוצרו שאלות בקריאות אחרות לאותה קבוצת גיל, חובה להתרחק מהן: לא אותו פרט, לא אותו מושג, לא אותה עובדה בניסוח אחר."
    + "\n3. חשוב מאוד: פזר שאלות על כל חלקי הטקסט! שאלה 1 מההתחלה, שאלה 2 מהאמצע, שאלה 3 מהסוף, וכן הלאה. אסור שרוב השאלות יהיו מאותו קטע."
    + "\n4. אסור שהתשובה הנכונה תופיע בגוף השאלה."
    + "\n5. עברית תקנית וברורה. כללים חשובים: המשפט חייב להיות תקין דקדוקית — נושא, נשוא ומשלים בסדר הגיוני. אסור משפטים מקוטעים או מבולבלים. השתמש במונחים שמופיעים בטקסט עצמו. דוגמה נכונה: 'כמה נקודות מקבלים על קליעה מעבר לקו?' דוגמה שגויה: 'כמה טיפים מקבל מי שקולע מרחוק?'"
    + "\n6. 4 תשובות לכל שאלה, כך: תשובה נכונה אחת, 2 מסיחים סבירים שנשמעים אפשריים אבל שגויים, ומסיח אחד הומוריסטי/אבסורדי שברור שהוא לא נכון אבל מצחיק (למשל: אם השאלה על דינוזאורים, מסיח כמו 'פיצה')."
    + "\n7. אסור שהמסיחים יהיו דומים זה לזה — כל תשובה חייבת להיות שונה בבירור."
    + "\n8. emoji אחד כללי ורלוונטי לנושא השאלה, אבל לא כזה שחושף או מרמז על התשובה הנכונה."
    + "\n9. אל תוסיף שדה explanation."
    + "\n10. seed: " + seed
    + batchBlock
    + "\n11. JSON בלבד:\n" + example;

  var parsed = await callHaiku(prompt);
  var questions = (parsed.questions || []).map(function(q) {
    var correct = q.answers[q.correct_index];
    var shuffled = [].concat(q.answers).sort(function() { return Math.random() - 0.5; });
    return { question: q.question, emoji: q.emoji, answers: shuffled, correct_index: shuffled.indexOf(correct) };
  });
  return questions;
}

async function generateQuestions(wikiText, wikiLang, members, seed, topic) {
  // בחר קטעים רנדומליים מהטקסט המלא — שונים בכל חידון
  var len = wikiText.length;
  var chunkSize = 900;
  var positions = [];
  // יותר chunks = כיסוי רחב יותר של המאמר
  var numChunksNeeded = Math.min(8, Math.max(4, members.length * 2));
  if (len <= chunkSize * 2) {
    positions = [0];
  } else {
    var maxAttempts = 100;
    var attempts = 0;
    while (positions.length < numChunksNeeded && attempts < maxAttempts) {
      attempts++;
      var pos = Math.floor(Math.random() * Math.max(1, len - chunkSize));
      if (positions.every(function(p) { return Math.abs(p - pos) > chunkSize; })) positions.push(pos);
    }
  }
  positions.sort(function(a, b) { return a - b; });
  var chunks = positions.map(function(p) { return wikiText.slice(p, p + chunkSize); });
  var introStart = Math.floor(Math.random() * Math.min(500, Math.floor(len * 0.1)));
  var wikiSlice = wikiText.slice(introStart, introStart + 800) + "\n\n..." + chunks.join("\n\n...");

  // הגבל מספר שאלות לפי אורך הטקסט
  var maxQuestionsFromText = Math.max(4, Math.floor(wikiSlice.length / 150));

  var usedQ = topic ? getQHistory(topic) : [];

  // ─── קיבוץ לפי רמת גיל ───
  // כל אנשי אותה רמה מקבלים שאלות מקריאה אחת — חוסך קריאות API
  var levelKey = function(m) {
    var a = parseInt(m.age) || 99;
    if (a <= 5) return "gan";
    if (a <= 9) return "young";
    if (a <= 12) return "mid";
    return "adv";
  };
  var groups = {};
  var memberOrder = [];
  members.forEach(function(m) {
    var k = levelKey(m);
    if (!groups[k]) groups[k] = [];
    groups[k].push(m);
    memberOrder.push({ name: m.name, level: k });
  });

  // שלח קריאות לכל קבוצת גיל — מקסימום 8 שאלות לקריאה
  var MAX_Q_PER_CALL = 10;
  var groupResults = {};
  var allPromises = [];

  Object.keys(groups).forEach(function(k) {
    var groupMembers = groups[k];
    var g = ag(groupMembers[0].age);
    var needed = groupMembers.length * g.qCount;
    // בקש פי 2 שאלות כ-buffer — הסינון מוחק חלק
    var totalQ = Math.ceil(needed * 2) + Math.min(4, groupMembers.length);
    var minQ = groupMembers.length * 3;
    totalQ = Math.max(minQ, Math.min(totalQ, maxQuestionsFromText));
    groupResults[k] = [];

    // חלק לקריאות של עד MAX_Q_PER_CALL
    var remaining = totalQ;
    while (remaining > 0) {
      var batchSize = Math.min(remaining, MAX_Q_PER_CALL);
      remaining -= batchSize;
      var p = generateQuestionsForGroup(wikiSlice, groupMembers, batchSize, usedQ, (groupResults[k].length / MAX_Q_PER_CALL) + 1).then(function(kk) {
        return function(questions) { groupResults[kk] = groupResults[kk].concat(questions); };
      }(k));
      allPromises.push(p);
    }
  });
  await Promise.all(allPromises);

  // סנן כפילויות בתוך כל group בנפרד
  var topicWords = (topic || "").replace(/[?.!,،؟]/g, "").split(/\s+/).filter(function(w) { return w.length > 1; });
  Object.keys(groupResults).forEach(function(k) {
    var qs = groupResults[k];
    var keep = [];
    qs.forEach(function(q) {
      var dominated = false;
      var qText = q.question + " " + q.answers[q.correct_index];
      var qWords = qText.replace(/[?.!,،؟]/g, "").split(/\s+/).filter(function(w) { return w.length > 2 && topicWords.indexOf(w) === -1; });
      for (var j = 0; j < keep.length; j++) {
        var kText = keep[j].question + " " + keep[j].answers[keep[j].correct_index];
        var kWords = kText.replace(/[?.!,،؟]/g, "").split(/\s+/).filter(function(w) { return w.length > 2 && topicWords.indexOf(w) === -1; });
        // תשובה זהה = כפילות
        if (q.answers[q.correct_index] === keep[j].answers[keep[j].correct_index]) { dominated = true; break; }
        // 60%+ overlap מילים = כפילות
        var shared = 0;
        qWords.forEach(function(w) { if (kWords.indexOf(w) !== -1) shared++; });
        if (qWords.length > 0 && shared / qWords.length >= 0.6) { dominated = true; break; }
      }
      if (!dominated) keep.push(q);
    });
    groupResults[k] = keep;
  });

  // חלק round-robin — כל משתתף מקבל שאלה בתור
  var memberQueues = members.map(function(m) { return { name: m.name, level: levelKey(m), questions: [], needed: ag(m.age).qCount }; });
  var groupPools = {};
  Object.keys(groupResults).forEach(function(k) { groupPools[k] = [].concat(groupResults[k]); });

  var changed = true;
  while (changed) {
    changed = false;
    memberQueues.forEach(function(mq) {
      if (mq.questions.length < mq.needed && groupPools[mq.level] && groupPools[mq.level].length > 0) {
        mq.questions.push(groupPools[mq.level].shift());
        changed = true;
      }
    });
  }

  // אם מישהו חסר — קריאה נוספת להשלמה
  var shortMembers = memberQueues.filter(function(mq) { return mq.questions.length < mq.needed; });
  if (shortMembers.length > 0) {
    var fillPromises = [];
    var fillGroups = {};
    shortMembers.forEach(function(mq) {
      if (!fillGroups[mq.level]) fillGroups[mq.level] = 0;
      fillGroups[mq.level] += (mq.needed - mq.questions.length) + 2;
    });
    Object.keys(fillGroups).forEach(function(k) {
      fillPromises.push(
        generateQuestionsForGroup(wikiSlice, groups[k], Math.min(fillGroups[k], MAX_Q_PER_CALL), usedQ, 99).then(function(questions) {
          questions.forEach(function(q) { groupPools[k] = (groupPools[k] || []).concat([q]); });
        })
      );
    });
    await Promise.all(fillPromises);
    memberQueues.forEach(function(mq) {
      while (mq.questions.length < mq.needed && groupPools[mq.level] && groupPools[mq.level].length > 0) {
        mq.questions.push(groupPools[mq.level].shift());
      }
    });
  }

  // חתוך למספר קבוע — בדיוק qCount לכל משתתף
  var results = memberQueues.map(function(mq) {
    return { name: mq.name, questions: mq.questions.slice(0, mq.needed) };
  });

  // שמור שאלות ב-history למניעת חזרות
  if (topic) {
    var allQ = results.flatMap(function(r) { return (r && r.questions) ? r.questions : []; });
    addQHistory(topic, allQ);
  }
  return { members: results };
}

// ─── QUESTION VALIDATION ─────────────────────────────────────────────────────
async function validateQuestions(quizData, wikiText, topicTitle) {
  var allQuestions = quizData.members.flatMap(function(m) {
    return m.questions.map(function(q, qi) {
      return { member: m.name, qi: qi, question: q.question, answers: q.answers, correct_index: q.correct_index, correct_answer: q.answers[q.correct_index] };
    });
  });
  if (!allQuestions.length) return quizData;

  // מילות עצירה + מילות הנושא (כדי שלא כל שאלה תיחשב כפילות בגלל "כדורסל")
  var stopWords = ["מה","מי","איזה","איזו","כמה","מתי","איפה","האם","של","את","על","הוא","היא","זה","זו","הם","הן","או","עם","לא","כן","גם","רק","אם","אבל","כי","כל","היה","היו","היתה","שהוא","שהיא","שהם","אחד","אחת","יותר","הכי","לפי","בין","תוך","עד","נקרא","נקראת","נחשב","באיזה","באיזו","למה","מדוע","כיצד"];
  // הוסף את מילות הנושא לרשימת העצירה
  var topicWords = (topicTitle || "").replace(/[?.!,،؟]/g, "").split(/\s+/).filter(function(w) { return w.length > 1; });
  var allStops = stopWords.concat(topicWords);

  var getWords = function(text) {
    return text.replace(/[?.!,،؟]/g, "").split(/\s+/).filter(function(w) { return w.length > 1 && allStops.indexOf(w) === -1; });
  };
  var getEntities = function(text) {
    return text.replace(/[?.!,،؟]/g, "").split(/\s+/).filter(function(w) { return w.length >= 4 && allStops.indexOf(w) === -1; });
  };

  var dupeIndices = new Set();
  var qWords = allQuestions.map(function(q) { return getWords(q.question); });
  var qEntities = allQuestions.map(function(q) { return getEntities(q.question + " " + q.correct_answer); });

  allQuestions.forEach(function(q, i) {
    if (dupeIndices.has(i)) return;
    for (var j = i + 1; j < allQuestions.length; j++) {
      if (dupeIndices.has(j)) continue;
      // בדיקה 1: תשובה נכונה זהה
      if (q.correct_answer === allQuestions[j].correct_answer) { dupeIndices.add(j); continue; }
      // בדיקה 2: overlap מילים כללי (60%+ = כפילות ברורה)
      var shared = 0;
      qWords[i].forEach(function(w) { if (qWords[j].indexOf(w) !== -1) shared++; });
      var overlap = shared / Math.max(1, Math.min(qWords[i].length, qWords[j].length));
      if (overlap >= 0.6) { dupeIndices.add(j); continue; }
      // בדיקה 3: 2+ ישויות מפתח משותפות (לא כולל שם הנושא)
      var sharedE = 0;
      qEntities[i].forEach(function(e) { if (qEntities[j].indexOf(e) !== -1) sharedE++; });
      if (sharedE >= 2) { dupeIndices.add(j); continue; }
    }
  });

  if (dupeIndices.size > 0) {
    var idx = 0;
    quizData = {
      members: quizData.members.map(function(m) {
        return {
          name: m.name,
          questions: m.questions.filter(function() { return !dupeIndices.has(idx++); })
        };
      })
    };
  }
  return quizData;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const PRAISE = ["בול! 🎯","יאללה! 🔥","חזק! 💥","אחלה! 🌟","בדיוק! ✨","וואלה! 🧠","קלף! 🎉"];
const MISS   = ["אופס! 😅","קרוב! 💪","בסיבוב הבא 🎯","לא נורא! 🔥"];
const rnd    = (a) => a[Math.floor(Math.random() * a.length)];

const TMAP   = { "דינוזאורים":"🦕","חלל":"🚀","אריות":"🦁","דולפינים":"🐬","מצרים":"🏛️","ים":"🌊","כדורגל":"⚽","מדע":"🔬","ציפורים":"🦅","הר":"🗻" };
const te     = (t) => { for (const [k,v] of Object.entries(TMAP)) if (t?.includes(k)) return v; return "🌟"; };
const fp = (members, scores) => {
  const valid = members.filter(m => scores[m.name]?.total > 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((s,m) => { const sc=scores[m.name]; return s + sc.correct/sc.total*100; }, 0) / valid.length);
};
// ציון גולמי: (% נכון × 100) + בונוס מהירות קטן (עד 10 נק')
const calcRawScore = (members, scores) => {
  const valid = members.filter(m => scores[m.name]?.total > 0);
  if (!valid.length) return 0;
  const pct = valid.reduce((s,m) => { const sc=scores[m.name]; return s + sc.correct/sc.total*100; }, 0) / valid.length;
  const timerScores = valid.filter(m => scores[m.name].timerCount > 0);
  const avgSecs = timerScores.length
    ? timerScores.reduce((s,m) => s + scores[m.name].timerSum/scores[m.name].timerCount, 0) / timerScores.length
    : 0;
  // בונוס זמן: עד 10 נקודות מקסימום — shoverbreak, לא מכריע
  var timerBonus = Math.min(10, Math.round(avgSecs));
  return Math.round(pct * 100 + timerBonus);
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
        <div key={i} style={{ position:"absolute", left:(Math.random()*100 + "%"), top:"-20px", width:6+Math.random()*10, height:6+Math.random()*10, borderRadius:Math.random()>.5?"50%":"2px", background:cols[i%cols.length], animation:("fall " + (1+Math.random()*1.5) + "s ease-in forwards"), animationDelay:(Math.random()*.8 + "s") }} />
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
        <div style={{ width:90, height:90, borderRadius:"50%", background:(g.color + "22"), border:("3px solid " + g.color), display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(44px, 23vw, 53px)", margin:"0 auto 12px", boxShadow:("0 0 40px " + g.color + "88") }}>{g.emoji}</div>
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
    if (onTick) onTick(seconds);
    iv.current = setInterval(() => setLeft(l => { const next = l - 1; if (next <= 0) { clearInterval(iv.current); if (onTick) onTick(0); onExpire(); return 0; } if (onTick) onTick(next); return next; }), 1000);
    return () => clearInterval(iv.current);
  }, [seconds]);
  if (!seconds) return null;
  const pct = left / seconds;
  const col = pct < .3 ? "#f87171" : pct < .6 ? "#fbbf24" : color;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <div style={{ flex:1, background:"rgba(255,255,255,0.1)", borderRadius:20, height:10, overflow:"hidden" }}>
        <div style={{ width:(pct*100 + "%"), height:"100%", background:col, borderRadius:20, transition:"width 1s linear, background .3s" }} />
      </div>
      <div style={{ color:col, fontFamily:"'Fredoka One',cursive", fontSize:"clamp(20px, 14vw, 26px)", minWidth:32, textAlign:"center", animation:left<=5?"shake .3s ease infinite":"none" }}>{left}</div>
    </div>
  );
}

// ─── PUSH NOTIFICATION MODAL ─────────────────────────────────────────────────
function PushModal({ familyName, onDone }) {
  var shouldShow = ("Notification" in window) && ("PushManager" in window) && Notification.permission === "default" && !LS.get("push_asked");

  if (!shouldShow) return null;

  var accept = async function() {
    LS.set("push_asked", true);
    var ok = await registerPush(familyName);
    onDone(ok);
  };
  var dismiss = function() {
    LS.set("push_asked", true);
    onDone(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"slideIn .3s ease" }}>
      <div style={{ background:"linear-gradient(160deg,#1a1540,#0f172a)", border:"1px solid rgba(167,139,250,.3)", borderRadius:24, padding:"clamp(20px,4vw,32px)", maxWidth:380, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:"clamp(56px, 28vw, 67px)", marginBottom:12 }}>🔔</div>
        <h2 style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(22px, 15vw, 28px)", margin:"0 0 8px" }}>לא לפספס!</h2>
        <p style={{ color:"#c4b5fd", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(15px, 11vw, 19px)", margin:"0 0 6px", lineHeight:1.6 }}>מישהו עקף אותכם? תקבלו התראה מיד!</p>
        <p style={{ color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(13px, 10vw, 16px)", margin:"0 0 20px" }}>ללא ספאם, רק כשמישהו משיג ציון גבוה יותר מכם</p>
        <button onClick={accept} style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:16, color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 22px)", cursor:"pointer", boxShadow:"0 4px 24px #7c3aed55", marginBottom:8 }}>🔔 הפעילו התראות</button>
        <button onClick={dismiss} style={{ width:"100%", padding:"10px", background:"none", border:"none", color:"#475569", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(14px, 10vw, 17px)", cursor:"pointer" }}>אולי אחר כך</button>
      </div>
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
      const validMembers = valid.map(m => ({ name: m.name.trim(), age: parseInt(m.age) }));
      const res = await registerFamily(name.trim(), pin, validMembers, null);
      if (!res?.ok) { setLoading(false); return setErr(res?.error || "שגיאה"); }
      const family = { name: name.trim(), pin, members: validMembers };
      saveFamily(family);
      setLoading(false);
      onDone(family);
    } else {
      setLoading(true);
      const res = await registerFamily(name.trim(), pin, null, null);
      if (!res?.ok) { setLoading(false); return setErr(res?.error || "שם משפחה או PIN שגוי"); }
      const membersFromDB = (res.members||[]).map(m => ({ name: m.name, age: parseInt(m.age)||10 }));
      if (!membersFromDB.length) { setLoading(false); return setErr("לא נמצאו פרטי משפחה — צרו קשר עם מנהל החידון"); }
      const family = { name: name.trim(), pin, members: membersFromDB };
      saveFamily(family);
      setLoading(false);
      onDone(family);
    }
  };

  return (
    <div style={{ animation:"slideIn .4s ease" }}>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:"clamp(64px, 30vw, 77px)", animation:"bounce 2s ease infinite" }}>🦊</div>
        <h1 style={{ fontFamily:"'Fredoka One',cursive", color:"#fff", fontSize:"clamp(32px, 19vw, 40px)", margin:"8px 0 4px" }}>Dare2Know</h1>
        <p style={{ color:"#475569", fontSize:"clamp(17px, 12vw, 24px)", fontFamily:"'Varela Round',sans-serif", margin:0 }}>אתגר ידע מבוסס ויקיפדיה · מי יודע יותר? 🏆</p>
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
                  <div style={{ width:36, height:36, borderRadius:"50%", background:g?(g.color + "22"):"rgba(255,255,255,.08)", border:("2px solid " + (g?g.color:"rgba(255,255,255,.15)")), display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(18px, 13vw, 25px)", flexShrink:0, transition:"all .3s" }}>{g?g.emoji:"👤"}</div>
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
  const [myChallenges, setMyChallenges] = useState([]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  useEffect(() => { getMonthlyBoard(onSetOnline).then(d => setMonthly(d || {pts:[],avg:[]})); }, []);

  useEffect(() => {
    if (tab === "join") {
      setChallengeLoading(true);
      getMyActiveChallenges(family.name, onSetOnline).then(d => { setMyChallenges(d||[]); setChallengeLoading(false); });
    }
  }, [tab]);

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
        <>
          {/* אתגרים פעילים */}
          {challengeLoading && <div style={{ ...C.card, textAlign:"center", color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 20px)" }}>🔍 טוען אתגרים...</div>}

          {!challengeLoading && myChallenges.length > 0 && (
            <div style={C.card}>
              <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 22px)", marginBottom:10 }}>⚔️ האתגרים שלי</div>
              {myChallenges.map((ch,i) => {
                const isOpen = selectedChallenge === ch.code;
                const daysLeft = Math.ceil((new Date(ch.expires_at||Date.now()+86400000) - new Date()) / 86400000);
                return (
                  <div key={ch.code} style={{ marginBottom:8 }}>
                    <button onClick={() => setSelectedChallenge(isOpen ? null : ch.code)}
                      style={{ width:"100%", background:isOpen?"rgba(167,139,250,.15)":"rgba(255,255,255,.04)", border:("1px solid " + (isOpen?"#a78bfa44":"rgba(255,255,255,.08)")), borderRadius:14, padding:"12px", cursor:"pointer", textAlign:"right", transition:"all .2s" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(16px, 12vw, 20px)" }}>{ch.topic}</div>
                          <div style={{ color:"#475569", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(13px, 10vw, 16px)", marginTop:2 }}>
                            {ch.total} משפחות · {daysLeft} ימים נותרו
                          </div>
                        </div>
                        <div style={{ textAlign:"center" }}>
                          {ch.myRank && <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 24px)" }}>#{ch.myRank}</div>}
                          {ch.myScore !== null && <div style={{ color:"#94a3b8", fontSize:"clamp(13px, 10vw, 15px)" }}>{ch.myScore}%</div>}
                        </div>
                        <div style={{ color:"#475569", fontSize:"clamp(16px, 12vw, 20px)" }}>{isOpen?"▲":"▼"}</div>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)", borderRadius:"0 0 14px 14px", padding:"8px 12px" }}>
                        {(() => {
                          const all = ch.challenges;
                          const myIdx = all.findIndex(r => r.family_name === family.name);
                          // טופ 3 + סביבת המשתמש
                          const top3 = all.slice(0,3);
                          const around = myIdx > 2 ? [
                            ...(myIdx > 3 ? [{ family_name:"...", family_pct:null }] : []),
                            ...(myIdx > 0 ? [all[myIdx-1]] : []),
                            all[myIdx],
                            ...(myIdx < all.length-1 ? [all[myIdx+1]] : []),
                          ] : [];
                          const rows = myIdx <= 2 ? all.slice(0, Math.min(8, all.length)) : [...top3, { family_name:"...", family_pct:null }, ...around];
                          return rows.map((r,ri) => {
                            if (r.family_name === "...") return <div key={ri} style={{ color:"#334155", textAlign:"center", padding:"4px", fontFamily:"'Varela Round',sans-serif" }}>···</div>;
                            const isMe = r.family_name === family.name;
                            const rank = all.findIndex(x => x.family_name === r.family_name) + 1;
                            return (
                              <div key={ri} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 8px", marginBottom:4, background:isMe?"rgba(167,139,250,.15)":"transparent", borderRadius:10, border:("1px solid " + (isMe?"#a78bfa44":"transparent")) }}>
                                <span style={{ fontSize:"clamp(16px, 12vw, 20px)", minWidth:22 }}>{rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":(rank + ".")}</span>
                                <span style={{ flex:1, color:isMe?"#c4b5fd":"#fff", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(15px, 11vw, 18px)" }}>{r.family_name}{isMe?" ← אתם":""}</span>
                                <span style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(16px, 12vw, 20px)" }}>{r.family_pct}%</span>
                              </div>
                            );
                          });
                        })()}
                        {ch.creator_family === family.name && (() => {
                          const url = window.location.origin + window.location.pathname + "?code=" + ch.code;
                          const myScore = ch.myScore !== null ? ch.myScore + "%" : "";
                          const waMsg = encodeURIComponent("🎮 Dare2Know — " + ch.topic + "\nמשפחת " + family.name + " הגיעה ל-" + myScore + "! 🏆\nהאם תוכלו לעקוף אותנו?\nקוד: *" + ch.code + "*\n" + url);
                          const plainMsg = "🎮 Dare2Know — " + ch.topic + "\nמשפחת " + family.name + " הגיעה ל-" + myScore + "! 🏆\nהאם תוכלו לעקוף אותנו?\nקוד: " + ch.code + "\n" + url;
                          return (
                            <div style={{ display:"flex", gap:8, marginTop:8 }}>
                              <a href={"https://wa.me/?text=" + waMsg} target="_blank" rel="noreferrer"
                                style={{ flex:2, display:"block", padding:"10px", background:"linear-gradient(135deg,#16a34a,#15803d)", borderRadius:18, color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(14px, 10vw, 17px)", textDecoration:"none", textAlign:"center", boxShadow:"0 4px 20px #16a34a55" }}>
                                📱 שתף בוואטסאפ
                              </a>
                              <button onClick={function(e) { navigator.clipboard?.writeText(plainMsg); var btn=e.currentTarget; btn.textContent="✅ הועתק!"; btn.style.color="#4ade80"; setTimeout(function(){ btn.textContent="📋 העתק"; btn.style.color="#94a3b8"; }, 2000); }}
                                style={{ flex:1, padding:"10px", background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.15)", borderRadius:18, color:"#94a3b8", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(14px, 10vw, 17px)", cursor:"pointer" }}>
                                📋 העתק
                              </button>
                            </div>
                          );
                        })()}
                        <button onClick={() => onJoin(ch.code)}
                          style={{ width:"100%", marginTop:8, padding:"10px", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:18, color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(14px, 10vw, 17px)", cursor:"pointer", boxShadow:"0 4px 20px #7c3aed55" }}>
                          🔥 {ch.myScore !== null ? "שפרו את הציון!" : "שחקו באתגר!"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* הצטרפות בקוד */}
          <div style={C.card}>
            <p style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 20px)", margin:"0 0 14px" }}>קיבלתם קוד מחברים? הכניסו אותו ותתחרו!</p>
            <label style={C.lbl}>🔑 קוד החידון</label>
            <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" maxLength={6} type="text" inputMode="numeric"
              style={{ ...C.inp, fontSize:"clamp(32px, 19vw, 40px)", textAlign:"center", letterSpacing:10, fontFamily:"'Fredoka One',cursive" }}
              onFocus={e=>e.target.style.borderColor="#fbbf24"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"}
              onKeyDown={e=>e.key==="Enter"&&code.length>=4&&onJoin(code)} />
            <button onClick={() => code.length>=4&&onJoin(code)} disabled={code.length<4}
              style={{ ...C.btnP, opacity:code.length>=4?1:0.4, background:"linear-gradient(135deg,#d97706,#b45309)" }}>
              ⚔️ קבל את האתגר!
            </button>
          </div>
        </>
      )}

      {tab === "board" && (
        <div style={C.card}>
          <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(17px, 12vw, 24px)", marginBottom:12 }}>🏆 לוח הגיבורים החודשי</div>
          {(monthly.pts||[]).length === 0 && <div style={{ color:"#334155", textAlign:"center", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", padding:"20px 0" }}>אין עדיין תוצאות — היו הראשונים! 🎉</div>}
          {(monthly.pts||[]).map((r,i) => {
            const isMe = r.family_name === family.name;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", marginBottom:6, background:isMe?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.03)", borderRadius:12, border:("1px solid " + (isMe?"#a78bfa44":"transparent")) }}>
                <span style={{ fontSize:"clamp(18px, 13vw, 25px)", minWidth:24 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1 + ".")}</span>
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
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const quick = [{e:"🦕",t:"דינוזאורים"},{e:"🚀",t:"חלל"},{e:"🦁",t:"אריות"},{e:"🐬",t:"דולפינים"},{e:"🏛️",t:"מצרים העתיקה"},{e:"🌋",t:"הרי געש"},{e:"🐳",t:"לוויתנים"},{e:"🧠",t:"מדע"},{e:"🌍",t:"מדינות העולם"}];

  const doSearch = async () => {
    if (!topic.trim()) return;
    setSearching(true); setSearchDone(false); setResults([]);
    try {
      const res = await searchWikiResults(topic.trim());
      setResults(res); setSearchDone(true);
    } catch { setResults([]); setSearchDone(true); }
    setSearching(false);
  };

  const pickQuick = (t) => { setTopic(t); setResults([]); setSearchDone(false); };

  return (
    <>
      <label style={C.lbl}>📚 נושא החידון</label>
      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <input value={topic} onChange={e=>{ setTopic(e.target.value); setSearchDone(false); setResults([]); }} placeholder="לדוגמה: דינוזאורים, כרמים..."
          style={{ ...C.inp, flex:1, marginBottom:0 }}
          onFocus={e=>e.target.style.borderColor="#a78bfa"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.12)"}
          onKeyDown={e=>e.key==="Enter"&&doSearch()} />
        <button onClick={doSearch} disabled={!topic.trim()||searching}
          style={{ background:"rgba(167,139,250,.2)", border:"1px solid #a78bfa66", borderRadius:12, padding:"0 14px", color:"#a78bfa", cursor:"pointer", fontSize:"clamp(15px, 11vw, 20px)", fontFamily:"'Varela Round',sans-serif", whiteSpace:"nowrap" }}>
          {searching ? "🔍..." : "🔍 חפש"}
        </button>
      </div>

      {searchDone && results.length > 0 && (
        <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(167,139,250,.2)", borderRadius:14, marginBottom:12, overflow:"hidden" }}>
          <div style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(13px, 10vw, 17px)", padding:"8px 12px", borderBottom:"1px solid rgba(255,255,255,.06)" }}>בחר את המאמר הנכון:</div>
          {results.map((r,i) => (
            <button key={i} onClick={() => { setTopic(r.title); setResults([]); setSearchDone(false); onStart(r.title); }}
              style={{ width:"100%", background:"transparent", border:"none", borderBottom:i<results.length-1?"1px solid rgba(255,255,255,.05)":"none", padding:"10px 12px", cursor:"pointer", textAlign:"right", transition:"background .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(167,139,250,.1)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(15px, 11vw, 19px)" }}>{r.title}</div>
              {r.snippet && <div style={{ color:"#475569", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(12px, 9vw, 15px)", marginTop:2 }}>{r.snippet}...</div>}
            </button>
          ))}
        </div>
      )}

      {searchDone && results.length === 0 && (
        <div style={{ color:"#f87171", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(14px, 11vw, 18px)", marginBottom:10 }}>לא נמצאו תוצאות — נסה נושא אחר</div>
      )}

      {!searchDone && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginTop:4, marginBottom:10 }}>
          {quick.map(({e,t}) => (
            <button key={t} onClick={() => { pickQuick(t); onStart(t); }} style={{ background:topic===t?"rgba(167,139,250,.25)":"rgba(255,255,255,.05)", border:("1px solid " + (topic===t ? "#a78bfa" : "rgba(255,255,255,.1)")), borderRadius:12, padding:"9px 4px", cursor:"pointer", color:"#fff", fontSize:"clamp(15px, 11vw, 21px)", fontFamily:"'Varela Round',sans-serif", textAlign:"center", transition:"all .2s" }}>
              <div style={{ fontSize:"clamp(20px, 14vw, 26px)", marginBottom:2 }}>{e}</div>{t}
            </button>
          ))}
        </div>
      )}

      <p style={{ color:"#334155", fontSize:"clamp(15px, 11vw, 21px)", fontFamily:"'Varela Round',sans-serif", margin:"0 0 12px" }}>💡 שאלות מבוססות ויקיפדיה בלבד — מידע מאומת</p>
      {!searchDone && <button onClick={() => topic.trim() && onStart(topic.trim())} disabled={!topic.trim()}
        style={{ ...C.btnP, opacity:topic.trim()?1:0.4, marginBottom:0 }}>🚀 צור חידון!</button>}
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
              <div style={{ width:36, height:36, borderRadius:"50%", background:g?(g.color + "22"):"rgba(255,255,255,.08)", border:("2px solid " + (g?g.color:"rgba(255,255,255,.15)")), display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(18px, 13vw, 25px)", flexShrink:0 }}>{g?g.emoji:"👤"}</div>
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
        {[0,1,2,3].map(i => <div key={i} style={{ width:10, height:10, borderRadius:"50%", background:"#a78bfa", animation:("pulse 1.4s ease " + (i*.3) + "s infinite") }} />)}
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
  const finishedRef = useRef(false);
  useEffect(() => {
    if (finished && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(scores);
    }
  }, [finished]);
  if (finished) return (
    <div style={{ textAlign:"center", padding:"80px 20px" }}>
      <div style={{ fontSize:"clamp(56px, 28vw, 67px)", animation:"spin 2s linear infinite", display:"inline-block" }}>🏆</div>
      <div style={{ color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(22px, 15vw, 28px)", marginTop:16 }}>מחשב תוצאות...</div>
    </div>
  );
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
    // Points: base 10 per correct answer. Speed bonus: up to 3 extra points (capped)
    const base = ok ? 10 : 0;
    const bonus = ok && g.timer > 0 ? Math.min(3, Math.floor(timeLeft / (g.timer / 3))) : 0;
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
          <div style={{ width:(progress + "%"), height:"100%", background:"linear-gradient(90deg,#a78bfa,#60a5fa)", borderRadius:20, transition:"width .5s ease" }} />
        </div>
        <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
          {members.map(m => { const mg=ag(m.age); const s=scores[m.name]; return (
            <div key={m.name} style={{ display:"flex", alignItems:"center", gap:4, opacity:m.name===member.name?1:.4, transition:"opacity .3s", background:m.name===member.name?(mg.color + "22"):"transparent", borderRadius:20, padding:"2px 8px 2px 4px", border:m.name===member.name?("1px solid " + mg.color + "44"):"1px solid transparent" }}>
              <span style={{ fontSize:"clamp(17px, 12vw, 24px)" }}>{mg.emoji}</span>
              <span style={{ color:mg.color, fontFamily:"'Fredoka One',cursive", fontSize:"clamp(15px, 11vw, 21px)" }}>{s.points||0}נק'</span>
            </div>
          ); })}
        </div>
      </div>

      <div style={{ ...C.card, borderColor:(g.color + "44"), animation:"slideIn .3s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:42, height:42, borderRadius:"50%", background:(g.color + "22"), border:("2.5px solid " + g.color), display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(20px, 14vw, 26px)", flexShrink:0, boxShadow:!done?("0 0 16px " + g.color + "66"):"none", transition:"box-shadow .3s" }}>{g.emoji}</div>
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
                style={{ background:bg, border:("2px solid " + brd), borderRadius:14, padding:member.age<=5?"16px 10px":"11px 12px", cursor:done?"default":"pointer", display:"flex", alignItems:"center", gap:8, transition:"all .2s", fontFamily:"'Varela Round',sans-serif", color:"#fff", fontSize:member.age<=5?16:14, textAlign:"right", animation:done&&i===question.correct_index?"correctPulse .5s ease":done&&i===sel&&i!==question.correct_index?"shake .3s ease":"" }}
                onMouseEnter={e=>{ if(!done){e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.background="rgba(255,255,255,.12)"}}}
                onMouseLeave={e=>{ if(!done){e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background=bg}}}>
                <span style={{ background:(g.color + "22"), color:g.color, borderRadius:"50%", width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(15px, 11vw, 21px)", fontWeight:"bold", flexShrink:0 }}>{labels[i]}</span>
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
            
          </div>
        )}
      </div>

      {done && ti+1>=turns.length && (
        <button onClick={next} style={{ ...C.btnP, background:("linear-gradient(135deg," + g.color + "," + g.color + "99)"), color:"#000", animation:"slideIn .3s ease" }}
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
  const url = window.location.origin + window.location.pathname + "?code=" + code;
  const waText = encodeURIComponent("🎮 Dare2Know — " + topic + "\nמשפחת " + familyName + " השיגה " + pct + "%!\n\nהאם תוכלו לנצח? 🏆\n\nקוד: *" + code + "*\n" + url);

  const fullMsg = "🎮 Dare2Know — " + topic + "\nמשפחת " + familyName + " השיגה " + pct + "%!\n\nהאם תוכלו לנצח? 🏆\n\nקוד: " + code + "\n" + url;

  const copy = () => { navigator.clipboard?.writeText(fullMsg).catch(function(){}); setCopied(true); setTimeout(function(){setCopied(false);},2000); };

  return (
    <div style={{ ...C.card, textAlign:"center", animation:"slideIn .4s ease" }}>
      <div style={{ fontSize:"clamp(52px, 26vw, 62px)", marginBottom:8 }}>🎉</div>
      <h2 style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(24px, 16vw, 31px)", margin:"0 0 6px" }}>שלחו את האתגר!</h2>
      <p style={{ color:"#64748b", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(17px, 12vw, 24px)", margin:"0 0 20px" }}>הזמינו משפחה אחרת לאותו חידון</p>

      <div style={{ background:"rgba(251,191,36,.1)", border:"1px solid rgba(251,191,36,.25)", borderRadius:16, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ color:"#64748b", fontSize:"clamp(16px, 12vw, 22px)", fontFamily:"'Varela Round',sans-serif", marginBottom:4 }}>קוד החידון</div>
        <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(56px, 28vw, 67px)", letterSpacing:10, lineHeight:1 }}>{code}</div>
      </div>

      <a href={"https://wa.me/?text=" + waText} target="_blank" rel="noreferrer"
        style={{ display:"block", padding:"15px", background:"linear-gradient(135deg,#16a34a,#15803d)", borderRadius:18, color:"#fff", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(20px, 14vw, 26px)", textDecoration:"none", marginBottom:8, boxShadow:"0 4px 20px #16a34a55" }}>
        📱 שליחה בוואטסאפ
      </a>
      <button onClick={copy} style={{ ...C.btnS, color:copied?"#4ade80":"#94a3b8" }}>{copied?"✅ הועתק!":"📋 העתק הודעה"}</button>
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
  // הודעות שמעודדות תמיד לשחק עוד
  var msg, sub, emoji;
  if (pct === 100)     { emoji = "🏆"; msg = "מושלם!"; sub = "אלופים! בואו ננסה נושא חדש?"; }
  else if (pct >= 85)  { emoji = "🔥"; msg = "כמעט מושלם!"; sub = "עוד קצת ואתם על 100%!"; }
  else if (pct >= 65)  { emoji = "💪"; msg = "יופי של התחלה!"; sub = "שאלות חדשות = הזדמנות לשפר!"; }
  else                 { emoji = "🎯"; msg = "יש מאיפה לטפס!"; sub = "כל סיבוב מלמד משהו חדש — קדימה!"; }
  const badges = calcBadges(scores, members);

  useEffect(() => {
    setBoard([]); setMonthly({pts:[],avg:[]});
    if (code) getChallenges(code, null).then(d => setBoard(d||[])).catch(()=>{});
    getMonthlyBoard(null).then(d => setMonthly(d||{pts:[],avg:[]})).catch(()=>{});
  }, [code]);

  const myRank = board.findIndex(r => r.family_name===familyName) + 1;
  // מצא את הציון הגבוה ביותר של מתחרה (לא אנחנו)
  var topRival = board.find(function(r) { return r.family_name !== familyName; });
  var rivalPct = topRival ? topRival.family_pct : creatorPct;
  var beat = rivalPct !== null && pct > rivalPct;

  return (
    <div style={{ animation:"slideIn .5s ease" }} key="results-screen">
      <ConfettiOnce />
      <div style={{ ...C.card, textAlign:"center", marginBottom:14 }}>
        <div style={{ fontSize:"clamp(56px, 28vw, 67px)", marginBottom:8, animation:"bounce 1s ease infinite" }}>{emoji}</div>
        <h2 style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(26px, 16vw, 32px)", margin:"0 0 4px" }}>{msg}</h2>
        {beat && <div style={{ color:"#4ade80", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(18px, 13vw, 25px)", marginBottom:6 }}>🎯 ניצחתם! ({pct}% vs {rivalPct}%)</div>}
        <p style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", margin:"0 0 6px", fontSize:"clamp(15px, 11vw, 20px)" }}>{sub}</p>
        <p style={{ color:"#475569", fontFamily:"'Varela Round',sans-serif", margin:"0 0 14px", fontSize:"clamp(17px, 12vw, 24px)" }}>משפחת {familyName} · {topic}</p>
        <div style={{ background:"rgba(255,255,255,.08)", borderRadius:16, padding:"14px 24px", display:"inline-block" }}>
          <div style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(52px, 26vw, 62px)", lineHeight:1 }}>{pct}%</div>
          {myRank>0&&<div style={{ color:"#a78bfa", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(16px, 12vw, 22px)", marginTop:4 }}>מקום {myRank} מבין {board.length} משפחות</div>}
        </div>
        {badges.length > 0 && (
          <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap", marginTop:12 }}>
            {badges.map((b,i) => (
              <div key={i} style={{ background:"rgba(251,191,36,.12)", border:"1px solid rgba(251,191,36,.3)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ fontSize:"clamp(16px, 12vw, 20px)" }}>{b.emoji}</span>
                <span style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(14px, 11vw, 17px)" }}>{b.label}</span>
              </div>
            ))}
          </div>
        )}
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
            <div key={m.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, padding:"12px", background:"rgba(255,255,255,.04)", borderRadius:14, border:("1px solid " + g.color + "33") }}>
              <span style={{ fontSize:"clamp(20px, 14vw, 26px)" }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":"🎖️"}</span>
              <div style={{ width:36, height:36, borderRadius:"50%", background:(g.color + "22"), border:("2px solid " + g.color), display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(18px, 13vw, 25px)" }}>{g.emoji}</div>
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
            const getSub = (r) => tab==="mavg" ? ("(" + (r.monthly_games || 0) + " משחקים)") : "";
            return (rows||[]).slice(0,8).map((r,i) => {
              const isMe = r.family_name===familyName;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", marginBottom:5, background:isMe?"rgba(167,139,250,.15)":"rgba(255,255,255,.03)", borderRadius:12, border:("1px solid " + (isMe?"#a78bfa44":"transparent")) }}>
                  <span style={{ fontSize:"clamp(19px, 14vw, 25px)", minWidth:22 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1 + ".")}</span>
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
          📱 אתגרו משפחה אחרת!
        </button>
      )}
      <button onClick={onSameTopic} style={C.btnP}>{pct < 100 ? "🔥 שפרו את הציון — שאלות חדשות!" : "🔄 עוד סיבוב על " + topic}</button>
      <button onClick={onHome} style={C.btnS}>🎮 נושא אחר</button>
    </div>
  );
}

function AppInner() {
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
  const [showPushModal, setShowPushModal] = useState(false);

  // boot: check localStorage + URL code
  useEffect(() => {
    const saved = getFamily();
    const urlCode = new URLSearchParams(window.location.search).get("code");
    if (saved) {
      // אם members ריק — נסה לטעון מ-Supabase
      if (!saved.members || !saved.members.length) {
        sbSafe(async () => {
          const r = await sbFetch("families?name=eq." + encodeURIComponent(saved.name) + "&select=*");
          const dbMembers = (r?.[0]?.members || []).map(m => ({ name: m.name, age: parseInt(m.age)||10 }));
          if (dbMembers.length) {
            const updated = { ...saved, members: dbMembers };
            saveFamily(updated);
            setFamily(updated);
            if (urlCode) setTimeout(() => handleJoinWithFamily(updated, urlCode), 100);
            else setScreen("home");
          } else {
            // אין ב-DB גם כן — שלח ל-welcome לעדכון גילאים
            setFamily(saved);
            setScreen("home");
          }
        }, null, null);
        return;
      }
      setFamily(saved);
      registerPush(saved.name);
      if (urlCode) {
        setTimeout(() => handleJoinWithFamily(saved, urlCode), 100);
      } else {
        setScreen("home");
      }
    } else {
      if (urlCode) setCode(urlCode);
      setScreen("welcome");
    }
  }, []);

  const handleJoinWithFamily = async (fam, c) => {
    const stop = startLoad();
    try {
      const room = await loadQuizByCode(c, setSbOnline);
      if (!room) { stop(); setError("לא נמצא חידון עם קוד " + c); setScreen("home"); return; }
      const played = await hasPlayedQuiz(c, fam.name, setSbOnline);
      if (played) {
        stop(); setTopic(room.topic); setBlockedTopic(room.topic); setCode(c); setCreatorPct(room.creator_pct); setScreen("alreadyPlayed"); return;
      }
      const validated = await buildQuiz(room.topic, fam.members);
      stop(); setTopic(room.topic); setCode(c); setCreatorPct(room.creator_pct);
      setQuizData(validated); setIsChallenger(true); setScreen("quiz");
      window.history.replaceState({}, "", window.location.pathname);
    } catch(e) { stop(); setError("שגיאה בטעינת החידון"); setScreen("home"); }
  };

  const startLoad = () => {
    setScreen("loading"); setError("");
    let mi = 0;
    const iv = setInterval(() => setLoadMsg(LOAD_MSGS[mi++ % LOAD_MSGS.length]), 2000);
    return () => clearInterval(iv);
  };

  // ─── שיתוף לוגיקה: יצירת שאלות מויקיפדיה ───
  const buildQuiz = async (t, mems) => {
    const wiki = await fetchWiki(t);
    if (wiki.shortArticle) {
      setError("📄 המאמר קצר — ייתכנו חזרות");
      setTimeout(function() { setError(""); }, 4000);
    }
    const seed = Math.random().toString(36).slice(2,8);
    const data = await generateQuestions(wiki.text, wiki.lang, mems, seed, wiki.title);
    return data;
  };

  const handlePlay = async (t) => {
    setTopic(t); setIsChallenger(false); setCreatorPct(null);
    const stop = startLoad();
    try {
      const validated = await buildQuiz(t, family.members);
      stop(); setQuizData(validated); setScreen("quiz");
    } catch(e) { stop(); setError(e.message||"שגיאה"); setScreen("home"); }
  };

  const handleJoin = async (c) => {
    const stop = startLoad();
    try {
      const room = await loadQuizByCode(c, setSbOnline);
      if (!room) { stop(); setError("לא נמצא חידון עם קוד " + c); setScreen("home"); return; }
      const played = await hasPlayedQuiz(c, family.name, setSbOnline);
      if (played) {
        stop(); setTopic(room.topic); setBlockedTopic(room.topic); setCode(c); setCreatorPct(room.creator_pct); setScreen("alreadyPlayed"); return;
      }
      const validated = await buildQuiz(room.topic, family.members);
      stop(); setTopic(room.topic); setCode(c); setCreatorPct(room.creator_pct);
      setQuizData(validated); setIsChallenger(true); setScreen("quiz");
      window.history.replaceState({}, "", window.location.pathname);
    } catch(e) { stop(); setError("שגיאה בטעינת החידון"); setScreen("home"); }
  };
const handleFinish = async (s) => {
  setScores(s);
  const pct = fp(family.members, s);
  const rawScore = calcRawScore(family.members, s);
  try {
    if (isChallenger) {
      // עדכן ציון קיים, או צור חדש
      var updated = await updateChallenge(code, family.name, pct, null);
      if (!updated) await saveChallenge(code, family.name, pct, null).catch(function(){});
      // שמור גם ב-family_challenges כדי שהאתגר יופיע ברשימה שלי
      saveFamilyChallenge(code, family.name, null).catch(function(){});
      upsertScore(family.name, rawScore, pct, null).catch(function(){});
      // שלח Push למשפחות שנעקפו
      notifyBeatenFamilies(code, family.name, pct, topic);
      if (creatorPct !== null && pct > creatorPct) setBeatenBy(null);
      setScreen("results");
    } else {
      // יוצר אתגר חדש
      var newCode = makeCode();
      setCode(newCode);
      // שמור חדר + ציון + קשר לאתגר — await כדי שה-DB ייצור לפני שעוברים מסך
      await saveQuizRoom(newCode, topic, family.name, pct, null);
      await saveChallenge(newCode, family.name, pct, null);
      await saveFamilyChallenge(newCode, family.name, null);
      upsertScore(family.name, rawScore, pct, null).catch(function(){});
      setScreen("share");
    }
  } catch(e) {
    console.error("handleFinish error:", e);
    // גם אם DB נכשל — תמיד הגע למסך תוצאות
    setScreen(isChallenger ? "results" : "share");
  }
  // הצג מודל התראות אחרי סיום חידון
  if ("Notification" in window && Notification.permission === "default" && !LS.get("push_asked")) {
    setTimeout(function() { setShowPushModal(true); }, 1500);
  }
};

  const handleSameTopic = async () => {
    const stop = startLoad();
    try {
      const validated = await buildQuiz(topic, family.members);
      stop(); setQuizData(validated); setIsChallenger(false); setCreatorPct(null); setScreen("quiz");
    } catch(e) { stop(); setError(e.message); setScreen("home"); }
  };

  const handleRematch = async () => {
    const stop = startLoad();
    try {
      const validated = await buildQuiz(topic, family.members);
      const newCode = makeCode();
      setCode(newCode);
      stop(); setQuizData(validated); setIsChallenger(false); setBeatenBy(null); setScreen("quiz");
    } catch(e) { stop(); setError(e.message); setScreen("home"); }
  };

  // שחק שוב את אותו אתגר — שאלות חדשות, עדכון ציון קיים
  const handleRetryChallenge = async () => {
    const stop = startLoad();
    try {
      const validated = await buildQuiz(blockedTopic || topic, family.members);
      stop(); setTopic(blockedTopic || topic); setQuizData(validated); setIsChallenger(true); setScreen("quiz");
    } catch(e) { stop(); setError(e.message); setScreen("home"); }
  };

  const handleWelcomeDone = (f) => {
    setFamily(f);
    registerPush(f.name);
    if (code) { setTimeout(() => handleJoinWithFamily(f, code), 100); }
    else setScreen("home");
  };
  const handleEditSave = (f) => {
    saveFamily(f); setFamily(f);
    updateFamilyMembers(f.name, f.pin, f.members, null);
    setScreen("home");
  };
  const handleDeleteFamily = () => { clearFamily(); setFamily(null); setScreen("welcome"); };
  const handleLogout = () => { clearFamily(); setFamily(null); setScreen("welcome"); };

  if (screen === "boot") return <div style={{ minHeight:"100vh", background:"#05050f" }} />;

  const pct = fp(family?.members||[], scores);

  return (
    <>
      <style>{"@keyframes slideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes fall{to{transform:translateY(105vh) rotate(720deg);opacity:0}}@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes floatUp{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}100%{opacity:0;transform:translateX(-50%) translateY(-110px) scale(1.6)}}@keyframes fadeSpot{0%,80%{opacity:1}100%{opacity:0;pointer-events:none}}@keyframes popIn{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}@keyframes correctPulse{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}"}</style>

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
              <div style={{ fontSize:"clamp(56px, 28vw, 67px)", marginBottom:12 }}>🔄</div>
              <h2 style={{ color:"#fbbf24", fontFamily:"'Fredoka One',cursive", fontSize:"clamp(24px, 16vw, 31px)", margin:"0 0 8px" }}>כבר שיחקתם את האתגר הזה!</h2>
              <p style={{ color:"#94a3b8", fontFamily:"'Varela Round',sans-serif", fontSize:"clamp(15px, 11vw, 20px)", margin:"0 0 20px" }}>
                רוצים לשפר את הציון? תקבלו שאלות חדשות והציון יתעדכן!
              </p>
              <button onClick={handleRetryChallenge} style={C.btnP}>🔥 שפרו את הציון!</button>
              <button onClick={() => handlePlay(blockedTopic)} style={C.btnS}>🎲 חידון חדש על {blockedTopic}</button>
              <button onClick={() => setScreen("home")} style={C.btnS}>🎮 בחרו נושא אחר</button>
            </div>
          )}
          {screen==="quiz"         && quizData && family && <QuizScreen quizData={quizData} members={family.members} onFinish={handleFinish} />}
          {screen==="share"        && <ShareScreen code={code} topic={topic} familyName={family?.name} pct={pct} onContinue={()=>setScreen("results")} />}
          {screen==="results"      && <ResultsScreen scores={scores} members={family?.members||[]} familyName={family?.name} topic={topic} code={code} creatorPct={creatorPct} onHome={()=>setScreen("home")} onSameTopic={handleSameTopic} onSetOnline={setSbOnline} onShare={()=>setScreen("share")} beatenBy={beatenBy} onRematch={handleRematch} />}
        </div>
      </div>

      <InstallBanner />
      {showPushModal && family && <PushModal familyName={family.name} onDone={function() { setShowPushModal(false); }} />}
    </>
  );
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
