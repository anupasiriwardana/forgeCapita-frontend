import { toast as sonner } from "sonner";
import { ApiError, describeApiError } from "@/lib/api";

type ToastId = string | number;

interface ToastOptions {
  description?: string;
  id?: ToastId;
  duration?: number;
}

interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((err: unknown) => string);
}

/** Thin wrapper over sonner so call sites do not depend on the library directly. */
export const toast = {
  success: (message: string, options?: ToastOptions): ToastId => sonner.success(message, options),
  error: (message: string, options?: ToastOptions): ToastId => sonner.error(message, options),
  info: (message: string, options?: ToastOptions): ToastId => sonner.info(message, options),
  loading: (message: string, options?: ToastOptions): ToastId => sonner.loading(message, options),
  dismiss: (id?: ToastId): void => {
    sonner.dismiss(id);
  },
  promise: <T>(promise: Promise<T>, messages: PromiseMessages<T>): Promise<T> => {
    sonner.promise(promise, messages);
    return promise;
  },
};

/** Show an API or network error as a toast: the safe message plus "Ref: <requestId>" when the server sent one. */
export function toastApiError(err: unknown, fallback = "Something went wrong", options?: Omit<ToastOptions, "description">): ToastId {
  return toastErrorWithRef(describeApiError(err, fallback), err, options);
}

/** Error toast with an already-mapped safe message, plus "Ref: <requestId>" when the error is an ApiError that has one. */
export function toastErrorWithRef(message: string, err: unknown, options?: Omit<ToastOptions, "description">): ToastId {
  const requestId = err instanceof ApiError ? err.requestId : undefined;
  return sonner.error(message, { ...options, description: requestId ? `Ref: ${requestId}` : undefined });
}
