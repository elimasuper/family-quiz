import { useState } from "react";

// --- עוזר פענוח JSON ---
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
  const [error, setError] = useState(null);

  // נתוני המשפחה שלך
  const family = { name: "מייסון", members: [{name: "אבא", age: 40}, {name: "ילד", age: 8}] };

  const handleStartQuiz = async (quickTopic) => {
    const finalTopic = quickTopic || topic;
    if (!finalTopic) return alert("נא להזין נושא");
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: finalTopic, members: family.members })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "שגיאת שרת");
      }

      const data = await res.json();
      const questions = smartParse(data.text);
      
      if (questions.length === 0) throw new Error("לא הצלחנו לייצר שאלות. נסו שוב.");

      setQuizData(questions);
      setScreen("quiz");
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "white", fontFamily: "sans-serif", padding: "20px" }}>
      
      {/* באנר שגיאה (אם יש) */}
      {error && (
        <div style={{ background: "#ef4444", padding: "10px", borderRadius: "8px", marginBottom: "15px", textAlign: "center", position: "relative" }}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={{ position: "absolute", left: "10px", background: "none", border: "none", color: "white", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Header - שלום משפחת... */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div style={{ background: "rgba(255,255,255,0.05)", padding: "10px 20px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span>🦊</span>
          <span>שלום משפחת {family.name}!</span>
        </div>
      </div>

      {screen === "home" && (
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>מחולל חידונים 🚀</h2>
          
          {/* שדה הזנה - הקפדתי שיהיה פתוח ונגיש */}
          <div style={{ background: "rgba(255,255,255,0.05)", padding: "20px", borderRadius: "15px", marginBottom: "20px" }}>
            <input 
              style={{ width: "100%", padding: "15px", borderRadius: "10px", border: "none", background: "#1e293b", color: "white", fontSize: "16px", outline: "none", boxSizing: "border-box" }}
              placeholder="לדוגמה: דינוזאורים, חלל, ירושלים..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button 
              onClick={() => handleStartQuiz()}
              disabled={loading}
              style={{ width: "100%", marginTop: "15px", padding: "15px", background: loading ? "#4b5563" : "#7c3aed", color: "white", border: "none", borderRadius: "10px", cursor: loading ? "default" : "pointer", fontWeight: "bold", fontSize: "18px" }}
            >
              {loading ? "מייצר... 🧠" : "צור חידון! 🚀"}
            </button>
          </div>

          {/* כפתורי נושא מהירים */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            {["חיות", "חלל", "מדע", "דינוזאורים", "קיבוץ", "ספורט"].map(t => (
              <button 
                key={t} 
                onClick={() => handleStartQuiz(t)}
                disabled={loading}
                style={{ padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "white", cursor: "pointer" }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "quiz" && quizData && (
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <button onClick={() => setScreen("home")} style={{ color: "#a78bfa", background: "none", border: "none", cursor: "pointer", marginBottom: "15px" }}>➔ חזרה לתפריט</button>
          {quizData.map((item, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.05)", padding: "20px", borderRadius: "15px", marginBottom: "15px", textAlign: "right" }}>
              <div style={{ fontSize: "12px", color: "#a78bfa" }}>שאלה ל{item.m}:</div>
              <p style={{ fontSize: "18px", margin: "10px 0" }}>{item.q}</p>
              <div style={{ display: "grid", gap: "8px" }}>
                {item.o.map((opt, idx) => (
                  <button key={idx} style={{ padding: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white", borderRadius: "8px", textAlign: "right", cursor: "pointer" }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}