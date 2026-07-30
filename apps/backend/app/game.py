import random
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from .models import (
    GuessResponse,
    PlayerConfig,
    PublicMatch,
    PublicPlayer,
    RevealedMatch,
    RoundRecord,
    RoundResponse,
)
from .riot import RiotAPIError, RiotClient, is_valid_match, participant_for, public_match

STAGE_SCORES = {1: 1000, 2: 700, 3: 400, 4: 200}


def reveal_match(match: PublicMatch, stage: int) -> RevealedMatch:
    return RevealedMatch(
        queue_label=match.queue_label if stage >= 4 else None,
        result=match.result,
        champion=match.champion if stage >= 4 else None,
        kills=match.kills,
        deaths=match.deaths,
        assists=match.assists,
        kda=match.kda,
        creep_score=match.creep_score if stage >= 3 else None,
        vision_score=match.vision_score if stage >= 3 else None,
        duration_seconds=match.duration_seconds,
        items=match.items if stage >= 2 else [],
        summoner_spells=match.summoner_spells if stage >= 3 else [],
        main_rune=match.main_rune if stage >= 2 else None,
    )


class GameService:
    def __init__(
        self,
        players: list[PlayerConfig],
        riot: RiotClient,
        rng: random.Random | None = None,
        round_ttl_minutes: int = 10,
    ):
        self.players = players
        self.riot = riot
        self.rng = rng or random.Random()
        self.round_ttl = timedelta(minutes=round_ttl_minutes)
        self.rounds: dict[str, RoundRecord] = {}

    def public_players(self) -> list[PublicPlayer]:
        return [
            PublicPlayer(id=player.id, display_name=player.display_name)
            for player in self.players
        ]

    async def create_round(self) -> RoundResponse:
        targets = self.players.copy()
        self.rng.shuffle(targets)
        for player in targets:
            puuid = await self.riot.resolve_puuid(player)
            match_ids = await self.riot.recent_matches(
                puuid, player.regional_route
            )
            self.rng.shuffle(match_ids)
            for match_id in match_ids:
                match = await self.riot.match(match_id, player.regional_route)
                participant = participant_for(match, puuid)
                if participant and is_valid_match(match):
                    assets = await self.riot.asset_catalog()
                    return self._store_round(
                        player, public_match(match, participant, assets)
                    )
        raise RiotAPIError(404, "No eligible recent matches were found")

    def _store_round(self, answer: PlayerConfig, match: PublicMatch) -> RoundResponse:
        choices = self.players.copy()
        self.rng.shuffle(choices)
        round_id = str(uuid4())
        expires_at = datetime.now(UTC) + self.round_ttl
        record = RoundRecord(
            answer_id=answer.id,
            expires_at=expires_at,
            match=match,
        )
        self.rounds[round_id] = record
        return RoundResponse(
            round_id=round_id,
            expires_at=expires_at,
            stage=record.stage,
            match=reveal_match(match, record.stage),
            choices=[
                PublicPlayer(id=choice.id, display_name=choice.display_name)
                for choice in choices
            ],
        )

    def answer(self, round_id: str, player_id: str | None) -> GuessResponse:
        record = self.rounds.get(round_id)
        if not record:
            raise KeyError("Round not found")
        if datetime.now(UTC) >= record.expires_at:
            self.rounds.pop(round_id, None)
            raise TimeoutError("Round expired")
        if record.complete:
            raise ValueError("Round already complete")
        if player_id is not None and player_id not in {
            player.id for player in self.players
        }:
            raise LookupError("Player is not a valid choice")
        if player_id in record.guessed_player_ids:
            raise ValueError("Player was already guessed")

        answer = next(player for player in self.players if player.id == record.answer_id)
        correct = player_id == answer.id
        if player_id is None:
            record.stage = 4
            record.complete = True
        else:
            record.guessed_player_ids.append(player_id)
            if correct or record.stage == 4:
                record.complete = True
            else:
                record.stage += 1

        score = STAGE_SCORES[record.stage] if correct else 0
        return GuessResponse(
            correct=correct,
            complete=record.complete,
            stage=record.stage,
            answer=(
                PublicPlayer(id=answer.id, display_name=answer.display_name)
                if record.complete
                else None
            ),
            score_delta=score,
            match=reveal_match(record.match, 4 if record.complete else record.stage),
        )
