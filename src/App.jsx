import { useState } from "react";

// פונקציית עזר לפענוח ה-JSON של השאלות
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
  const [quizData, setQuizData] = useState(null);
  const [topic, setTopic] = useState("");
  const family = { members: [{name: "אבא", age: 40}, {name: "ילד", age: 8}] }; // דוגמה

  const handleStartQuiz = async () => {
    if (!topic) return alert("נא להזין נושא");
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, members: family.members })
      });

      const data = await res.json();

      // הגנה: בדיקה אם השרת החזיר שגיאה
      if (!res.ok) {
        throw new Error(data.error || `שגיאת שרת: ${res.status}`);
      }

      // הגנה: בדיקה אם המבנה של קלוד תקין
      if (!data.content || !data.content[0]) {
        throw new Error("ה-AI החזיר תשובה ריקה");
      }

      const questions = smartParse(data.content[0].text);
      setQuizData(questions);
    } catch (err) {
      console.error(err);
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ direction: "rtl", textAlign: "center", padding: 20, background: "#0f172a", color: "white", minHeight: "100vh" }}>
      <h1>חידון משפחתי 🚀</h1>
      <input 
        style={{ padding: 10, borderRadius: 8, width: "80%", maxWidth: 300 }}
        placeholder="על מה נשחק היום?" 
        value={topic} 
        onChange={e => setTopic(e.target.value)} 
      />
      <button 
        onClick={handleStartQuiz}
        style={{ display: "block", margin: "10px auto", padding: "10px 20px", background: "#7c3aed", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
      >
        {loading ? "מייצר..." : "צור חידון"}
      </button>

      {quizData && (
        <div style={{ marginTop: 20 }}>
          {quizData.map((q, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.1)", padding: 15, borderRadius: 12, marginBottom: 10 }}>
              <p><strong>{q.m}:</strong> {q.q}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}