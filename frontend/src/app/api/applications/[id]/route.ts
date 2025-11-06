import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, context: any) {
  const id = Array.isArray(context.params.id)
    ? context.params.id[0]
    : context.params.id;

  const cookie = req.headers.get("cookie") || "";
  const body = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/applications/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, context: any) {
  const id = Array.isArray(context.params.id)
    ? context.params.id[0]
    : context.params.id;

  const cookie = req.headers.get("cookie") || "";

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/applications/${id}`,
    {
      method: "DELETE",
      headers: { cookie },
    }
  );

  // no content returned by API → just respond with status
  if (res.status === 204) {
    return NextResponse.json(
      { message: "Application deleted successfully" },
      { status: 204 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
