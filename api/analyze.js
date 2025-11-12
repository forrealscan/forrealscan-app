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
Gib NUR eine gültige JSON-Antwort aus – KEINEN Text davor oder danach!

{
  "score": Zahl von 0 bis 100,
  "reasons": ["kurze Begründung 1", "kurze Begründung 2"]
}

- 0 = sehr menschlich
- 100 = sehr wahrscheinlich KI-generiert
Antworte immer exakt in diesem Format.
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
          {
            role: "system",
            content:
              "Du bist ein KI-Detektor, der IMMER nur gültiges JSON ohne zusätzlichen Text ausgibt.",
          },
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
        response_format: { type: "json_object" }, // 👉 erzwingt echtes JSON
      }),
    });

    const data = await openaiRes.json();

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.log("Keine Antwort von OpenAI:", data);
      return res.status(200).json({
        score: 50,
        reasons: ["Keine gültige Antwort von OpenAI erhalten."],
      });
    }

    const result = JSON.parse(content);
    res.status(200).json(result);
  } catch (err) {
    console.error("Fehler bei Analyse:", err);
    res.status(500).json({
      error: "Fehler bei API-Aufruf",
      details: err.message,
    });
  }
}
