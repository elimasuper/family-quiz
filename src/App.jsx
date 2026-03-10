import { useState, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://bqboyursgerrejqvmvhq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYm95dXJzZ2VycmVqcXZtdmhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTc0NDQsImV4cCI6MjA4ODYzMzQ0NH0.OPudQau6wVdUfKzLCMCxKG5F5VlYhCL_1Sfak0V1F8o";

// ─── AI LOGIC (תיקון השגיאה) ────────────────────────────────────────────────
const generateQuestions = async (topic, members) => {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, members }) // שליחה בפורמט שה-API החדש מצפה לו
    });

    if (!res.ok) {
      // אם השרת החזיר שגיאה, נבדוק מה הוא כתב שם
      const errorText = await res.text();
      console.error("שגיאת שרת:", errorText);
      throw new Error(`השרת החזיר שגיאה: ${res.status}. בדוק את ה-Logs ב-Vercel.`);
    }

    const data = await res.json();
    
    // שליפת הטקסט מהמבנה של Anthropic
    if (!data.content || !data.content[0]) {
      throw new Error("ה-AI לא החזיר תוכן תקין. ייתכן שנגמרו הטוקנים בחשבון?");
    }
    
    const rawContent = data.content[0].text;
    return smartParse(rawContent);
  } catch (err) {
    console.error("Fetch Error:", err);
    throw err;
  }
};

const smartParse = (str) => {
  if (!str) return [];
  // ניקוי תגיות קוד אם ה-AI הוסיף אותן
  let clean = str.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.warn("JSON נקטע, מנסה לתקן...");
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
// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [family, setFamily] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");

  const handleStartQuiz = async () => {
    if (!topic) return alert("אנא הזן נושא");
    setLoading(true);
    try {
      // שליחת רשימת השמות מהמשפחה
      const questions = await generateQuestions(topic, family.members);
      if (questions.length === 0) throw new Error("לא נוצרו שאלות");
      setQuizData(questions);
      setScreen("quiz");
    } catch (err) {
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "#fff", padding: 20, textAlign: "center" }}>
      {loading && <div style={{ marginTop: 50 }}>🧠 מייצר חידון מויקיפדיה (זה לוקח כמה שניות)...</div>}

      {!loading && screen === "welcome" && (
        <WelcomeScreen onDone={(f) => { setFamily(f); setScreen("home"); }} />
      )}

      {!loading && screen === "home" && (
        <div style={{ maxWidth: 400, margin: "0 auto" }}>
          <h2>שלום משפחת {family?.name}</h2>
          <input 
            style={inputStyle} 
            placeholder="נושא (למשל: הקיבוץ שלי, ירושלים, חלל)" 
            value={topic} 
            onChange={e => setTopic(e.target.value)} 
          />
          <button style={buttonStyle} onClick={handleStartQuiz}>התחל חידון חסכוני 💰</button>
        </div>
      )}

      {!loading && screen === "quiz" && quizData && (
        <QuizScreen quizData={quizData} onFinish={() => setScreen("home")} />
      )}
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
function WelcomeScreen({ onDone }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  
  const handleJoin = () => {
    // לצורך הבדיקה, ניצור אובייקט משפחה מקומי. 
    // במציאות זה יגיע מ-Supabase עם רשימת המשתתפים האמיתית.
    const mockFamily = { name, members: [{name: "אבא", age: 40}, {name: "ילד", age: 8}] };
    onDone(mockFamily);
  };

  return (
    <div style={{ maxWidth: 300, margin: "0 auto", padding: 20, background: "rgba(255,255,255,0.1)", borderRadius: 15 }}>
      <h3>כניסה למשחק</h3>
      <input style={inputStyle} placeholder="שם משפחה" value={name} onChange={e => setName(e.target.value)} />
      <input style={inputStyle} type="password" placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />
      <button style={buttonStyle} onClick={handleJoin}>כניסה</button>
    </div>
  );
}

function QuizScreen({ quizData, onFinish }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const q = quizData[currentIdx];

  const handleAnswer = (isCorrect) => {
    if (isCorrect) alert("נכון! 🎉");
    else alert("לא נורא... 😕");
    
    if (currentIdx + 1 < quizData.length) setCurrentIdx(currentIdx + 1);
    else {
      alert("החידון הסתיים!");
      onFinish();
    }
  };

  if (!q) return <div>אין שאלות להצגה</div>;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 20, background: "rgba(255,255,255,0.1)", borderRadius: 15 }}>
      <p style={{ color: "#a78bfa" }}>תור של: {q.m}</p>
      <h3>{q.q}</h3>
      <div style={{ display: "grid", gap: 10 }}>
        {q.o.map((opt, i) => (
          <button key={i} style={optionButtonStyle} onClick={() => handleAnswer(i === q.a)}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const inputStyle = { width: "100%", padding: 12, marginBottom: 10, borderRadius: 8, border: "none" };
const buttonStyle = { width: "100%", padding: 15, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" };
const optionButtonStyle = { padding: 12, background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, cursor: "pointer", textAlign: "right" };