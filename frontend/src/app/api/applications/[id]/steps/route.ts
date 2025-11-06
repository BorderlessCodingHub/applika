import { NextRequest, NextResponse } from "next/server";

// Optional type for ApplicationStep
export interface ApplicationStep {
  id: number;
  step_id: number;
  step_date: string;
  step_name?: string;
  observation?: string;
  created_at?: string;
  updated_at?: string;
}

// GET /applications/[id]/steps
export async function GET(req: NextRequest, context: any) {
  const applicationId = Array.isArray(context.params.applicationId)
    ? context.params.applicationId[0]
    : context.params.applicationId;

  try {
    const cookie = req.headers.get("cookie") || "";
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/applications/${applicationId}/steps`,
      {
        headers: { cookie },
      }
    );

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(
        { detail: error.detail || "Failed to fetch steps" },
        { status: res.status }
      );
    }

    const steps: ApplicationStep[] = await res.json();
    return NextResponse.json(steps);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

// POST /applications/[id]/steps
export async function POST(req: NextRequest, context: any) {
  const id = Array.isArray(context.params.id)
    ? context.params.id[0]
    : context.params.id;
  const cookie = req.headers.get("cookie") || "";
  const body = await req.json();

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/applications/${id}/steps`,
      {
        method: "POST",
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

// PUT /applications/[id]/steps/[stepId]
export async function PUT(req: NextRequest, context: any) {
  const applicationId = Array.isArray(context.params.applicationId)
    ? context.params.applicationId[0]
    : context.params.applicationId;
  const stepId = Array.isArray(context.params.stepId)
    ? context.params.stepId[0]
    : context.params.stepId;

  const cookie = req.headers.get("cookie") || "";
  const body = await req.json();

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/applications/${applicationId}/steps/${stepId}`,
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

// DELETE /applications/[id]/steps/[stepId]
export async function DELETE(req: NextRequest, context: any) {
  const applicationId = Array.isArray(context.params.applicationId)
    ? context.params.applicationId[0]
    : context.params.applicationId;
  const stepId = Array.isArray(context.params.stepId)
    ? context.params.stepId[0]
    : context.params.stepId;

  const cookie = req.headers.get("cookie") || "";

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/applications/${applicationId}/steps/${stepId}`,
      {
        method: "DELETE",
        headers: { cookie },
      }
    );

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(
        { detail: error.detail || "Failed to delete step" },
        { status: res.status }
      );
    }

    return NextResponse.json({}, { status: 204 });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
