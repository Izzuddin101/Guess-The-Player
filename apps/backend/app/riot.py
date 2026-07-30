import asyncio
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import httpx

from .models import Asset, Champion, PlayerConfig, PublicMatch

CDRAGON_ROOT = (
    "https://raw.communitydragon.org/latest/plugins/"
    "rcp-be-lol-game-data/global/default"
)
AssetCatalog = dict[str, dict[int, str]]


class RiotAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(message)


class TTLCache:
    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self.values: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        cached = self.values.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        self.values.pop(key, None)
        return None

    def set(self, key: str, value: Any) -> Any:
        self.values[key] = (time.monotonic() + self.ttl_seconds, value)
        return value


class RiotClient:
    def __init__(
        self,
        api_key: str,
        client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Any] = asyncio.sleep,
    ):
        self.api_key = api_key
        self.client = client or httpx.AsyncClient(timeout=12)
        self._owns_client = client is None
        self.sleep = sleep
        self.accounts = TTLCache(24 * 60 * 60)
        self.match_ids = TTLCache(2 * 60)
        self.matches = TTLCache(10 * 60)
        self.static_assets = TTLCache(24 * 60 * 60)

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()

    async def _get(self, url: str) -> Any:
        for attempt in range(3):
            response = await self.client.get(
                url, headers={"X-Riot-Token": self.api_key}
            )
            if response.status_code == 429 and attempt < 2:
                await self.sleep(float(response.headers.get("Retry-After", "1")))
                continue
            if response.status_code == 403:
                raise RiotAPIError(503, "Riot API credentials were rejected")
            if response.status_code == 404:
                raise RiotAPIError(404, "Riot player or match was not found")
            if response.status_code >= 500:
                raise RiotAPIError(503, "Riot API is temporarily unavailable")
            if response.is_error:
                raise RiotAPIError(502, "Riot API request failed")
            return response.json()
        raise RiotAPIError(503, "Riot API rate limit exceeded")

    async def resolve_puuid(self, player: PlayerConfig) -> str:
        cache_key = f"{player.regional_route}:{player.game_name}#{player.tag_line}"
        if cached := self.accounts.get(cache_key):
            return cached
        game_name = quote(player.game_name, safe="")
        tag_line = quote(player.tag_line, safe="")
        data = await self._get(
            f"https://{player.regional_route}.api.riotgames.com"
            f"/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
        )
        return self.accounts.set(cache_key, data["puuid"])

    async def recent_matches(
        self, puuid: str, regional_route: str
    ) -> list[str]:
        cache_key = f"{regional_route}:{puuid}"
        if cached := self.match_ids.get(cache_key):
            return cached
        data = await self._get(
            f"https://{regional_route}.api.riotgames.com/lol/match/v5/matches/"
            f"by-puuid/{quote(puuid, safe='')}/ids?start=0&count=20"
        )
        return self.match_ids.set(cache_key, data)

    async def match(self, match_id: str, regional_route: str) -> dict[str, Any]:
        cache_key = f"{regional_route}:{match_id}"
        if cached := self.matches.get(cache_key):
            return cached
        data = await self._get(
            f"https://{regional_route}.api.riotgames.com/lol/match/v5/matches/"
            f"{quote(match_id, safe='')}"
        )
        return self.matches.set(cache_key, data)

    async def asset_catalog(self) -> AssetCatalog:
        if cached := self.static_assets.get("catalog"):
            return cached

        async def load(filename: str) -> list[dict[str, Any]]:
            response = await self.client.get(f"{CDRAGON_ROOT}/v1/{filename}")
            if response.is_error:
                raise RiotAPIError(503, "League static assets are temporarily unavailable")
            return response.json()

        sources = {
            "items": "items.json",
            "summoner-spells": "summoner-spells.json",
            "perk-images": "perks.json",
        }
        payloads = await asyncio.gather(*(load(filename) for filename in sources.values()))
        catalog = {
            kind: {
                entry["id"]: icon_url(entry["iconPath"])
                for entry in payload
                if entry.get("id") and entry.get("iconPath")
            }
            for (kind, _), payload in zip(sources.items(), payloads)
        }
        return self.static_assets.set("catalog", catalog)


