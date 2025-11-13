export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
      });
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
      });
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
            content: "Du bist ein KI-Detektor. Gib ausschließlich JSON zurück."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Bewerte dieses Bild. Gib JSON mit score und reasons zurück."
              },
              {
                type: "image_url",
                image_url: `data:image/jpeg;base64,${imageBase64}`
              }
            ]
          }
        ]
      }),
    });

    const data = await openaiRes.json();

    console.log("OPENAI RESPONSE:", data);

    if (!data?.choices?.[0]?.message?.content) {
      return new Response(
        JSON.stringify({
          score: 50,
          reasons: ["Ungültige Antwort von OpenAI."],
        }),
        { status: 200 }
      );
    }

    const json = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(json), { status: 200 });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Fehler bei API-Aufruf",
        details: err.message,
      }),
      { status: 500 }
    );
  }
}
