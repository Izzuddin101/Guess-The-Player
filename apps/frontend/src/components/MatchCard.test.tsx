import { render, screen } from "@testing-library/react";
import { MatchCard } from "./MatchCard";
import { fullMatch } from "../test/fixtures";

test("renders the anonymized match card", () => {
  render(<MatchCard match={fullMatch} stage={4} />);
  expect(screen.getByText("Kha'Zix")).toBeInTheDocument();
  expect(screen.getByText("Victory")).toBeInTheDocument();
  expect(screen.getByText("5 / 3 / 2")).toBeInTheDocument();
  expect(screen.getAllByText("20:04")).toHaveLength(2);
  expect(screen.getByText("142")).toBeInTheDocument();
});

test("shows an explicit empty state when a mode has no keystone", () => {
  render(<MatchCard match={{ ...fullMatch, mainRune: null }} stage={4} />);
  expect(screen.getByText("Keystone")).toBeInTheDocument();
  expect(screen.getByText("None")).toBeInTheDocument();
});

test("keeps late-stage clues locked at the start", () => {
  render(<MatchCard match={{
    ...fullMatch,
    queueLabel: null,
    champion: null,
    creepScore: null,
    visionScore: null,
    items: [],
    summonerSpells: [],
    mainRune: null,
  }} stage={1} />);
  expect(screen.getByText("Unknown champion")).toBeInTheDocument();
  expect(screen.getAllByText("Locked")).toHaveLength(5);
});
