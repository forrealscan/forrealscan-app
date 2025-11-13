// api/analyze.js

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
            content: "Gib ausschließlich JSON zurück."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Bewerte das Bild." },
              { type: "image_url", image_url: `data:image/jpeg;base64,${imageBase64}` }
            ]
          }
        ]
      })
    });

    const data = await openaiRes.json();
    const result = JSON.parse(data.choices[0].message.content);

    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
