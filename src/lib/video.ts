/**
 * Video Provider Abstraction — Daily.co and Jitsi fallback
 *
 * Daily.co: paid service, excellent quality, HIPAA-compliant plan available.
 *           Creates rooms via REST API, rooms can be set to auto-delete after meeting.
 *
 * Jitsi (stub): free, no account needed. We just generate a random room name
 *               and use meet.jit.si. Good for development and small clinics.
 */

export interface VideoRoom {
  roomName: string;
  roomUrl:  string;
  provider: 'daily' | 'jitsi';
  expiresAt?: string;  // ISO datetime when room auto-deletes
}

export interface VideoProvider {
  createRoom(params: { name: string; durationMin: number }): Promise<VideoRoom>;
  deleteRoom(roomName: string): Promise<void>;
}

// ─── Environment interface ────────────────────────────────────────────────────
export interface VideoEnv {
  DAILY_API_KEY?: string;
}

// ─── Daily.co Provider ────────────────────────────────────────────────────────
class DailyProvider implements VideoProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.daily.co/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createRoom({ name, durationMin }: { name: string; durationMin: number }): Promise<VideoRoom> {
    const expiresAt = Math.floor(Date.now() / 1000) + durationMin * 60 + 300; // room live for duration + 5 min buffer
    const roomName = `hms-${name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60);

    const res = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: expiresAt,
          enable_screenshare: true,
          enable_chat: true,
          max_participants: 4, // doctor + patient + optional assistant/family
        },
      }),
    });
    if (!res.ok) throw new Error(`Daily.co room creation failed: ${res.status}`);
    const data = await res.json() as { name: string; url: string };
    return {
      roomName: data.name,
      roomUrl: data.url,
      provider: 'daily',
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  async deleteRoom(roomName: string): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

// ─── Jitsi (Free / Stub) Provider ────────────────────────────────────────────
class JitsiProvider implements VideoProvider {
  async createRoom({ name }: { name: string }): Promise<VideoRoom> {
    const slug = `HMS-${name}-${Math.random().toString(36).slice(2, 8)}`.replace(/[^A-Za-z0-9-]/g, '');
    const roomUrl = `https://meet.jit.si/${slug}`;
    console.log(`[VIDEO] Created Jitsi room: ${roomUrl}`);
    return {
      roomName: slug,
      roomUrl,
      provider: 'jitsi',
    };
  }

  async deleteRoom(_roomName: string): Promise<void> {
    // Jitsi rooms are ephemeral — no deletion needed
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createVideoProvider(env: VideoEnv): VideoProvider {
  if (env.DAILY_API_KEY) {
    return new DailyProvider(env.DAILY_API_KEY);
  }
  console.log('[VIDEO] DAILY_API_KEY not set — using Jitsi (free) fallback');
  return new JitsiProvider();
}
