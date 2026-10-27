/**
 * Zero-dependency, non-blocking anonymous analytics reporter for Iris.
 * Sends privacy-preserving usage telemetry to the aether-deck Supabase pipeline.
 *
 * Privacy Guarantees:
 * - Zero PII: No Windows usernames, computer names, IPs, or file paths are ever collected.
 * - Random Client ID: Unique UUID stored in localStorage (can be cleared at any time).
 * - Opt-out honored: If user disables telemetry in Settings, all network calls immediately no-op.
 */

const SUPABASE_URL = "https://oyrbfbthkxrifhejvmhv.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cmJmYnRoa3hyaWZoZWp2bWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDI3NzQsImV4cCI6MjEwMzk3ODc3NH0.Qnr6vUGFMFVSw0VqQKT1vi2Lpjvsu361IqLGSYrp_5k";

const CLIENT_ID_KEY = "iris_anon_client_id";

export type TelemetryEventType =
  | "app_launch"
  | "heartbeat"
  | "overlay_equipped"
  | "app_close";

export interface TelemetryPayload {
  event: TelemetryEventType;
  appVersion: string;
  gameCategory?: string | null;
  elementType?: string | null;
  resolution?: string | null;
}

/**
 * Returns the persisted anonymous client UUID or generates a fresh one.
 */
export function getAnonymousClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id || id.length !== 36) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

/**
 * Fire-and-forget telemetry ping. Never throws, never blocks the main thread.
 */
export async function sendTelemetryEvent(
  payload: TelemetryPayload,
  enabled = true
): Promise<void> {
  if (!enabled) return;

  const clientId = getAnonymousClientId();
  const endpoint = `${SUPABASE_URL}/rest/v1/iris_telemetry`;

  const body = {
    client_id: clientId,
    app_version: payload.appVersion || "0.1.2",
    event: payload.event,
    game_category: payload.gameCategory || null,
    element_type: payload.elementType || null,
    resolution: payload.resolution || null,
  };

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silently ignore offline or network errors to preserve frame pacing
  }
}
