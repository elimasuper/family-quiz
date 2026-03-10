import { useState } from "react";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [quiz, setQuiz] = useState(null);

  const start = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, members: ["אבא", "ילד"] })
      });

      // בדיקה אם השרת בכלל שלח JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("השרת לא שלח JSON! התשובה הייתה:", text);
        throw new Error("השרת שלח דף שגיאה במקום נתונים. כנראה Timeout של 10 שניות.");
      }

      const data = await res.json();
      const raw = data.content[0].text;
      setQuiz(JSON.parse(raw));
    } catch (err) {
      alert("שגיאה: " + err.message + "\nבדוק את ה-Console (F12) לפרטים.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#0f172a", color: "#fff", minHeight: "100vh", padding: 40, textAlign: "center", direction: "rtl" }}>
      <h1>בדיקת חידון חסכוני 💰</h1>
      <input 
        style={{ padding: 10, borderRadius: 8, width: 250 }}
        placeholder="נושא (למשל: חלל)" 
        value={topic} 
        onChange={e => setTopic(e.target.value)} 
      />
      <button onClick={start} style={{ padding: "10px 20px", margin: 10, cursor: "pointer" }}>
        {loading ? "טוען..." : "ייצר 3 שאלות לבדיקה"}
      </button>

      {quiz && (
        <div style={{ marginTop: 20, textAlign: "right", background: "#1e293b", padding: 20, borderRadius: 12 }}>
          {quiz.map((q, i) => (
            <div key={i} style={{ marginBottom: 15 }}>
              <p><strong>{q.m}:</strong> {q.q}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}