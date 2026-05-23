export type Prize = {
  position: number;
  description: string;
};

export type Pool = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  creatorName: string;
  scoring: {
    exactScore: number;
    outcome: number;
    oneTeamGoals: number;
    penaltyBonus: number;
  };
  prizes: Prize[];
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
};

export type Tournament = {
  id: number;
  name: string;
  year: number;
  stagesCount: number;
  matchesCount: number;
  poolsCount: number;
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
