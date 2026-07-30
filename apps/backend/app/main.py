import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from .config import load_players
from .game import GameService
from .models import GuessRequest, GuessResponse, PublicPlayer, RoundResponse
from .riot import RiotAPIError, RiotClient

load_dotenv(Path(__file__).parents[3] / ".env")


def create_app(
    service: GameService | None = None, riot_client: RiotClient | None = None
) -> FastAPI:
    riot = riot_client

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal riot
        if service is None:
            riot = riot or RiotClient(os.getenv("RIOT_API_KEY", ""))
            app.state.game = GameService(load_players(), riot)
        else:
            app.state.game = service
        yield
        if riot:
            await riot.close()

    app = FastAPI(title="Guess the Player API", version="1.0.0", lifespan=lifespan)
    origins = [
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RiotAPIError)
    async def riot_error(_: Request, exc: RiotAPIError):
        return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

    def game(request: Request) -> GameService:
        return request.app.state.game

    @app.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/players", response_model=list[PublicPlayer])
    async def players(request: Request):
        return game(request).public_players()

    @app.post("/api/v1/rounds", response_model=RoundResponse)
    async def create_round(request: Request):
        return await game(request).create_round()

    def submit_answer(request: Request, round_id: str, player_id: str | None):
        try:
            return game(request).answer(round_id, player_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except TimeoutError as exc:
            raise HTTPException(410, str(exc)) from exc
        except (ValueError, LookupError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/v1/rounds/{round_id}/guess", response_model=GuessResponse)
    async def guess(round_id: str, body: GuessRequest, request: Request):
        return submit_answer(request, round_id, body.player_id)

    @app.post("/api/v1/rounds/{round_id}/skip", response_model=GuessResponse)
    async def skip(round_id: str, request: Request):
        return submit_answer(request, round_id, None)

    return app


app = create_app()
