import { useState } from "react";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [topic, setTopic] = useState("");
  const family = { members: [{name: "אבא", age: 40}, {name: "ילד", age: 8}] };

  const handleStartQuiz = async () => {
    if (!topic) return alert("נא להזין נושא");
    setLoading(true);
    setQuizData(null);
    
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, members: family.members })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "שגיאת שרת");

      // פענוח הטקסט שהגיע מה-API
      let rawText = data.text.trim();
      // ניקוי סימני JSON אם ה-AI הוסיף אותם
      const cleanJson = rawText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      const questions = JSON.parse(cleanJson);
      
      setQuizData(questions);
    } catch (err) {
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", textAlign: "center", padding: 20, background: "#0f172a", color: "white", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <h1>🚀 חידון משפחתי</h1>
      
      <div style={{ marginBottom: 20 }}>
        <input 
          style={{ padding: 12, borderRadius: 8, width: "80%", maxWidth: 300, border: "none" }}
          placeholder="נושא (למשל: ירושלים)" 
          value={topic} 
          onChange={e => setTopic(e.target.value)} 
        />
        <button 
          onClick={handleStartQuiz}
          disabled={loading}
          style={{ display: "block", margin: "15px auto", padding: "12px 25px", background: "#7c3aed", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
        >
          {loading ? "מייצר חידון... 🧠" : "צור חידון!"}
        </button>
      </div>

      {quizData && (
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          {quizData.map((item, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.1)", padding: 15, borderRadius: 12, marginBottom: 15, textAlign: "right" }}>
              <div style={{ color: "#a78bfa", fontSize: 12 }}>שאלה ל{item.m}:</div>
              <p style={{ fontSize: 18, margin: "10px 0" }}>{item.q}</p>
              <div style={{ display: "grid", gap: 8 }}>
                {item.o.map((opt, idx) => (
                  <button key={idx} style={{ padding: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)", color: "white", borderRadius: 6, textAlign: "right" }}>
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