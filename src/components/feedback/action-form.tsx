"use client";

import { ReactNode, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { idleActionResult, type ActionResult } from "@/lib/action-state";
import { useToast } from "@/components/feedback/toast-provider";

type ActionFormProps = {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  className?: string;
  resetOnSuccess?: boolean;
  children: ReactNode;
};

export function ActionForm({
  action,
  className,
  resetOnSuccess = false,
  children,
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, idleActionResult);
  const { pushToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const lastToastKeyRef = useRef<string>("");

  useEffect(() => {
    if (state.status === "idle" || !state.message) {
      return;
    }

    const toastKey = `${state.status}:${state.title ?? ""}:${state.message}`;
    if (lastToastKeyRef.current === toastKey) {
      return;
    }

    lastToastKeyRef.current = toastKey;
    pushToast({
      variant: state.status,
      title: state.title ?? "Update",
      message: state.message,
    });

    if (resetOnSuccess && state.status === "success") {
      formRef.current?.reset();
    }
  }, [pushToast, resetOnSuccess, state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
    </form>
  );
}

type ActionSubmitButtonProps = {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
};

export function ActionSubmitButton({
  idleLabel,
  pendingLabel,
  className = "primary-button",
}: ActionSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel ?? "Working..." : idleLabel}
    </button>
  );
}
