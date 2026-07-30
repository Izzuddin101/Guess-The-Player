import type { Match } from "../types";

const fallback = (event: React.SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.style.visibility = "hidden";
};

export function MatchCard({ match, stage }: { match: Match; stage: number }) {
  const minutes = Math.floor(match.durationSeconds / 60);
  const seconds = String(match.durationSeconds % 60).padStart(2, "0");
  const won = match.result === "win";

  return (
    <article className="match-card" data-result={match.result}>
      <header className="match-card__champion">
        <div className="champion-portrait">
          {match.champion ? (
            <img
              src={match.champion.iconUrl}
              alt={`${match.champion.name} champion`}
              onError={fallback}
              width="256"
              height="256"
            />
          ) : (
            <div className="champion-unknown" aria-label="Champion hidden">?</div>
          )}
        </div>
        <div className="champion-copy">
          <p className="mono-label">{match.queueLabel ?? `Clue ${stage} of 4`}</p>
          <h2>{match.champion?.name ?? "Unknown champion"}</h2>
          <div className="match-meta">
            <span className="match-result">{won ? "Victory" : "Defeat"}</span>
            <span>{minutes}:{seconds}</span>
          </div>
        </div>
      </header>

      <div className="match-card__body">
        <section className="kda-readout" aria-label="Combat statistics">
          <div>
            <p className="mono-label">Kills / deaths / assists</p>
            <p className="kda-readout__line">{match.kills} / {match.deaths} / {match.assists}</p>
          </div>
          <div className="kda-readout__ratio">
            <p>{match.kda.toFixed(2)}</p>
            <span>KDA</span>
          </div>
        </section>

        <dl className="evidence-table">
          <Stat
            label="Creep score"
            value={match.creepScore === null ? null : String(match.creepScore)}
            note="lane + jungle"
          />
          <Stat
            label="Vision score"
            value={match.visionScore === null ? null : String(match.visionScore)}
            note="wards + denial"
          />
          <Stat label="Duration" value={`${minutes}:${seconds}`} note="minutes played" />
        </dl>

        <section className="loadout" aria-label="Match loadout">
          <div className="loadout__build">
            <AssetGroup label="Final build" assets={match.items} locked={stage < 4} />
          </div>
          <AssetGroup label="Spells" assets={match.summonerSpells} locked={stage < 3} />
          <AssetGroup
            label="Keystone"
            assets={match.mainRune ? [match.mainRune] : []}
            locked={stage < 3}
            round
          />
        </section>
      </div>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string | null; note: string }) {
  return (
    <div data-locked={value === null ? true : undefined}>
      <dt>{label}</dt>
      <dd>{value ?? "Locked"}</dd>
      <span>{note}</span>
    </div>
  );
}

function AssetGroup({
  label,
  assets,
  locked = false,
  round = false,
}: {
  label: string;
  assets: Match["items"];
  locked?: boolean;
  round?: boolean;
}) {
  return (
    <div className="asset-group">
      <p>{label}</p>
      <div className="asset-row">
        {locked ? (
          <span className="asset-empty">Locked</span>
        ) : assets.length ? (
          assets.map((asset) => (
            <img
              key={asset.id}
              src={asset.iconUrl}
              alt=""
              onError={fallback}
              loading="lazy"
              width="44"
              height="44"
              className={round ? "asset-icon asset-icon--round" : "asset-icon"}
            />
          ))
        ) : (
          <span className="asset-empty">None</span>
        )}
      </div>
    </div>
  );
}
