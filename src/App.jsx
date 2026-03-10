import { useState } from "react";

// --- פונקציית פענוח JSON חכמה ---
const smartParse = (str) => {
  if (!str) return [];
  let clean = str.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  try { return JSON.parse(clean); } catch (e) {
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

export default function App() {
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [quizData, setQuizData] = useState(null);
  const [screen, setScreen] = useState("home"); // home | quiz

  // נתוני המשפחה שלך (כפי שראיתי בצילום מסך)
  const family = { name: "מייסון", members: [{name: "אבא", age: 40}, {name: "אמא", age: 38}, {name: "ילד", age: 8}] };

  const handleStartQuiz = async (selectedTopic) => {
    const finalTopic = selectedTopic || topic;
    if (!finalTopic) return alert("נא לבחור או להזין נושא");
    
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: finalTopic, members: family.members })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאת שרת");

      // שליפת הטקסט מהמבנה החדש של ה-API
      const questions = smartParse(data.text);
      if (questions.length === 0) throw new Error("ה-AI לא הצליח לייצר שאלות");

      setQuizData(questions);
      setScreen("quiz");
    } catch (err) {
      console.error(err);
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "white", fontFamily: "sans-serif", padding: "20px" }}>
      
      {/* כותרת עליונה */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div style={{ background: "rgba(255,255,255,0.1)", padding: "10px 20px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span>🦊</span>
          <span>שלום משפחת {family.name}!</span>
        </div>
      </div>

      {screen === "home" && (
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>מייצר החידונים 🚀</h2>
          
          {/* שדה הזנת טקסט - כאן תוכל להקליד חופשי */}
          <div style={{ background: "rgba(255,255,255,0.05)", padding: "20px", borderRadius: "15px", marginBottom: "20px" }}>
            <input 
              style={{ width: "100%", padding: "15px", borderRadius: "10px", border: "none", background: "#1e293b", color: "white", fontSize: "16px", outline: "none", boxSizing: "border-box" }}
              placeholder="לדוגמה: דינוזאורים, חלל, קיבוץ בארי..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
            />
            <button 
              onClick={() => handleStartQuiz()}
              disabled={loading}
              style={{ width: "100%", marginTop: "15px", padding: "15px", background: "#7c3aed", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "18px" }}
            >
              {loading ? "מייצר שאלות... 🧠" : "צור חידון! 🚀"}
            </button>
          </div>

          {/* כפתורי נושאים מהירים (כפי שהיה לך) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            {["חלל", "חיות", "מדע", "היסטוריה", "ספורט", "סרטים"].map(t => (
              <button 
                key={t} 
                onClick={() => handleStartQuiz(t)}
                disabled={loading}
                style={{ padding: "15px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "white", cursor: "pointer" }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "quiz" && quizData && (
        <div style={{ maxWidth: "500px", margin: "0 auto", textAlign: "center" }}>
          <button onClick={() => setScreen("home")} style={{ float: "left", background: "none", border: "none", color: "#a78bfa", cursor: "pointer" }}>➔ חזרה</button>
          <h3 style={{ color: "#a78bfa" }}>החידון מוכן!</h3>
          {quizData.map((q, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.05)", padding: "20px", borderRadius: "15px", marginBottom: "15px", textAlign: "right" }}>
              <div style={{ fontSize: "12px", color: "#a78bfa" }}>שאלה ל{q.m}:</div>
              <p style={{ fontSize: "18px", margin: "10px 0" }}>{q.q}</p>
              <div style={{ display: "grid", gap: "10px" }}>
                {q.o.map((opt, idx) => (
                  <div key={idx} style={{ padding: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>{opt}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}