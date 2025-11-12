// api/analyze.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dataUrl, mimeType } = req.body || {};
  if (!dataUrl || !mimeType) {
    return res.status(400).json({ error: "Missing image" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY missing" });
  }

  const prompt = `
Du bist ein KI-Detektor. Analysiere das bereitgestellte Bild.
Bewerte, ob es wahrscheinlich von einer KI generiert wurde.
Gib ausschließlich eine gültige JSON-Antwort aus, ohne zusätzlichen Text, exakt in diesem Format:

{
  "score": 0-100, 
  "reasons": ["kurze Begründung 1", "kurze Begründung 2"]
}

- 0 = sehr menschlich
- 100 = sehr wahrscheinlich KI-generiert
`;

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Du bist ein strenger JSON-Rückgabe-Detektor für KI-generierte Bilder." },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    const data = await openaiRes.json();

    const text = data?.choices?.[0]?.message?.content || "";
    console.log("OpenAI Response:", text);

    // Versuch, direkt zu parsen
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
    }

    if (!result || typeof result.score === "undefined") {
      return res.status(200).json({
        score: 50,
        reasons: ["Antwort konnte nicht im JSON-Format gelesen werden."],
      });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("Fehler bei Analyse:", err);
    res.status(500).json({ error: "Fehler bei API-Aufruf", details: err.message });
  }
}
