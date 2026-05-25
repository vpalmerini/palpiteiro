export type User = {
  id: number;
  publicId: string;
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
  id: number;
  slug: string;
  name: string;
  description: string | null;
  creatorName: string;
  creatorUserId: string | null;
  tournamentId: number;
  isParticipant: boolean;
  awardsLocked: boolean;
  scoring: {
    exactScore: number;
    outcome: number;
    oneTeamGoals: number;
    penaltyBonus: number;
  };
  prizes: Prize[];
  awards: {
    champion: AwardConfig;
    runnerUp: AwardConfig;
    thirdPlace: AwardConfig;
    topScorer: AwardConfig;
    bestPlayer: AwardConfig;
  };
};

export type AwardPrediction = {
  id: number;
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  topScorer: string | null;
  bestPlayer: string | null;
  updatedAt: string;
};

export type TeamType = "club" | "national";

export type Team = {
  id: number;
  name: string;
  shortName: string | null;
  teamType: TeamType;
};

export type Round = {
  id: number;
  number: number;
  stageId: number;
};

export type Match = {
  id: number;
  round: Round;
  stage: {
    id: number;
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
  penaltyWinnerTeamId: number | null;
  isLocked: boolean;
};

export type PredictionScore = {
  points: number;
  exactScore: boolean;
  outcomeHit: boolean;
  penaltyHit: boolean;
};

export type Prediction = {
  id: number;
  matchId: number;
  userId: string;
  homeScore: number;
  awayScore: number;
  predictsPenalties: boolean;
  penaltyWinnerTeamId: number | null;
  updatedAt: string;
  score: PredictionScore | null;
};

export type RankingEntry = {
  position: number;
  displayName: string;
  userId: string;
  points: number;
  exactScores: number;
  outcomeHits: number;
  knockoutPoints: number;
  awardPoints: number;
};

export type TournamentStatus = "ongoing" | "finished";

export type Tournament = {
  id: number;
  name: string;
  year: number;
  status: TournamentStatus;
  stagesCount: number;
  matchesCount: number;
  poolsCount: number;
  awards: {
    championTeamId: number | null;
    championTeam: { id: number; name: string; shortName: string } | null;
    runnerUpTeamId: number | null;
    runnerUpTeam: { id: number; name: string; shortName: string } | null;
    thirdPlaceTeamId: number | null;
    thirdPlaceTeam: { id: number; name: string; shortName: string } | null;
    topScorer: string | null;
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
  tournament: { id: number; name: string; year: number; status: TournamentStatus };
  pools: MyPoolEntry[];
};

export type StageType = "group" | "league" | "knockout";

export type TournamentGroup = {
  id: number;
  name: string;
  stageId: number;
};

export type Stage = {
  id: number;
  name: string;
  order: number;
  stageType: StageType;
  isKnockout: boolean;
  groups: TournamentGroup[];
  rounds: Round[];
};

export type TournamentTeamEntry = Team & {
  groupId: number | null;
  groupName: string | null;
};

export type RoundSnapshotEntry = {
  position: number;
  userId: string;
  displayName: string;
  points: number;
  exactScores: number;
  outcomeHits: number;
  knockoutPoints: number;
  awardPoints: number;
};

export type RoundSnapshot = {
  id: number;
  roundId: number;
  roundNumber: number;
  stageId: number;
  stageName: string;
  stageOrder: number;
  stageType: StageType;
  createdAt: string;
  entries: RoundSnapshotEntry[];
};

export type AdminPool = {
  id: number;
  slug: string;
  name: string;
  creatorName: string;
  participantsCount: number;
  createdAt: string;
};
