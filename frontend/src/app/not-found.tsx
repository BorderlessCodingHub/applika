"use client";

// Client: the message under it translates, and only the client provider can.
import { NotFoundMessage } from "@/components/layout/not-found-message";

export default function NotFound() {
  return (
    <div className="flex min-h-viewport items-center justify-center bg-muted">
      <NotFoundMessage />
    </div>
  );
}
