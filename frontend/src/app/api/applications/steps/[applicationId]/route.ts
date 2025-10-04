import { NextRequest, NextResponse } from "next/server";

// Optional: type for the ApplicationStep
export interface ApplicationStep {
  id: number;
  step_id: number;
  step_date: string;
  step_name?: string;
  observation?: string;
  created_at?: string;
  updated_at?: string;
}

export async function GET(req: NextRequest, { params }: { params: { applicationId: string } }) {
  try {
    const cookie = req.headers.get("cookie") || "";

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/applications/${params.applicationId}/steps`,
      {
        headers: {
          cookie,
        },  
      }
    );

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json({ detail: error.detail || "Failed to fetch steps" }, { status: res.status });
    }

    const steps: ApplicationStep[] = await res.json();
    return NextResponse.json(steps);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || "Internal Server Error" }, { status: 500 });
  }
}
