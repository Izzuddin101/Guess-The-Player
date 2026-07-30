import json
import random
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import load_players
from app.game import GameService
from app.main import create_app
from app.models import PlayerConfig, PublicMatch, Champion, Asset


class FakeRiot:
    async def asset_catalog(self):
        return {
            "items": {3006: "https://assets/boots.png"},
            "summoner-spells": {
                4: "https://assets/flash.png",
                7: "https://assets/heal.png",
            },
            "perk-images": {8005: "https://assets/press-the-attack.png"},
        }

    async def resolve_puuid(self, player):
        return f"puuid-{player.id}"

    async def recent_matches(self, puuid, route):
        return [f"match-{puuid}"]

    async def match(self, match_id, route):
        puuid = match_id.removeprefix("match-")
        return {
            "info": {
                "queueId": 420,
                "gameDuration": 1000,
                "gameEndedInEarlySurrender": False,
                "participants": [
                    {
                        "puuid": puuid,
                        "championId": 22,
                        "championName": "Ashe",
                        "win": True,
                        "kills": 7,
                        "deaths": 2,
                        "assists": 9,
                        "totalMinionsKilled": 180,
                        "neutralMinionsKilled": 0,
                        "visionScore": 12,
                        "summoner1Id": 4,
                        "summoner2Id": 7,
                        "item0": 3006,
                        "perks": {"styles": [{"selections": [{"perk": 8005}]}]},
                    }
                ],
            }
        }


def players():
    return [
        PlayerConfig.model_validate(
            {
                "id": f"player-{letter}",
                "displayName": name,
                "gameName": f"private-{letter}",
                "tagLine": "TAG",
                "platformRegion": "euw1",
                "regionalRoute": "europe",
            }
        )
        for letter, name in zip(
            "abcdef", ("Zeyad", "Maya", "Omar", "Lina", "Noah", "Sara")
        )
    ]


def make_client():
    service = GameService(players(), FakeRiot(), random.Random(4))
    return TestClient(create_app(service=service)), service


def test_player_config_accepts_four_to_ten_players(tmp_path, monkeypatch):
    path = tmp_path / "players.json"
    path.write_text(
        json.dumps([player.model_dump(by_alias=True) for player in players()[:5]])
    )
    monkeypatch.setenv("PLAYERS_CONFIG_PATH", str(path))
    assert len(load_players()) == 5

    too_many = [
        players()[index % 6].model_copy(update={"id": f"player-{index}"})
        for index in range(11)
    ]
    path.write_text(json.dumps([player.model_dump(by_alias=True) for player in too_many]))
    with pytest.raises(RuntimeError, match="4–10"):
        load_players()


def test_round_progressively_reveals_clues_and_scores():
    client, service = make_client()
    with client:
        response = client.post("/api/v1/rounds")
        assert response.status_code == 200
        body = response.json()
        assert len(body["choices"]) == 6
        assert body["stage"] == 1
        assert body["match"]["champion"] is None
        assert body["match"]["queueLabel"] is None
        assert body["match"]["creepScore"] is None
        assert body["match"]["visionScore"] is None
        assert body["match"]["items"] == []
        assert body["match"]["summonerSpells"] == []
        assert body["match"]["mainRune"] is None
        serialized = response.text
        for private in ("puuid", "private-", "gameName", "tagLine", "answerId"):
            assert private not in serialized

        answer_id = service.rounds[body["roundId"]].answer_id
        wrong_ids = [
            choice["id"] for choice in body["choices"] if choice["id"] != answer_id
        ]

        stage_two = client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": wrong_ids[0]},
        ).json()
        assert stage_two["complete"] is False
        assert stage_two["answer"] is None
        assert stage_two["stage"] == 2
        assert stage_two["match"]["creepScore"] == 180
        assert stage_two["match"]["visionScore"] == 12
        assert stage_two["match"]["summonerSpells"] == []

        stage_three = client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": wrong_ids[1]},
        ).json()
        assert stage_three["stage"] == 3
        assert stage_three["match"]["summonerSpells"][0]["iconUrl"] == (
            "https://assets/flash.png"
        )
        assert stage_three["match"]["mainRune"]["iconUrl"] == (
            "https://assets/press-the-attack.png"
        )
        assert stage_three["match"]["items"] == []

        stage_four = client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": wrong_ids[2]},
        ).json()
        assert stage_four["stage"] == 4
        assert stage_four["complete"] is False
        assert stage_four["match"]["champion"]["name"] == "Ashe"
        assert stage_four["match"]["items"][0]["iconUrl"] == (
            "https://assets/boots.png"
        )

        result = client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": answer_id},
        )
        assert result.status_code == 200
        assert result.json()["correct"] is True
        assert result.json()["complete"] is True
        assert result.json()["scoreDelta"] == 200
        assert result.json()["answer"]["id"] == answer_id
        assert client.post(
            f"/api/v1/rounds/{body['roundId']}/skip"
        ).status_code == 409


def test_first_stage_correct_scores_one_thousand():
    client, service = make_client()
    with client:
        body = client.post("/api/v1/rounds").json()
        answer_id = service.rounds[body["roundId"]].answer_id
        result = client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": answer_id},
        ).json()
        assert result["correct"] is True
        assert result["scoreDelta"] == 1000
        assert result["match"]["champion"] is not None


def test_guess_validation_expiration_and_missing_round():
    client, service = make_client()
    with client:
        body = client.post("/api/v1/rounds").json()
        assert client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": "not-a-player"},
        ).status_code == 409

        valid_id = body["choices"][0]["id"]
        first = client.post(
            f"/api/v1/rounds/{body['roundId']}/guess",
            json={"playerId": valid_id},
        )
        if first.json()["complete"] is False:
            assert client.post(
                f"/api/v1/rounds/{body['roundId']}/guess",
                json={"playerId": valid_id},
            ).status_code == 409

        service.rounds[body["roundId"]].expires_at = datetime.now(UTC) - timedelta(seconds=1)
        assert client.post(
            f"/api/v1/rounds/{body['roundId']}/skip"
        ).status_code == 410
        assert client.post("/api/v1/rounds/missing/skip").status_code == 404
