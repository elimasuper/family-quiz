const handleStartQuiz = async () => {
    if (!topic) return alert("אנא הזן נושא");
    if (!family || !family.members) return alert("שגיאה: לא נמצאו נתוני משפחה");

    setLoading(true);
    try {
      console.log("🚀 שולח בקשה לשרת עבור נושא:", topic);
      
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          topic, 
          members: family.members 
        })
      });

      // קריאת התגובה כטקסט גולמי כדי למנוע קריסה של JSON.parse אם השרת מחזיר שגיאת HTML
      const rawText = await res.text();
      
      if (!res.ok) {
        console.error("❌ שגיאת שרת (סטטוס " + res.status + "):", rawText);
        
        // זיהוי ספציפי של Timeout (נפוץ מאוד ב-Vercel)
        if (res.status === 504 || rawText.includes("504") || rawText.includes("TIMEOUT")) {
          throw new Error("השרת איטי מדי (Timeout). נסו נושא ספציפי יותר או פחות משתתפים.");
        }
        
        throw new Error(`שגיאת שרת: ${res.status}. בדוק את ה-Logs ב-Vercel.`);
      }

      // פענוח ה-JSON של המעטפת (התשובה מ-Claude)
      const data = JSON.parse(rawText);
      
      if (!data.content || !data.content[0] || !data.content[0].text) {
        console.error("מבנה נתונים לא תקין מה-API:", data);
        throw new Error("ה-AI החזיר תשובה בפורמט לא צפוי.");
      }

      // שליפת תוכן החידון ופענוח ה-JSON הפנימי (המפתחות q, o, a, m)
      const questions = smartParse(data.content[0].text);
      
      if (!questions || questions.length === 0) {
        throw new Error("לא הצלחנו לייצר שאלות תקינות. נסו שוב עם נושא אחר.");
      }

      console.log("✅ החידון מוכן עם " + questions.length + " שאלות.");
      setQuizData(questions);
      setScreen("quiz");

    } catch (err) {
      console.error("📋 פרטי השגיאה המלאים:", err);
      alert("שגיאה: " + err.message);
    } finally {
      setLoading(false);
    }
  };