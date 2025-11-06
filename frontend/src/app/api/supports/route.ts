// app/api/supports/route.ts
import { NextRequest, NextResponse } from "next/server";

export interface SupportDataStep {
  id: number;
  name: string;
  color: string;
  strict: boolean;
}

export interface SupportData {
  feedbacks: any[];
  steps: SupportDataStep[];
  platforms: any[];
}

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/supports`, {
      headers: { cookie },
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ detail: err.detail || "Failed to fetch supports" }, { status: res.status });
    }

    const data: SupportData = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || "Internal Server Error" }, { status: 500 });
  }
}
