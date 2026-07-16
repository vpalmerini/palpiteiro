/** UUID string primary keys from the API. */
export type EntityId = string;

export type User = {
  id: EntityId;
  name: string;
  email: string;
  pictureUrl: string | null;
  isAdmin: boolean;
};

export type Prize = {
  position: number;
  description: string;
};

export type AwardConfig = {
  enabled: boolean;
  points: number;
};

export type Pool = {
  id: EntityId;
  slug: string;
  name: string;
  description: string | null;
  creatorName: string;
  creatorUserId: EntityId | null;
  tournamentId: EntityId;
  tournamentStatus: TournamentStatus;
  hasPredictions: boolean;
  isParticipant: boolean;
  isRemoved: boolean;
  locked: boolean;
  participantsCount: number;
  awardsLocked: boolean;
  scoring: {
    exactScore: number;
    outcome: number;
    oneTeamGoals: number;
    penaltyBonus: number;
    knockoutMultiplier: number;
  };
  prizes: Prize[];
  awards: {
    champion: AwardConfig;
    runnerUp: AwardConfig;
    thirdPlace: AwardConfig;
    topScorer: AwardConfig;
    bestPlayer: AwardConfig;
  };
  palpitao: {
    enabled: boolean;
    multiplier: number;
  };
};

export type AwardPrediction = {
  id: EntityId;
  championTeamId: EntityId | null;
  runnerUpTeamId: EntityId | null;
  thirdPlaceTeamId: EntityId | null;
  topScorer: string | null;
  bestPlayer: string | null;
  updatedAt: string;
};

export type TeamType = "club" | "national";

export type Team = {
  id: EntityId;
  name: string;
  shortName: string | null;
  teamType: TeamType;
  flagCode: string | null;
  logoUrl: string | null;
};

export type Round = {
  id: EntityId;
  number: number;
  stageId: EntityId;
};

export type Match = {
  id: EntityId;
  round: Round;
  stage: {
    id: EntityId;
    name: string;
    stageType: StageType;
    isKnockout: boolean;
  };
  group: TournamentGroup | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  startsAt: string;
  venue: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  wentToPenalties: boolean;
  penaltyWinnerTeamId: EntityId | null;
  isLocked: boolean;
};

export type PredictionScore = {
  points: number;
  exactScore: boolean;
  outcomeHit: boolean;
  penaltyHit: boolean;
};

export type Prediction = {
  id: EntityId;
  matchId: EntityId;
  userId: EntityId;
  homeScore: number;
  awayScore: number;
  predictsPenalties: boolean;
  penaltyWinnerTeamId: EntityId | null;
  hasMultiplier: boolean;
  updatedAt: string;
  score: PredictionScore | null;
};

export type RankingEntry = {
  position: number;
  displayName: string;
  userId: EntityId;
  pictureUrl: string | null;
  points: number;
  exactScores: number;
  outcomeHits: number;
  knockoutPoints: number;
  awardPoints: number;
  hasUsedPalpitao: boolean;
};

export type TournamentStatus = "ongoing" | "finished";

export type Tournament = {
  id: EntityId;
  name: string;
  year: number;
  status: TournamentStatus;
  stagesCount: number;
  matchesCount: number;
  poolsCount: number;
  awards: {
    championTeamId: EntityId | null;
    championTeam: { id: EntityId; name: string; shortName: string } | null;
    runnerUpTeamId: EntityId | null;
    runnerUpTeam: { id: EntityId; name: string; shortName: string } | null;
    thirdPlaceTeamId: EntityId | null;
    thirdPlaceTeam: { id: EntityId; name: string; shortName: string } | null;
    topScorers: string[];
    bestPlayer: string | null;
  };
};

export type MyPoolEntry = {
  slug: string;
  name: string;
  creatorName: string;
  participantsCount: number;
  myPoints: number;
  myPosition: number;
};

export type MyPoolsByTournament = {
  tournament: { id: EntityId; name: string; year: number; status: TournamentStatus };
  pools: MyPoolEntry[];
};

export type StageType = "group" | "league" | "knockout";

export type TournamentGroup = {
  id: EntityId;
  name: string;
  stageId: EntityId;
};

export type Stage = {
  id: EntityId;
  name: string;
  order: number;
  stageType: StageType;
  isKnockout: boolean;
  groups: TournamentGroup[];
  rounds: Round[];
};

export type TournamentTeamEntry = Team & {
  groupId: EntityId | null;
  groupName: string | null;
};

export type RoundSnapshotEntry = {
  position: number;
  userId: EntityId;
  displayName: string;
  points: number;
  exactScores: number;
  outcomeHits: number;
  knockoutPoints: number;
  awardPoints: number;
};

export type RoundSnapshot = {
  id: EntityId;
  roundId: EntityId;
  roundNumber: number;
  stageId: EntityId;
  stageName: string;
  stageOrder: number;
  stageType: StageType;
  createdAt: string;
  entries: RoundSnapshotEntry[];
};

export type AdminPool = {
  id: EntityId;
  slug: string;
  name: string;
  creatorName: string;
  participantsCount: number;
  createdAt: string;
};
