import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) return new Response('CEREBRAS_API_KEY is not set', { status: 500 });
  const { messages } = await req.json();
  if (!Array.isArray(messages)) return new Response('messages required', { status: 400 });

  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.CEREBRAS_MODEL || 'zai-glm-4.7',
      messages,
      stream: true,
      max_tokens: 1024,
    }),
  });
  if (!r.ok) return new Response(await r.text(), { status: r.status });
  // pass the SSE stream straight through
  return new Response(r.body, { headers: { 'content-type': 'text/event-stream' } });
}
