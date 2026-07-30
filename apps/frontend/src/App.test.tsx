import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { fullMatch, round } from "./test/fixtures";

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

test("loads a round, supports keyboard selection, and updates the score", async () => {
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => json(round))
    .mockImplementationOnce(() => json({
      correct: true,
      complete: true,
      stage: 1,
      answer: round.choices[0],
      scoreDelta: 1000,
      match: fullMatch,
    }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  renderApp();

  await user.click(screen.getByRole("button", { name: /deal the first match/i }));
  const choice = await screen.findByRole("button", { name: /zeyad/i });
  choice.focus();
  await user.keyboard("{Enter}");

  expect(await screen.findByText(/nailed it/i)).toBeInTheDocument();
  expect(screen.getByText("1000", { selector: "strong" })).toBeInTheDocument();
  expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ playerId: "player-a" }));
});

test("keeps the round open and unlocks clues after a wrong guess", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockImplementationOnce(() => json(round))
    .mockImplementationOnce(() => json({
      correct: false,
      complete: false,
      stage: 2,
      answer: null,
      scoreDelta: 0,
      match: {
        ...round.match,
        creepScore: 142,
        visionScore: 18,
      },
    })));
  const user = userEvent.setup();
  const { container } = renderApp();
  await user.click(screen.getByRole("button", { name: /deal the first match/i }));
  await user.click(await screen.findByRole("button", { name: /maya/i }));
  expect(await screen.findByText(/wrong. new evidence unlocked/i)).toBeInTheDocument();
  expect(screen.getByLabelText("Wrong answer")).toBeInTheDocument();
  expect(screen.getByText(/clue 2\/4/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /maya/i })).toBeDisabled();
  expect(container.querySelector(".game-workbench")).toBeInTheDocument();
  expect(container.querySelector(".answer-grid")?.children).toHaveLength(6);
});

test("renders loading and recoverable error states", async () => {
  let reject!: (reason: Error) => void;
  vi.stubGlobal("fetch", vi.fn()
    .mockImplementationOnce(() => new Promise((_, failed) => { reject = failed; }))
    .mockImplementationOnce(() => json(round)));
  const user = userEvent.setup();
  renderApp();
  await user.click(screen.getByRole("button", { name: /deal the first match/i }));
  expect(screen.getByText(/fetching a recent match/i)).toBeInTheDocument();
  reject(new Error("Riot is resting"));
  expect(await screen.findByText("Riot is resting")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /try again/i }));
  await waitFor(() => expect(screen.getByText("Unknown champion")).toBeInTheDocument());
});
