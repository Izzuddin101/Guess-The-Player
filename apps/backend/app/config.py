import json
import os
from pathlib import Path

from .models import PlayerConfig


def load_players() -> list[PlayerConfig]:
    default_path = Path(__file__).parents[3] / "config" / "players.json"
    example_path = Path(__file__).parents[3] / "config" / "players.example.json"
    path = Path(os.getenv("PLAYERS_CONFIG_PATH", default_path))
    if not path.exists():
        path = example_path
    players = [PlayerConfig.model_validate(item) for item in json.loads(path.read_text())]
    if not 4 <= len(players) <= 10:
        raise RuntimeError("Player configuration must contain 4–10 players")
    if len({player.id for player in players}) != len(players):
        raise RuntimeError("Player IDs must be unique")
    return players
