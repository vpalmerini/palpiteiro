import type {
  AdminPool,
  AwardPrediction,
  Match,
  MyPoolsByTournament,
  Pool,
  Prediction,
  RankingEntry,
  Round,
  RoundSnapshot,
  Stage,
  Team,
  TournamentGroup,
  TournamentTeamEntry,
  Tournament,
  TournamentStatus,
  User,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export function ordinalRound(n: number): string {
  return `${n}ª Rodada`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Erro inesperado na API");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function loginWithGoogle(credential: string) {
  return request<User>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function getMe(): Promise<User | null> {
  try {
    return await request<User>("/auth/me");
  } catch {
    return null;
  }
}

export function logout() {
  return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

export type AwardConfigPayload = { enabled: boolean; points: number };

export function createPool(payload: {
  tournamentId: number;
  name: string;
  description: string;
  creatorNickname?: string;
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
  return request<Pool & { creatorDisplayName: string }>("/pools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPool(slug: string) {
  return request<Pool>(`/pools/${slug}`);
}

export function joinPool(slug: string, payload: { nickname?: string }) {
  return request<{ displayName: string; pool: Pool }>(`/pools/${slug}/join`, {
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

export function getPredictions(slug: string) {
  return request<Prediction[]>(`/pools/${slug}/predictions`);
}

export function savePrediction(
  slug: string,
  payload: {
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

export function getAwardPrediction(slug: string) {
  return request<{ isLocked: boolean; prediction: AwardPrediction | null }>(
    `/pools/${slug}/award-prediction`,
  );
}

export function saveAwardPrediction(
  slug: string,
  payload: {
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

export function getMyPools() {
  return request<MyPoolsByTournament[]>("/me/pools");
}

export function getPoolSnapshots(slug: string) {
  return request<RoundSnapshot[]>(`/pools/${slug}/snapshots`);
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
  payload: { name: string; order: number; stageType: string },
) {
  return request<Stage>(`/admin/tournaments/${tournamentId}/stages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateStage(
  stageId: number,
  payload: Partial<{ name: string; order: number; stageType: string }>,
) {
  return request<Stage>(`/admin/stages/${stageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminListTeams() {
  return request<Team[]>("/admin/teams");
}

export function adminListMatches(tournamentId: number) {
  return request<Match[]>(`/admin/tournaments/${tournamentId}/matches`);
}

export function adminCreateMatch(
  tournamentId: number,
  payload: { roundId: number; startsAt: string; homeTeamId?: number | null; awayTeamId?: number | null },
) {
  return request<Match>(`/admin/tournaments/${tournamentId}/matches`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminListStageRounds(stageId: number) {
  return request<Round[]>(`/admin/stages/${stageId}/rounds`);
}

export function adminCreateRound(stageId: number, payload: { number: number }) {
  return request<Round>(`/admin/stages/${stageId}/rounds`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateRound(roundId: number, payload: { number: number }) {
  return request<Round>(`/admin/rounds/${roundId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminDeleteRound(roundId: number) {
  return request<void>(`/admin/rounds/${roundId}`, { method: "DELETE" });
}

export function adminGenerateRoundSnapshot(roundId: number) {
  return request<{ roundId: number; roundNumber: number; stageName: string; poolsSnapshotted: number }>(
    `/admin/rounds/${roundId}/snapshot`,
    { method: "POST" },
  );
}

export function adminDeleteMatch(matchId: number) {
  return request<void>(`/admin/matches/${matchId}`, { method: "DELETE" });
}

export function adminDeleteStage(stageId: number) {
  return request<void>(`/admin/stages/${stageId}`, { method: "DELETE" });
}

export function adminUpdateMatch(
  matchId: number,
  payload: Partial<{
    roundId: number;
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

export function listTournamentTeams(tournamentId: number) {
  return request<Team[]>(`/tournaments/${tournamentId}/teams`);
}

export function adminListTournamentTeams(tournamentId: number) {
  return request<TournamentTeamEntry[]>(`/admin/tournaments/${tournamentId}/teams`);
}

export function adminAddTournamentTeam(tournamentId: number, teamId: number) {
  return request<{ tournamentId: number; teamId: number }>(`/admin/tournaments/${tournamentId}/teams`, {
    method: "POST",
    body: JSON.stringify({ teamId }),
  });
}

export function adminRemoveTournamentTeam(tournamentId: number, teamId: number) {
  return request<void>(`/admin/tournaments/${tournamentId}/teams/${teamId}`, {
    method: "DELETE",
  });
}

export function adminAssignTeamGroup(tournamentId: number, teamId: number, groupId: number | null) {
  return request<TournamentTeamEntry>(`/admin/tournaments/${tournamentId}/teams/${teamId}/group`, {
    method: "PATCH",
    body: JSON.stringify({ groupId }),
  });
}

export function adminListTournamentGroups(tournamentId: number) {
  return request<TournamentGroup[]>(`/admin/tournaments/${tournamentId}/groups`);
}

export function adminCreateGroup(stageId: number, payload: { name: string }) {
  return request<TournamentGroup>(`/admin/stages/${stageId}/groups`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminDeleteGroup(groupId: number) {
  return request<void>(`/admin/groups/${groupId}`, { method: "DELETE" });
}

export function adminRenameGroup(groupId: number, payload: { name: string }) {
  return request<TournamentGroup>(`/admin/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateTeam(
  teamId: number,
  payload: Partial<{ name: string; shortName: string; flagCode: string; logoUrl: string }>,
) {
  return request<Team>(`/admin/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminCreateTeam(payload: {
  name: string;
  shortName: string;
  teamType: string;
  flagCode?: string;
  logoUrl?: string;
}) {
  return request<Team>("/admin/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listTournaments() {
  return request<{ id: number; name: string; year: number; status: string }[]>("/tournaments");
}

export function listTeams() {
  return request<Team[]>("/teams");
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
