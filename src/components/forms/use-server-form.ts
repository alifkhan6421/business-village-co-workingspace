"use client";
import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action-result";

/**
 * Submits a form to a server action without React's automatic form reset,
 * so users keep their input when validation fails.
 */
export function useServerForm<T>(action: (prev: unknown, fd: FormData) => Promise<ActionResult<T>>) {
  const [state, setState] = useState<ActionResult<T> | null>(null);
  const [pending, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        setState(await action(null, fd));
      } catch {
        setState({ ok: false, error: "unknown" });
      }
    });
  };
  return { state, pending, onSubmit, setState };
}
