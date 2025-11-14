// api/analyze_v3.js (Image Detect Premium Version)
export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key missing" }), { status: 500 });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/images/detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image: imageBase64,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return new Response(JSON.stringify({ error: "Image Detect error", details: errText }), { status: 500 });
    }

    const data = await openaiRes.json();

    const score = data?.score ?? 50;
    const reasons = data?.reasons ?? ["Keine detaillierten Gründe verfügbar"];

    return new Response(JSON.stringify({ score, reasons }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: err?.message || String(err) }), {
      status: 500,
    });
  }
}
