from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PlayerConfig(BaseModel):
    id: str
    display_name: str = Field(alias="displayName")
    game_name: str = Field(alias="gameName")
    tag_line: str = Field(alias="tagLine")
    platform_region: str = Field(alias="platformRegion")
    regional_route: str = Field(alias="regionalRoute")


class PublicPlayer(BaseModel):
    id: str
    display_name: str = Field(serialization_alias="displayName")


class Champion(BaseModel):
    id: int
    name: str
    icon_url: str = Field(serialization_alias="iconUrl")


class Asset(BaseModel):
    id: int
    icon_url: str = Field(serialization_alias="iconUrl")


class PublicMatch(BaseModel):
    queue_label: str = Field(serialization_alias="queueLabel")
    result: Literal["win", "loss"]
    champion: Champion
    kills: int
    deaths: int
    assists: int
    kda: float
    creep_score: int = Field(serialization_alias="creepScore")
    vision_score: int = Field(serialization_alias="visionScore")
    duration_seconds: int = Field(serialization_alias="durationSeconds")
    items: list[Asset]
    summoner_spells: list[Asset] = Field(serialization_alias="summonerSpells")
    main_rune: Asset | None = Field(serialization_alias="mainRune")


class RevealedMatch(BaseModel):
    queue_label: str | None = Field(default=None, serialization_alias="queueLabel")
    result: Literal["win", "loss"]
    champion: Champion | None = None
    kills: int
    deaths: int
    assists: int
    kda: float
    creep_score: int | None = Field(default=None, serialization_alias="creepScore")
    vision_score: int | None = Field(default=None, serialization_alias="visionScore")
    duration_seconds: int = Field(serialization_alias="durationSeconds")
    items: list[Asset] = Field(default_factory=list)
    summoner_spells: list[Asset] = Field(
        default_factory=list, serialization_alias="summonerSpells"
    )
    main_rune: Asset | None = Field(default=None, serialization_alias="mainRune")


class RoundResponse(BaseModel):
    round_id: str = Field(serialization_alias="roundId")
    expires_at: datetime = Field(serialization_alias="expiresAt")
    stage: int
    match: RevealedMatch
    choices: list[PublicPlayer]


class GuessRequest(BaseModel):
    player_id: str = Field(alias="playerId")


class GuessResponse(BaseModel):
    correct: bool
    complete: bool
    stage: int
    answer: PublicPlayer | None = None
    score_delta: int = Field(serialization_alias="scoreDelta")
    match: RevealedMatch


class RoundRecord(BaseModel):
    answer_id: str
    expires_at: datetime
    match: PublicMatch
    stage: int = 1
    guessed_player_ids: list[str] = Field(default_factory=list)
    complete: bool = False
