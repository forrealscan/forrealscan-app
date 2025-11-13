export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Analysiere dieses Bild auf KI-Erzeugung. Gib ausschließlich gültiges JSON zurück: {\"score\":0-100,\"reasons\":[...]}." },
              { type: "input_image", image_url: `data:image/jpeg;base64,${imageBase64}` }
            ]
          }
        ],
        response_format: { type: "json_object" },
      }),
    });

    const data = await openaiRes.json();

    // Wichtiger Teil: korrekter Zugriff auf neue OpenAI API
    const content = data?.output?.[0]?.content?.[0]?.text;

    if (!content) {
      console.log("Ungültige OpenAI-Antwort:", data);
      return res.status(200).json({
        score: 50,
        reasons: ["OpenAI hat kein gültiges JSON zurückgegeben."],
      });
    }

    const result = JSON.parse(content);
    return res.status(200).json(result);

  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({
      error: "Interner Fehler",
      details: err.message,
    });
  }
}
