// app/api/stats/route.ts (Next.js 13+)
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie"); // get all cookies
  const res = await fetch("http://localhost:8000/applications/statistics", {
    headers: {
      cookie: cookie || "",
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
