import { useEffect, useState } from "preact/hooks";

/** Chromium's install prompt, held back so the menu can offer it when the user asks. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

type WebInstall = Navigator & { install?: () => Promise<unknown> };

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  notify();
});

addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
});

const runningInstalled = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Whether this browser can install the app from a button: through the Web Install API where
 * it has it, or Chromium's own install prompt otherwise. Neither is offered once the app is
 * running installed.
 */
export function canInstall(): boolean {
  if (runningInstalled()) return false;
  return typeof (navigator as WebInstall).install === "function" || deferredPrompt !== null;
}

/** Asks the browser to install the app. Resolves once the user has answered. */
export async function install(): Promise<void> {
  const web = navigator as WebInstall;
  if (typeof web.install === "function") {
    // Rejects when the user declines, which needs nothing further.
    await web.install().catch(() => {});
    return;
  }
  const prompt = deferredPrompt;
  // A prompt can only be shown once.
  deferredPrompt = null;
  notify();
  await prompt?.prompt();
}

/** `canInstall()`, kept current as the browser's install prompt comes and goes. */
export function useCanInstall(): boolean {
  const [can, setCan] = useState(canInstall);
  useEffect(() => {
    const update = () => setCan(canInstall());
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  return can;
}
