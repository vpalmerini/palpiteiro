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

export type Team = {
  id: number;
  name: string;
  shortName: string;
};

export type Match = {
  id: number;
  stage: {
    id: number;
    name: string;
    isKnockout: boolean;
  };
  homeTeam: Team | null;
  awayTeam: Team | null;
  startsAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  wentToPenalties: boolean;
  penaltyWinnerTeamId: number | null;
  isLocked: boolean;
};

export type Prediction = {
  id: number;
  matchId: number;
  participantId: string;
  homeScore: number;
  awayScore: number;
  predictsPenalties: boolean;
  penaltyWinnerTeamId: number | null;
  updatedAt: string;
};

export type RankingEntry = {
  position: number;
  displayName: string;
  participantId: string;
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

export type Stage = {
  id: number;
  name: string;
  order: number;
  isKnockout: boolean;
};

export type AdminPool = {
  id: number;
  slug: string;
  name: string;
  creatorName: string;
  participantsCount: number;
  createdAt: string;
};
