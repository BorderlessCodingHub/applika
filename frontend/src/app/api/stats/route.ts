// app/api/stats/route.ts (Next.js 13+)
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") || "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/applications/statistics`, {
    headers: { cookie },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
