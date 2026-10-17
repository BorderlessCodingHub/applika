"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { DeviceCodeForm } from "@/components/device/device-code-form";
import { DeviceOutcome } from "@/components/device/device-outcome";
import { DeviceRequestCard } from "@/components/device/device-request-card";
import {
  normalizeUserCode,
  type DeviceOutcomeKind,
} from "@/components/device/device-sign-in-copy";
import { DeviceSignInLayout } from "@/components/device/device-sign-in-layout";
import { services } from "@/services/services";
import type { DeviceCodeInfo } from "@/services/types/auth";

export const DEVICE_ERROR_FALLBACK = "Something went wrong. Try again.";

/**
 * The server's own `detail` (404 "Code not found or expired", 409 "Code
 * already used", a 429/503 retry text), verbatim; a fixed sentence when the
 * body carries no string (a network error, a 5xx page).
 */
export function deviceErrorText(error: unknown): string {
  if (error instanceof AxiosError) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)
      ?.detail;
    if (typeof detail === "string" && detail) return detail;
  }
  return DEVICE_ERROR_FALLBACK;
}

type Step =
  | { kind: "code" }
  | { kind: "request"; userCode: string; request: DeviceCodeInfo }
  | { kind: "outcome"; outcome: DeviceOutcomeKind };

/**
 * Device sign-in approval (KODI-058, ADR-0019, R-017): enter or confirm the
 * code, see which device asks (name, client, IP, time), approve or deny.
 */
export function DevicePage() {
  const searchParams = useSearchParams();
  // Prefilled once from `?code=`; the user still presses Continue.
  const [code, setCode] = useState(() =>
    normalizeUserCode(searchParams.get("code") ?? ""),
  );
  const [step, setStep] = useState<Step>({ kind: "code" });

  const verify = useMutation({
    mutationFn: (userCode: string) => services.auth.verifyDeviceCode(userCode),
    onSuccess: (request, userCode) =>
      setStep({ kind: "request", userCode, request }),
  });

  const decide = useMutation({
    mutationFn: ({
      userCode,
      outcome,
    }: {
      userCode: string;
      outcome: DeviceOutcomeKind;
    }) =>
      outcome === "approved"
        ? services.auth.approveDeviceCode(userCode)
        : services.auth.denyDeviceCode(userCode),
    onSuccess: (_data, { outcome }) => setStep({ kind: "outcome", outcome }),
  });

  const startOver = () => {
    verify.reset();
    decide.reset();
    setCode("");
    setStep({ kind: "code" });
  };

  return (
    <DeviceSignInLayout>
      {step.kind === "code" ? (
        <DeviceCodeForm
          code={code}
          onCodeChange={(next) => {
            verify.reset();
            setCode(next);
          }}
          onSubmit={(userCode) => verify.mutate(userCode)}
          pending={verify.isPending}
          error={verify.isError ? deviceErrorText(verify.error) : null}
          autoFocus
        />
      ) : step.kind === "request" ? (
        <DeviceRequestCard
          request={step.request}
          userCode={step.userCode}
          onApprove={() =>
            decide.mutate({ userCode: step.userCode, outcome: "approved" })
          }
          onDeny={() =>
            decide.mutate({ userCode: step.userCode, outcome: "denied" })
          }
          pending={
            decide.isPending
              ? decide.variables?.outcome === "approved"
                ? "approve"
                : "deny"
              : null
          }
          error={decide.isError ? deviceErrorText(decide.error) : null}
          onUseDifferentCode={startOver}
        />
      ) : (
        <DeviceOutcome outcome={step.outcome} onStartOver={startOver} />
      )}
    </DeviceSignInLayout>
  );
}
