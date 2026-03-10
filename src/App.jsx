import { useState } from "react";

// פונקציית עזר לפענוח JSON
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
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [quizData, setQuizData] = useState(null);
  const [family] = useState({ name: "מייסון", members: [{name: "אבא", age: 40}, {name: "ילד", age: 8}] });

  const handleStartQuiz = async () => {
    if (!topic) return alert("אנא הזן נושא");
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, members: family.members })
      });

      if (res.status === 404) {
        throw new Error("השרת (API) לא נמצא! ודא שקובץ api/claude.js עלה לגיטהאב.");
      }

      const data = await res.json();
      const questions = smartParse(data.content[0].text);
      
      setQuizData(questions);
      setScreen("quiz");
    } catch (err) {
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", color: "white", marginTop: 50 }}>🧠 יוצר חידון...</div>;

  return (
    <div style={{ direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "white", padding: 20 }}>
      {screen === "home" ? (
        <div style={{ textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
          <h1>שלום משפחת {family.name}!</h1>
          <input 
            style={{ width: "100%", padding: 10, borderRadius: 8, marginBottom: 10 }}
            placeholder="נושא (למשל: חלל)" 
            value={topic} 
            onChange={e => setTopic(e.target.value)} 
          />
          <button 
            style={{ width: "100%", padding: 15, background: "#7c3aed", border: "none", borderRadius: 8, color: "white", cursor: "pointer" }}
            onClick={handleStartQuiz}
          >
            צור חידון! 🚀
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <h2>החידון מוכן!</h2>
          {quizData?.map((q, i) => <p key={i}>{q.q}</p>)}
          <button onClick={() => setScreen("home")}>חזור</button>
        </div>
      )}
    </div>
  );
}