def asset_url(kind: str, asset_id: int) -> str:
    return (
        "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/"
        f"global/default/v1/{kind}/{asset_id}.png"
    )

def icon_url(icon_path: str) -> str:
    prefix = "/lol-game-data/assets/"
    return f"{CDRAGON_ROOT}/{icon_path.removeprefix(prefix).lower()}"


def participant_for(match: dict[str, Any], puuid: str) -> dict[str, Any] | None:
    return next(
        (p for p in match.get("info", {}).get("participants", []) if p.get("puuid") == puuid),
        None,
    )


def is_valid_match(match: dict[str, Any]) -> bool:
    info = match.get("info", {})
    return (
        info.get("gameDuration", 0) >= 600
        and not info.get("gameEndedInEarlySurrender", False)
    )


def public_match(
    match: dict[str, Any],
    participant: dict[str, Any],
    assets: AssetCatalog | None = None,
) -> PublicMatch:
    def resolved(kind: str, asset_id: int) -> str:
        return (assets or {}).get(kind, {}).get(asset_id, asset_url(kind, asset_id))

    item_ids = [
        participant.get(f"item{i}", 0)
        for i in range(7)
        if participant.get(f"item{i}", 0)
    ]
    perks = participant.get("perks", {}).get("styles", [])
    selections = perks[0].get("selections", []) if perks else []
    rune_id = selections[0].get("perk", 0) if selections else 0
    deaths = participant.get("deaths", 0)
    kills = participant.get("kills", 0)
    assists = participant.get("assists", 0)
    champion_id = participant["championId"]
    return PublicMatch(
        queue_label={
            0: "Custom",
            400: "Normal Draft",
            420: "Ranked Solo/Duo",
            430: "Normal Blind",
            440: "Ranked Flex",
            450: "ARAM",
            480: "Swiftplay",
            490: "Quickplay",
            700: "Clash",
            720: "ARAM Clash",
            830: "Co-op vs. AI",
            840: "Co-op vs. AI",
            850: "Co-op vs. AI",
            870: "Co-op vs. AI",
            880: "Co-op vs. AI",
            890: "Co-op vs. AI",
            900: "ARURF",
            1020: "One for All",
            1300: "Nexus Blitz",
            1400: "Ultimate Spellbook",
            1700: "Arena",
            1710: "Arena",
            1750: "Arena",
            1900: "Pick URF",
            2300: "Brawl",
            2400: "ARAM: Mayhem",
        }.get(match["info"].get("queueId"), f"Queue {match['info'].get('queueId', 'Unknown')}"),
        result="win" if participant.get("win") else "loss",
        champion=Champion(
            id=champion_id,
            name=participant.get("championName", "Unknown"),
            icon_url=asset_url("champion-icons", champion_id),
        ),
        kills=kills,
        deaths=deaths,
        assists=assists,
        kda=round((kills + assists) / max(1, deaths), 2),
        creep_score=participant.get("totalMinionsKilled", 0)
        + participant.get("neutralMinionsKilled", 0),
        vision_score=participant.get("visionScore", 0),
        duration_seconds=match["info"]["gameDuration"],
        items=[Asset(id=item_id, icon_url=resolved("items", item_id)) for item_id in item_ids],
        summoner_spells=[
            Asset(id=spell_id, icon_url=resolved("summoner-spells", spell_id))
            for spell_id in (participant.get("summoner1Id", 0), participant.get("summoner2Id", 0))
            if spell_id
        ],
        main_rune=(
            Asset(id=rune_id, icon_url=resolved("perk-images", rune_id))
            if rune_id
            else None
        ),
    )
