import type { Match, Pool, Prediction, RankingEntry } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5001/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Erro inesperado na API");
  }

  return response.json();
}

export function createPool(payload: {
  name: string;
  description: string;
  creatorName: string;
  creatorEmail: string;
  creatorNickname: string;
  prizes: { position: number; description: string }[];
}) {
  return request<Pool & { creatorParticipantId: string; creatorDisplayName: string }>("/pools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPool(slug: string) {
  return request<Pool>(`/pools/${slug}`);
}

export function joinPool(slug: string, payload: { name: string; email: string; nickname?: string; participantId?: string }) {
  return request<{ participantId: string; displayName: string; pool: Pool }>(`/pools/${slug}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMatches(slug: string) {
  return request<Match[]>(`/pools/${slug}/matches`);
}

export function getRanking(slug: string) {
  return request<RankingEntry[]>(`/pools/${slug}/ranking`);
}

export function getPredictions(slug: string, participantId: string) {
  return request<Prediction[]>(`/pools/${slug}/predictions?participantId=${participantId}`);
}

export function savePrediction(
  slug: string,
  payload: {
    participantId: string;
    matchId: number;
    homeScore: number;
    awayScore: number;
    penaltyWinnerTeamId?: number | null;
  },
) {
  return request<Prediction>(`/pools/${slug}/predictions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
