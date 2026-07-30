import type { GuessResult, Round } from "./types";

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Something went wrong. Please try again.");
  }
  return response.json();
}

export const createRound = () =>
  request<Round>("/api/v1/rounds", { method: "POST" });

export const submitGuess = (roundId: string, playerId: string) =>
  request<GuessResult>(`/api/v1/rounds/${roundId}/guess`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });

export const skipRound = (roundId: string) =>
  request<GuessResult>(`/api/v1/rounds/${roundId}/skip`, { method: "POST" });

