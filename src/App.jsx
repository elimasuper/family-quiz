import { useState, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://bqboyursgerrejqvmvhq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYm95dXJzZ2VycmVqcXZtdmhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTc0NDQsImV4cCI6MjA4ODYzMzQ0NH0.OPudQau6wVdUfKzLCMCxKG5F5VlYhCL_1Sfak0V1F8o";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const smartParse = (str) => {
  if (!str) return [];
  let clean = str.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(clean);
  } catch (e) {
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace !== -1) {
      let repaired = clean.substring(0, lastBrace + 1);
      if (!repaired.endsWith(']')) repaired += ']';
      if (!repaired.startsWith('[')) repaired = '[' + repaired;
      try { return JSON.parse(repaired); } catch (e2) { return []; }
    }
    return [];
  }
};

const C = {
  card: { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 22, padding: "24px", textAlign: "center", maxWidth: 450, margin: "20px auto" },
  btnP: { width: "100%", padding: "16px", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", borderRadius: 18, color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 20, cursor: "pointer", boxShadow: "0 4px 20px rgba(124,58,237,0.3)", marginTop: 15 },
  inp: { width: "100%", background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px", color: "#fff", fontSize: 16, marginBottom: 12, outline: "none", boxSizing: "border-box" }
};

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [family, setFamily] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");

  const handleStartQuiz = async () => {
    if (!topic) return alert("אנא הזן נושא");
    if (!family) return alert("שגיאה: משפחה לא הוגדרה");

    setLoading(true);
    try {
      console.log("🚀 פונה לשרת עבור נושא:", topic);
      
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          topic, 
          members: family.members || [{name: "אבא", age: 40}, {name: "ילד", age: 8}]
        })
      });

      const rawText = await res.text();
      
      if (!res.ok) {
        console.error("❌ שגיאת שרת:", rawText);
        if (res.status === 504) throw new Error("השרת איטי מדי (Timeout). נסו נושא פחות מורכב.");
        throw new Error(`שגיאת שרת (${res.status}). בדוק את ה-Logs ב-Vercel.`);
      }

      const data = JSON.parse(rawText);
      const questions = smartParse(data.content[0].text);
      
      if (questions.length === 0) throw new Error("ה-AI לא הצליח לייצר שאלות תקינות.");
      
      setQuizData(questions);
      setScreen("quiz");
    } catch (err) {
      console.error("📋 פרטי השגיאה:", err);
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "#fff", padding: 20, fontFamily: "'Varela Round', sans-serif" }}>
      {loading ? (
        <div style={{ textAlign: "center", marginTop: 100 }}>
          <div style={{ fontSize: 60 }}>🧠</div>
          <h2 style={{ fontFamily: "'Fredoka One', cursive" }}>יוצר חידון מויקיפדיה...</h2>
          <p>זה לוקח כ-10 שניות, אנחנו בודקים את העובדות.</p>
        </div>
      ) : screen === "welcome" ? (
        <div style={C.card}>
          <h1 style={{ fontFamily: "'Fredoka One', cursive", color: "#a78bfa" }}>Family Quiz</h1>
          <input 
            style={C.inp} 
            placeholder="שם משפחה" 
            onChange={e => setFamily({name: e.target.value, members: [{name: "אבא", age: 40}, {name: "ילד", age: 8}]})} 
          />
          <button style={C.btnP} onClick={() => setScreen("home")}>כניסה</button>
        </div>
      ) : screen === "home" ? (
        <div style={C.card}>
          <h2>שלום משפחת {family?.name}!</h2>
          <p>על מה נשחק היום?</p>
          <input 
            style={C.inp} 
            placeholder="למשל: ירושלים, קיבוץ בארי, חלל..." 
            value={topic} 
            onChange={e => setTopic(e.target.value)} 
          />
          <button style={C.btnP} onClick={handleStartQuiz}>התחל חידון חסכוני 💰</button>
        </div>
      ) : (
        <QuizScreen quizData={quizData} onFinish={() => setScreen("home")} />
      )}
    </div>
  );
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function QuizScreen({ quizData, onFinish }) {
  const [idx, setIdx] = useState(0);
  const q = quizData[idx];

  const handleChoice = (isCorrect) => {
    if (isCorrect) alert("נכון מאוד! 🌟");
    else alert("לא נורא, לומדים משהו חדש... 📚");

    if (idx + 1 < quizData.length) setIdx(idx + 1);
    else {
      alert("סיימתם את החידון!");
      onFinish();
    }
  };

  if (!q) return null;

  return (
    <div style={C.card}>
      <div style={{ color: "#a78bfa", fontWeight: "bold", marginBottom: 10 }}>השאלה של {q.m}:</div>
      <h2 style={{ fontSize: 24, marginBottom: 20 }}>{q.q}</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {q.o.map((option, i) => (
          <button 
            key={i} 
            onClick={() => handleChoice(i === q.a)}
            style={{ padding: "14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "#fff", cursor: "pointer", textAlign: "right", fontSize: 16 }}
          >
            {option}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 20, fontSize: 14, color: "#64748b" }}>שאלה {idx + 1} מתוך {quizData.length}</div>
    </div>
  );
}