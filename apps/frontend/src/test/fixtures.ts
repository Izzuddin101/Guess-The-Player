import type { Round } from "../types";

export const fullMatch: Round["match"] = {
  queueLabel: "Ranked Solo/Duo",
  result: "win",
  champion: { id: 121, name: "Kha'Zix", iconUrl: "/khazix.png" },
  kills: 5,
  deaths: 3,
  assists: 2,
  kda: 2.33,
  creepScore: 142,
  visionScore: 18,
  durationSeconds: 1204,
  items: [{ id: 6692, iconUrl: "/item.png" }],
  summonerSpells: [{ id: 4, iconUrl: "/flash.png" }],
  mainRune: { id: 8112, iconUrl: "/rune.png" },
};

export const round: Round = {
  roundId: "round-1",
  expiresAt: "2026-07-30T12:00:00Z",
  stage: 1,
  match: {
    ...fullMatch,
    queueLabel: null,
    champion: null,
    creepScore: null,
    visionScore: null,
    items: [],
    summonerSpells: [],
    mainRune: null,
  },
  choices: [
    { id: "player-a", displayName: "Zeyad" },
    { id: "player-b", displayName: "Maya" },
    { id: "player-c", displayName: "Omar" },
    { id: "player-d", displayName: "Lina" },
    { id: "player-e", displayName: "Noah" },
    { id: "player-f", displayName: "Sara" },
  ],
};
