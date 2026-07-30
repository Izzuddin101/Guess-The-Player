import json

import httpx
import pytest

from app.models import PlayerConfig
from app.riot import RiotClient, is_valid_match, participant_for, public_match


def player() -> PlayerConfig:
    return PlayerConfig.model_validate(
        {
            "id": "a",
            "displayName": "Visible",
            "gameName": "Private Name",
            "tagLine": "EUW",
            "platformRegion": "euw1",
            "regionalRoute": "europe",
        }
    )


@pytest.mark.asyncio
async def test_resolves_riot_id_and_caches_account():
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json={"puuid": "secret-puuid"})

    client = RiotClient("key", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await client.resolve_puuid(player()) == "secret-puuid"
    assert await client.resolve_puuid(player()) == "secret-puuid"
    assert len(calls) == 1
    assert "Private%20Name/EUW" in calls[0]


@pytest.mark.asyncio
async def test_retries_rate_limit_with_retry_after():
    attempts = 0
    waits = []

    def handler(_):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, headers={"Retry-After": "2"})
        return httpx.Response(200, json={"puuid": "ok"})

    async def sleep(seconds):
        waits.append(seconds)

    client = RiotClient(
        "key", httpx.AsyncClient(transport=httpx.MockTransport(handler)), sleep=sleep
    )
    assert await client.resolve_puuid(player()) == "ok"
    assert waits == [2.0]


@pytest.mark.asyncio
async def test_recent_matches_are_not_restricted_to_a_queue():
    requested_url = ""

    def handler(request):
        nonlocal requested_url
        requested_url = str(request.url)
        return httpx.Response(200, json=["EUN1_1"])

    client = RiotClient("key", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await client.recent_matches("puuid", "europe") == ["EUN1_1"]
    assert "queue=" not in requested_url


@pytest.mark.asyncio
async def test_static_asset_catalog_resolves_icon_paths_and_caches():
    calls = []
    payloads = {
        "items.json": [
            {
                "id": 6692,
                "iconPath": "/lol-game-data/assets/ASSETS/Items/Icons2D/Eclipse.png",
            }
        ],
        "summoner-spells.json": [
            {
                "id": 4,
                "iconPath": "/lol-game-data/assets/DATA/Spells/Icons2D/Summoner_flash.png",
            }
        ],
        "perks.json": [
            {
                "id": 8112,
                "iconPath": "/lol-game-data/assets/v1/perk-images/Styles/Domination/Electrocute.png",
            }
        ],
    }

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json=payloads[request.url.path.rsplit("/", 1)[-1]])

    client = RiotClient("key", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    catalog = await client.asset_catalog()
    assert await client.asset_catalog() is catalog
    assert len(calls) == 3
    assert catalog["items"][6692].endswith(
        "/assets/items/icons2d/eclipse.png"
    )
    assert catalog["summoner-spells"][4].endswith(
        "/data/spells/icons2d/summoner_flash.png"
    )
    assert catalog["perk-images"][8112].endswith(
        "/v1/perk-images/styles/domination/electrocute.png"
    )


def test_match_helpers_filter_find_and_sanitize():
    match = {
        "metadata": {"participants": ["secret-puuid"]},
        "info": {
            "queueId": 420,
            "gameDuration": 1204,
            "gameEndedInEarlySurrender": False,
            "participants": [
                {
                    "puuid": "secret-puuid",
                    "riotIdGameName": "Private Name",
                    "championId": 121,
                    "championName": "Khazix",
                    "win": True,
                    "kills": 5,
                    "deaths": 3,
                    "assists": 2,
                    "totalMinionsKilled": 100,
                    "neutralMinionsKilled": 42,
                    "visionScore": 18,
                    "summoner1Id": 4,
                    "summoner2Id": 11,
                    "item0": 6692,
                    "item1": 3118,
                    "item2": 0,
                    "perks": {
                        "styles": [{"selections": [{"perk": 8112}]}]
                    },
                }
            ],
        },
    }
    participant = participant_for(match, "secret-puuid")
    assert participant is not None
    assert is_valid_match(match)
    assets = {
        "items": {6692: "https://assets/item.png", 3118: "https://assets/item-2.png"},
        "summoner-spells": {
            4: "https://assets/flash.png",
            11: "https://assets/smite.png",
        },
        "perk-images": {8112: "https://assets/electrocute.png"},
    }
    safe = public_match(match, participant, assets).model_dump_json(by_alias=True)
    assert '"kda":2.33' in safe
    assert '"creepScore":142' in safe
    assert '"iconUrl":"https://assets/item.png"' in safe
    assert '"iconUrl":"https://assets/flash.png"' in safe
    assert '"iconUrl":"https://assets/electrocute.png"' in safe
    for private in ("secret-puuid", "Private Name", "riotIdGameName", "puuid"):
        assert private not in safe

    remake = json.loads(json.dumps(match))
    remake["info"]["gameDuration"] = 599
    assert not is_valid_match(remake)

    aram = json.loads(json.dumps(match))
    aram["info"]["queueId"] = 450
    assert is_valid_match(aram)
    assert public_match(aram, aram["info"]["participants"][0]).queue_label == "ARAM"

    no_runes = json.loads(json.dumps(match))
    no_runes["info"]["participants"][0]["perks"] = {}
    assert public_match(
        no_runes, no_runes["info"]["participants"][0]
    ).main_rune is None
