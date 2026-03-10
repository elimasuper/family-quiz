import { useState } from "react";

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
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [error, setError] = useState(null);

  const family = { name: "מייסון", members: [{name: "אבא", age: 40}, {name: "אמא", age: 38}, {name: "ילד", age: 8}] };

  const startQuiz = async (selectedTopic) => {
    const finalTopic = selectedTopic || topic;
    if (!finalTopic) return alert("נא להזין נושא");
    
    setLoading(true);
    setError(null);
    setQuizData(null);

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: finalTopic, members: family.members })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאת תקשורת");

      const questions = smartParse(data.quizText);
      if (questions.length === 0) throw new Error("ה-AI לא הצליח לייצר שאלות");

      setQuizData(questions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "white", padding: "20px", fontFamily: "sans-serif" }}>
      
      {/* באנר שגיאה שניתן לסגור */}
      {error && (
        <div style={{ background: "#ef4444", padding: "10px", borderRadius: "10px", marginBottom: "15px", textAlign: "center", position: "relative" }}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={{ position: "absolute", left: "10px", background: "none", border: "none", color: "white", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Header המקורי שלך */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "30px" }}>
        <div style={{ background: "rgba(255,255,255,0.05)", padding: "10px 20px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span>🦊</span>
          <span>שלום משפחת {family.name}!</span>
        </div>
      </div>

      <div style={{ maxWidth: "500px", margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", marginBottom: "20px" }}>מחולל חידונים 🚀</h2>
        
        {/* תיבת הקלדה - וודא שהיא לא disabled כשלא צריך */}
        <div style={{ background: "rgba(255,255,255,0.05)", padding: "20px", borderRadius: "15px", marginBottom: "20px" }}>
          <input 
            style={{ width: "100%", padding: "15px", borderRadius: "10px", border: "none", background: "#1e293b", color: "white", fontSize: "16px", boxSizing: "border-box" }}
            placeholder="דינוזאורים, חלל, ירושלים..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button 
            onClick={() => startQuiz()}
            disabled={loading}
            style={{ width: "100%", marginTop: "15px", padding: "15px", background: "#7c3aed", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "bold" }}
          >
            {loading ? "מייצר..." : "צור חידון! 🚀"}
          </button>
        </div>

        {/* כפתורי נושאים מהירים */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "30px" }}>
          {["חיות", "חלל", "מדע", "דינוזאורים", "קיבוץ", "ספורט"].map(t => (
            <button key={t} onClick={() => startQuiz(t)} style={{ padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "white", cursor: "pointer" }}>{t}</button>
          ))}
        </div>

        {/* הצגת השאלות */}
        {quizData && (
          <div>
            {quizData.map((item, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.05)", padding: "20px", borderRadius: "15px", marginBottom: "15px", textAlign: "right" }}>
                <div style={{ fontSize: "12px", color: "#a78bfa" }}>שאלה ל{item.m}:</div>
                <p style={{ fontSize: "18px", margin: "10px 0" }}>{item.q}</p>
                <div style={{ display: "grid", gap: "10px" }}>
                  {item.o.map((opt, idx) => (
                    <button key={idx} style={{ padding: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "white", borderRadius: "8px", textAlign: "right" }}>{opt}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}