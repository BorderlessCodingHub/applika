// app/api/conversion-rate/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") || "";

  const res = await fetch(`${API_BASE}/applications/statistics/steps/conversion_rate`, {
    headers: {
      cookie, // forward cookies for authentication
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
