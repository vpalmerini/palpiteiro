import type {
  AwardPrediction,
  AdminPool,
  EntityId,
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

export type CreatedPool = {
  id: EntityId;
  slug: string;
};

export function createPool(payload: {
  tournamentId: EntityId;
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
  return request<CreatedPool>("/pools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPool(slug: string) {
  return request<Pool>(`/pools/${slug}`);
}

export type PoolDetail = {
  pool: Pool;
  matches: Match[];
  ranking: RankingEntry[];
  snapshots: RoundSnapshot[];
  predictedMatchIds: string[];
};

export function getPoolDetail(slug: string) {
  return request<PoolDetail>(`/pools/${slug}/detail`);
}

export type PredictionSetup = {
  pool: Pool;
  matches: Match[];
  predictions: Prediction[];
  awardPrediction: { isLocked: boolean; prediction: AwardPrediction | null };
  teams: Team[];
};

export function getPredictionSetup(slug: string) {
  return request<PredictionSetup>(`/pools/${slug}/prediction-setup`);
}

export type UpdatePoolPayload = {
  name?: string;
  description?: string;
  prizes?: { position: number; description: string }[];
  scoring?: { exactScore?: number; outcome?: number; oneTeamGoals?: number; penaltyBonus?: number };
  awards?: {
    champion?: AwardConfigPayload;
    runnerUp?: AwardConfigPayload;
    thirdPlace?: AwardConfigPayload;
    topScorer?: AwardConfigPayload;
    bestPlayer?: AwardConfigPayload;
  };
};

export function updatePool(slug: string, payload: UpdatePoolPayload) {
  return request<Pool>(`/pools/${slug}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function joinPool(slug: string, payload: { nickname?: string }) {
  return request<{ displayName: string; pool: Pool }>(`/pools/${slug}/join`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeParticipant(slug: string, userId: string) {
  return request<Pool>(`/pools/${slug}/participants/${userId}`, {
    method: "DELETE",
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
    matchId: EntityId;
    homeScore: number;
    awayScore: number;
    penaltyWinnerTeamId?: EntityId | null;
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
    championTeamId?: EntityId | null;
    runnerUpTeamId?: EntityId | null;
    thirdPlaceTeamId?: EntityId | null;
    topScorer?: string;
    bestPlayer?: string;
  },
) {
  return request<void>(`/pools/${slug}/award-prediction`, {
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

export function adminListStages(tournamentId: EntityId) {
  return request<Stage[]>(`/admin/tournaments/${tournamentId}/stages`);
}

export function adminCreateStage(
  tournamentId: EntityId,
  payload: { name: string; order: number; stageType: string },
) {
  return request<Stage>(`/admin/tournaments/${tournamentId}/stages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateStage(
  stageId: EntityId,
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

export function adminListMatches(tournamentId: EntityId) {
  return request<Match[]>(`/admin/tournaments/${tournamentId}/matches`);
}

export function adminCreateMatch(
  tournamentId: EntityId,
  payload: { roundId: EntityId; startsAt: string; homeTeamId?: EntityId | null; awayTeamId?: EntityId | null },
) {
  return request<Match>(`/admin/tournaments/${tournamentId}/matches`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminListStageRounds(stageId: EntityId) {
  return request<Round[]>(`/admin/stages/${stageId}/rounds`);
}

export function adminCreateRound(stageId: EntityId, payload: { number: number }) {
  return request<Round>(`/admin/stages/${stageId}/rounds`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateRound(roundId: EntityId, payload: { number: number }) {
  return request<Round>(`/admin/rounds/${roundId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminDeleteRound(roundId: EntityId) {
  return request<void>(`/admin/rounds/${roundId}`, { method: "DELETE" });
}

export function adminGenerateRoundSnapshot(roundId: EntityId) {
  return request<{ roundId: EntityId; roundNumber: number; stageName: string; poolsSnapshotted: number }>(
    `/admin/rounds/${roundId}/snapshot`,
    { method: "POST" },
  );
}

export function adminDeleteMatch(matchId: EntityId) {
  return request<void>(`/admin/matches/${matchId}`, { method: "DELETE" });
}

export function adminDeleteStage(stageId: EntityId) {
  return request<void>(`/admin/stages/${stageId}`, { method: "DELETE" });
}

export function adminUpdateMatch(
  matchId: EntityId,
  payload: Partial<{
    roundId: EntityId;
    homeTeamId: EntityId | null;
    awayTeamId: EntityId | null;
    startsAt: string;
    status: string;
    homeScore: number;
    awayScore: number;
    penaltyWinnerTeamId: EntityId | null;
  }>,
) {
  return request<Match>(`/admin/matches/${matchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminListPools(tournamentId: EntityId) {
  return request<AdminPool[]>(`/admin/tournaments/${tournamentId}/pools`);
}

export function listTournamentTeams(tournamentId: EntityId) {
  return request<Team[]>(`/tournaments/${tournamentId}/teams`);
}

export function adminListTournamentTeams(tournamentId: EntityId) {
  return request<TournamentTeamEntry[]>(`/admin/tournaments/${tournamentId}/teams`);
}

export function adminAddTournamentTeam(tournamentId: EntityId, teamId: EntityId) {
  return request<{ tournamentId: EntityId; teamId: EntityId }>(`/admin/tournaments/${tournamentId}/teams`, {
    method: "POST",
    body: JSON.stringify({ teamId }),
  });
}

export function adminRemoveTournamentTeam(tournamentId: EntityId, teamId: EntityId) {
  return request<void>(`/admin/tournaments/${tournamentId}/teams/${teamId}`, {
    method: "DELETE",
  });
}

export function adminAssignTeamGroup(tournamentId: EntityId, teamId: EntityId, groupId: EntityId | null) {
  return request<TournamentTeamEntry>(`/admin/tournaments/${tournamentId}/teams/${teamId}/group`, {
    method: "PATCH",
    body: JSON.stringify({ groupId }),
  });
}

export function adminListTournamentGroups(tournamentId: EntityId) {
  return request<TournamentGroup[]>(`/admin/tournaments/${tournamentId}/groups`);
}

export function adminCreateGroup(stageId: EntityId, payload: { name: string }) {
  return request<TournamentGroup>(`/admin/stages/${stageId}/groups`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminDeleteGroup(groupId: EntityId) {
  return request<void>(`/admin/groups/${groupId}`, { method: "DELETE" });
}

export function adminRenameGroup(groupId: EntityId, payload: { name: string }) {
  return request<TournamentGroup>(`/admin/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateTeam(
  teamId: EntityId,
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
  return request<{ id: EntityId; name: string; year: number; status: string }[]>("/tournaments");
}

export function listTeams() {
  return request<Team[]>("/teams");
}

export function adminUpdateTournamentStatus(tournamentId: EntityId, status: TournamentStatus) {
  return request<Tournament>(`/admin/tournaments/${tournamentId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function adminUpdateTournamentAwards(
  tournamentId: EntityId,
  payload: Partial<{
    championTeamId: EntityId | null;
    runnerUpTeamId: EntityId | null;
    thirdPlaceTeamId: EntityId | null;
    topScorer: string;
    bestPlayer: string;
  }>,
) {
  return request<Tournament>(`/admin/tournaments/${tournamentId}/awards`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
