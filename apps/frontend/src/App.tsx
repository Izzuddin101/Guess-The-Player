import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createRound, skipRound, submitGuess } from "./api";
import { MatchCard } from "./components/MatchCard";
import type { GuessResult, Round } from "./types";

const TOTAL_ROUNDS = 5;
const LANDING_CHAMPIONS = [
  { id: 432, name: "Bard" },
  { id: 888, name: "Renata Glasc" },
  { id: 103, name: "Ahri" },
  { id: 412, name: "Thresh" },
  { id: 222, name: "Jinx" },
  { id: 64, name: "Lee Sin" },
  { id: 99, name: "Lux" },
];

type Screen = "landing" | "game" | "results";
type Stats = { score: number; correct: number; streak: number; bestStreak: number };
const emptyStats: Stats = { score: 0, correct: 0, streak: 0, bestStreak: 0 };

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [roundNumber, setRoundNumber] = useState(1);
  const [round, setRound] = useState<Round | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guessedIds, setGuessedIds] = useState<string[]>([]);
  const [reveal, setReveal] = useState<GuessResult | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);

  const roundMutation = useMutation({
    mutationFn: createRound,
    onSuccess: (data) => {
      setRound(data);
      setReveal(null);
      setSelectedId(null);
      setGuessedIds([]);
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ playerId, skip }: { playerId?: string; skip?: boolean }) =>
      skip ? skipRound(round!.roundId) : submitGuess(round!.roundId, playerId!),
    onSuccess: (result, variables) => {
      setRound((current) => current && {
        ...current,
        stage: result.stage,
        match: result.match,
      });
      if (variables.playerId && !result.correct) {
        setGuessedIds((current) => [...current, variables.playerId!]);
      }
      if (!result.complete) {
        setSelectedId(null);
        return;
      }
      setReveal(result);
      setStats((current) => {
        const streak = result.correct ? current.streak + 1 : 0;
        return {
          score: current.score + result.scoreDelta,
          correct: current.correct + Number(result.correct),
          streak,
          bestStreak: Math.max(current.bestStreak, streak),
        };
      });
    },
  });

  useEffect(() => {
    if (screen === "game" && !round && !roundMutation.isPending && !roundMutation.isError) {
      roundMutation.mutate();
    }
  }, [screen, round, roundMutation]);

  const start = () => {
    setStats(emptyStats);
    setRoundNumber(1);
    setRound(null);
    setReveal(null);
    setGuessedIds([]);
    roundMutation.reset();
    answerMutation.reset();
    setScreen("game");
  };

  const next = () => {
    if (roundNumber >= TOTAL_ROUNDS) {
      setScreen("results");
      return;
    }
    setRoundNumber((value) => value + 1);
    setRound(null);
    setSelectedId(null);
    setGuessedIds([]);
    roundMutation.reset();
    answerMutation.reset();
  };

  if (screen === "landing") return <Landing onStart={start} />;
  if (screen === "results") {
    return <Results stats={stats} rounds={TOTAL_ROUNDS} onRestart={start} />;
  }

  return (
    <Shell>
      <header className="scoreboard-header">
        <button
          onClick={() => setScreen("landing")}
          className="wordmark-button"
          aria-label="Back to home"
        >
          <Mark />
          <span className="wordmark-label">GUESS THE PLAYER</span>
        </button>
        <div className="scoreboard-stats" aria-label="Game progress">
          <span>
            ROUND <strong>{roundNumber}</strong> / {TOTAL_ROUNDS}
          </span>
          <span>
            SCORE <strong>{stats.score}</strong>
          </span>
        </div>
      </header>

      {roundMutation.isPending && <Loading />}
      {roundMutation.isError && (
        <ErrorState
          message={roundMutation.error.message}
          onRetry={() => roundMutation.mutate()}
        />
      )}
      {round && (
        <main className="game-main">
          <div className="round-heading reveal-in">
            <div>
              <p className="mono-label">Match evidence</p>
              <h1>Who played this one?</h1>
            </div>
            <p>Each miss uncovers a stronger clue. Champion comes last.</p>
          </div>

          <div className="game-workbench reveal-in">
            <MatchCard match={round.match} stage={reveal ? 4 : round.stage} />

            <section className="guess-panel" aria-label="Player choices">
              <div className="guess-panel__head">
                <span className="mono-label">Lock one in</span>
                <span>Clue {round.stage}/4 · {round.choices.length} friends</span>
              </div>
              <div className="answer-grid">
              {round.choices.map((player, index) => {
                const correct = reveal?.answer?.id === player.id;
                const guessed = guessedIds.includes(player.id);
                const selectedWrong = guessed && !correct;
                const state =
                  answerMutation.isPending && selectedId === player.id
                    ? "loading"
                    : correct
                      ? "success"
                      : selectedWrong
                        ? "error"
                        : undefined;
                return (
                  <button
                    key={player.id}
                    disabled={!!reveal || answerMutation.isPending || guessed}
                    aria-pressed={selectedId === player.id}
                    data-state={state}
                    onClick={() => {
                      setSelectedId(player.id);
                      answerMutation.mutate({ playerId: player.id });
                    }}
                    className="choice"
                  >
                    <span className="choice__number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="choice__name">{player.displayName}</span>
                    {correct && <span className="choice__status" aria-label="Correct answer">✓ CORRECT</span>}
                    {selectedWrong && <span className="choice__status" aria-label="Wrong answer">× GUESSED</span>}
                  </button>
                );
              })}
              </div>

            {!reveal ? (
              <div className="guess-panel__foot">
                <p>
                  {guessedIds.length
                    ? "Wrong. New evidence unlocked."
                    : "One guess per clue stage."}
                </p>
                <button
                  disabled={answerMutation.isPending}
                  onClick={() => answerMutation.mutate({ skip: true })}
                  data-state={answerMutation.isPending ? "loading" : undefined}
                  className="text-button"
                >
                  {answerMutation.isPending ? "Checking…" : "Skip round"}
                </button>
              </div>
            ) : (
              <div
                className="reveal-panel"
                data-result={reveal.correct ? "correct" : "wrong"}
                role="status"
              >
                <div>
                  <p className="reveal-panel__verdict">
                    {reveal.correct ? `Nailed it! +${reveal.scoreDelta}` : "Not this time"}
                  </p>
                  <p>
                    It was <strong>{reveal.answer?.displayName}</strong>.
                  </p>
                </div>
                <button onClick={next} autoFocus className="btn btn--compact" data-state="success">
                  {roundNumber === TOTAL_ROUNDS ? "See results" : "Next round"} →
                </button>
              </div>
            )}

            {answerMutation.isError && (
              <p className="inline-error" role="alert">
                {answerMutation.error.message}
              </p>
            )}
            </section>
          </div>
        </main>
      )}
    </Shell>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <Shell>
      <main className="landing">
        <section className="landing-copy reveal-in">
          <div className="landing-brand">
          <Mark large />
            <span>GUESS THE PLAYER</span>
          </div>
          <p className="landing-kicker">Your crew. Five rounds. Zero names.</p>
          <h1>Read the match.<br />Name the player.</h1>
          <p className="landing-lede">
            Start with the result, clock, and KDA. Every wrong read unlocks stronger
            evidence. Champion comes last.
          </p>
          <button onClick={onStart} className="btn btn--large">
            Deal the first match <span aria-hidden="true">→</span>
          </button>
        </section>

        <aside className="squad-showcase reveal-in" aria-label="How the game works">
          <div className="champion-cloud" aria-hidden="true">
            {LANDING_CHAMPIONS.map((champion, index) => (
              <img
                key={champion.id}
                className={`champion-cloud__portrait champion-cloud__portrait--${index + 1}`}
                src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champion.id}.png`}
                alt=""
                width="128"
                height="128"
              />
            ))}
            <span className="champion-cloud__mystery">?</span>
          </div>

          <div className="squad-guide">
            <div>
              <p className="mono-label">Four clue stages</p>
              <h2>Every miss reveals more.</h2>
            </div>
            <ol className="clue-path">
              <li><span>01</span><p>Result · time · KDA</p></li>
              <li><span>02</span><p>CS · vision</p></li>
              <li><span>03</span><p>Spells · keystone</p></li>
              <li><span>04</span><p>Build · champion</p></li>
            </ol>
          </div>
        </aside>
      </main>
      <RulesTicker />
    </Shell>
  );
}

function Results({ stats, rounds, onRestart }: { stats: Stats; rounds: number; onRestart: () => void }) {
  const accuracy = Math.round((stats.correct / rounds) * 100);
  return (
    <Shell>
      <main className="results-layout reveal-in">
        <section className="results-score">
          <Mark large />
          <p className="mono-label">Session complete</p>
          <p className="results-score__number">{stats.score}</p>
          <h1>points on the board.</h1>
          <p>You got {stats.correct} of {rounds}. The builds remember everything.</p>
        </section>
        <section className="results-breakdown" aria-label="Session statistics">
          <h2>Squad readout</h2>
          <div className="results-grid">
          <ResultStat label="Total score" value={stats.score.toLocaleString()} />
          <ResultStat label="Accuracy" value={`${accuracy}%`} />
          <ResultStat label="Correct" value={`${stats.correct}/${rounds}`} />
          <ResultStat label="Best streak" value={String(stats.bestStreak)} />
          </div>
          <button onClick={onRestart} className="btn">
            Run it back <span aria-hidden="true">→</span>
          </button>
        </section>
      </main>
    </Shell>
  );
}

function RulesTicker() {
  const copy = "KDA FIRST · EVERY FRIEND · FOUR CLUE STAGES · CHAMPION LAST · ";
  return (
    <footer
      className="rules-ticker"
      tabIndex={0}
      aria-label="Game rules ticker. Focus or hover to pause."
    >
      <div className="rules-ticker__track" aria-hidden="true">
        <span>{copy}</span>
      </div>
      <p className="sr-only">Use the match clues to choose one friend.</p>
    </footer>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-stat">
      <p>{value}</p>
      <span>{label}</span>
    </div>
  );
}

function Shell({ children, centered = false }: { children: React.ReactNode; centered?: boolean }) {
  return (
    <div className={`app-shell${centered ? " app-shell--centered" : ""}`}>
      <div className="shell-inner">{children}</div>
    </div>
  );
}

function Mark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-puck${large ? " brand-puck--large" : ""}`} aria-hidden="true">
      G
    </span>
  );
}

function Loading() {
  return (
    <main className="loading-state" role="status">
      <div className="loading-copy">
        <p className="mono-label">Fetching a recent match</p>
        <h1>Hiding the name.<br />Keeping the tells.</h1>
      </div>
      <div className="loading-frame" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="error-state" role="alert">
      <div>
        <p className="mono-label">Round unavailable</p>
        <h1>Couldn’t deal a match.</h1>
        <p>{message}</p>
        <button onClick={onRetry} className="btn" data-state="error">Try again</button>
      </div>
      <span className="error-mark" aria-hidden="true">×</span>
    </main>
  );
}
