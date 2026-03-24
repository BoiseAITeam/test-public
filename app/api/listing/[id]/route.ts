import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const adapterUrl = process.env.MCP_ADAPTER_BASE_URL;
  if (!adapterUrl) {
    return NextResponse.json({ error: 'MCP_ADAPTER_BASE_URL is not set' }, { status: 500 });
  }

  const res = await fetch(`${adapterUrl.replace(/\/$/, '')}/listing/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      ...(process.env.MCP_ADAPTER_API_KEY ? { 'x-api-key': process.env.MCP_ADAPTER_API_KEY } : {}),
    },
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
