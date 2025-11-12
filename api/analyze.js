// api/analyze.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dataUrl, mimeType, fileName } = req.body || {};
  if (!dataUrl || !mimeType) {
    return res.status(400).json({ error: "Missing image" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY missing" });
  }

  const prompt = `
  Du bist ein KI-Detektor. Analysiere das Bild und gib eine JSON-Antwort:
  {
    "score": Zahl von 0 bis 100, // 0 = menschlich, 100 = KI-generiert
    "reasons": ["kurze Begründung 1", "kurze Begründung 2"]
  }
  Sei vorsichtig bei Schätzungen und antworte NUR im JSON-Format.
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
          { role: "system", content: "Du bewertest KI-Anteile in Bildern präzise." },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });

    const data = await openaiRes.json();

    const text = data?.choices?.[0]?.message?.content || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("Unerwartete Antwort:", text);
      return res.status(200).json({
        score: 50,
        reasons: ["Antwort konnte nicht analysiert werden."],
      });
    }

    const result = JSON.parse(match[0]);
    res.status(200).json(result);
  } catch (err) {
    console.error("Fehler bei Analyse:", err);
    res.status(500).json({ error: "Fehler bei API-Aufruf", details: err.message });
  }
}
