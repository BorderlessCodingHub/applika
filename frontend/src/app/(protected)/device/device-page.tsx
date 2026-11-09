"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useLocale } from "next-intl";

import {
  DeviceCodeForm,
  type DeviceCodeFormProps,
} from "@/components/device/device-code-form";
import {
  DeviceOutcome,
  type DeviceOutcomeProps,
} from "@/components/device/device-outcome";
import {
  DeviceRequestCard,
  type DeviceRequestCardProps,
} from "@/components/device/device-request-card";
import {
  normalizeUserCode,
  type DeviceOutcomeKind,
} from "@/components/device/device-sign-in-copy";
import { DeviceSignInLayout } from "@/components/device/device-sign-in-layout";
import {
  PhoneDeviceCode,
  PhoneDeviceOutcome,
  PhoneDeviceRequest,
} from "@/components/phone/screens/device-screen";
import { useIsPhone } from "@/hooks/use-is-phone";
import { word } from "@/i18n/translator";
import { apiErrorMessage } from "@/lib/api-error-message";
import { services } from "@/services/services";
import type { DeviceCodeInfo } from "@/services/types/auth";

/**
 * The error's words by code (404 AUTH-1040 "Code not found or expired", 409
 * AUTH-1041 "Code already used", a 429/503 retry text), else its `detail`;
 * a fixed sentence (`device.errorFallback`) when the body carries neither (a
 * network error, a 5xx page). All in the active language.
 */
export function deviceErrorText(error: unknown): string {
  const fallback = word("device.errorFallback");
  if (!(error instanceof AxiosError)) return fallback;
  return apiErrorMessage(error.response?.data, fallback);
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
  // Subscribes: `deviceErrorText` runs during render and reads the active
  // language, so a switch re-renders the error in the new one.
  useLocale();
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

  // Below md the v2/DeviceSignIn views take the same props as today's.
  const isPhone = useIsPhone();
  let content: ReactNode;
  if (step.kind === "code") {
    const props: DeviceCodeFormProps = {
      code,
      onCodeChange: (next) => {
        verify.reset();
        setCode(next);
      },
      onSubmit: (userCode) => verify.mutate(userCode),
      pending: verify.isPending,
      error: verify.isError ? deviceErrorText(verify.error) : null,
      autoFocus: true,
    };
    content = isPhone ? (
      <PhoneDeviceCode {...props} />
    ) : (
      <DeviceCodeForm {...props} />
    );
  } else if (step.kind === "request") {
    const props: DeviceRequestCardProps = {
      request: step.request,
      userCode: step.userCode,
      onApprove: () =>
        decide.mutate({ userCode: step.userCode, outcome: "approved" }),
      onDeny: () =>
        decide.mutate({ userCode: step.userCode, outcome: "denied" }),
      pending: decide.isPending
        ? decide.variables?.outcome === "approved"
          ? "approve"
          : "deny"
        : null,
      error: decide.isError ? deviceErrorText(decide.error) : null,
      onUseDifferentCode: startOver,
    };
    content = isPhone ? (
      <PhoneDeviceRequest {...props} />
    ) : (
      <DeviceRequestCard {...props} />
    );
  } else {
    const props: DeviceOutcomeProps = {
      outcome: step.outcome,
      onStartOver: startOver,
    };
    content = isPhone ? (
      <PhoneDeviceOutcome {...props} />
    ) : (
      <DeviceOutcome {...props} />
    );
  }

  return isPhone ? content : <DeviceSignInLayout>{content}</DeviceSignInLayout>;
}
