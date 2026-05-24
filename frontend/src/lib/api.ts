import type { AdminPool, AwardPrediction, Match, Pool, Prediction, RankingEntry, Stage, Team, Tournament, TournamentStatus } from "@/types";

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

export type AwardConfigPayload = { enabled: boolean; points: number };

export function createPool(payload: {
  tournamentId: number;
  name: string;
  description: string;
  creatorName: string;
  creatorEmail: string;
  creatorNickname: string;
  prizes: { position: number; description: string }[];
  scoring: { exactScore: number; outcome: number; oneTeamGoals: number; penaltyBonus: number };
  awards: {
    champion: AwardConfigPayload;
    runnerUp: AwardConfigPayload;
    thirdPlace: AwardConfigPayload;
    topScorer: AwardConfigPayload;
    bestPlayer: AwardConfigPayload;
  };
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

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function adminListTournaments() {
  return request<Tournament[]>("/admin/tournaments");
}

export function adminCreateTournament(payload: { name: string; year: number }) {
  return request<Tournament>("/admin/tournaments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminListStages(tournamentId: number) {
  return request<Stage[]>(`/admin/tournaments/${tournamentId}/stages`);
}

export function adminCreateStage(
  tournamentId: number,
  payload: { name: string; order: number; isKnockout: boolean },
) {
  return request<Stage>(`/admin/tournaments/${tournamentId}/stages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateStage(
  stageId: number,
  payload: Partial<{ name: string; order: number; isKnockout: boolean }>,
) {
  return request<Stage>(`/admin/stages/${stageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminListTeams() {
  return request<Team[]>("/admin/teams");
}

export function adminCreateTeam(payload: { name: string; shortName: string }) {
  return request<Team>("/admin/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminListMatches(tournamentId: number) {
  return request<Match[]>(`/admin/tournaments/${tournamentId}/matches`);
}

export function adminCreateMatch(
  tournamentId: number,
  payload: { stageId: number; startsAt: string; homeTeamId?: number | null; awayTeamId?: number | null },
) {
  return request<Match>(`/admin/tournaments/${tournamentId}/matches`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateMatch(
  matchId: number,
  payload: Partial<{
    stageId: number;
    homeTeamId: number | null;
    awayTeamId: number | null;
    startsAt: string;
    status: string;
    homeScore: number;
    awayScore: number;
    penaltyWinnerTeamId: number | null;
  }>,
) {
  return request<Match>(`/admin/matches/${matchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminListPools(tournamentId: number) {
  return request<AdminPool[]>(`/admin/tournaments/${tournamentId}/pools`);
}

export function listTournaments() {
  return request<{ id: number; name: string; year: number; status: string }[]>("/tournaments");
}

export function listTeams() {
  return request<Team[]>("/teams");
}

export function getAwardPrediction(slug: string, participantId: string) {
  return request<{ isLocked: boolean; prediction: AwardPrediction | null }>(
    `/pools/${slug}/award-prediction?participantId=${participantId}`,
  );
}

export function saveAwardPrediction(
  slug: string,
  payload: {
    participantId: string;
    championTeamId?: number | null;
    runnerUpTeamId?: number | null;
    thirdPlaceTeamId?: number | null;
    topScorer?: string;
    bestPlayer?: string;
  },
) {
  return request<AwardPrediction>(`/pools/${slug}/award-prediction`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateTournamentStatus(tournamentId: number, status: TournamentStatus) {
  return request<Tournament>(`/admin/tournaments/${tournamentId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function adminUpdateTournamentAwards(
  tournamentId: number,
  payload: Partial<{
    championTeamId: number | null;
    runnerUpTeamId: number | null;
    thirdPlaceTeamId: number | null;
    topScorer: string;
    bestPlayer: string;
  }>,
) {
  return request<Tournament>(`/admin/tournaments/${tournamentId}/awards`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
