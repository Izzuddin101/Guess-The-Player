export type Player = {
  id: string;
  displayName: string;
};

export type Asset = {
  id: number;
  iconUrl: string;
};

export type Match = {
  queueLabel: string | null;
  result: "win" | "loss";
  champion: (Asset & { name: string }) | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  creepScore: number | null;
  visionScore: number | null;
  durationSeconds: number;
  items: Asset[];
  summonerSpells: Asset[];
  mainRune: Asset | null;
};

export type Round = {
  roundId: string;
  expiresAt: string;
  stage: number;
  match: Match;
  choices: Player[];
};

export type GuessResult = {
  correct: boolean;
  complete: boolean;
  stage: number;
  answer: Player | null;
  scoreDelta: number;
  match: Match;
};
