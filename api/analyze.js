export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Du bist ein KI-Detektor. Gib ausschließlich gültiges JSON aus."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Bewerte dieses Bild. Gib JSON zurück mit score (0–100) und reasons."
              },
              {
                type: "image_url",
                image_url: `data:image/jpeg;base64,${imageBase64}`
              }
            ]
          }
        ]
      })
    });

    const data = await openaiRes.json();

    if (!data.choices || !data.choices[0]) {
      return res.status(200).json({
        score: 50,
        reasons: ["Ungültige Antwort von OpenAI."]
      });
    }

    const content = data.choices[0].message.content;
    const result = JSON.parse(content);

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({
      error: "Serverfehler bei der Analyse",
      details: err.message
    });
  }
}
