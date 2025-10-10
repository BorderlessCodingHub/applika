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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cookie = req.headers.get("cookie") || "";
  const body = await req.json();
  const res = await fetch(`http://localhost:8000/applications/${params.id}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { applicationId: string; stepId: string } }
) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const body = await req.json();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/applications/${params.applicationId}/steps/${params.stepId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}