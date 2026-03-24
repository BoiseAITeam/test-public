import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const payload = await request.json();

  const adapterUrl = process.env.MCP_ADAPTER_BASE_URL;
  if (!adapterUrl) {
    return NextResponse.json({ error: 'MCP_ADAPTER_BASE_URL is not set' }, { status: 500 });
  }

  const res = await fetch(`${adapterUrl.replace(/\/$/, '')}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.MCP_ADAPTER_API_KEY ? { 'x-api-key': process.env.MCP_ADAPTER_API_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
