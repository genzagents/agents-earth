/**
 * Type shims for @tauri-apps packages.
 *
 * These declarations allow `tsc --noEmit` (typecheck) to pass in CI
 * environments that do not have Rust / Cargo / Tauri CLI installed.
 * The real packages are still resolved at runtime inside an actual
 * Tauri build via the entries in package.json.
 */

declare module "@tauri-apps/api/core" {
  /**
   * Invoke a Tauri command registered on the Rust side.
   */
  export function invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export interface Event<T> {
    /** Event name. */
    event: string;
    /** Event identifier used to unlisten. */
    id: number;
    /** The payload of this event. */
    payload: T;
    /** The label of the window that emitted this event, or `null` for global events. */
    windowLabel: string | null;
  }

  export type EventCallback<T> = (event: Event<T>) => void;
  export type UnlistenFn = () => void;

  /**
   * Listen to a Tauri event.
   * Returns a promise that resolves to an unlisten function.
   */
  export function listen<T = unknown>(
    event: string,
    handler: EventCallback<T>
  ): Promise<UnlistenFn>;
}

declare module "@tauri-apps/plugin-shell" {
  export class Command {
    static create(
      program: string,
      args?: string | string[]
    ): Command;
    execute(): Promise<{ code: number | null; stdout: string; stderr: string }>;
    spawn(): Promise<{ kill(): Promise<void> }>;
  }
}
