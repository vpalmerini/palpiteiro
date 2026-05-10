"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { getMatches, getPool, getPredictions, savePrediction } from "@/lib/api";
import type { Match, Pool, Prediction } from "@/types";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export default function PredictionsPage({ params }: PageProps) {
  const [slug, setSlug] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, { homeScore: string; awayScore: string }>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    const storedParticipantId = window.localStorage.getItem(`bolao:${slug}:participantId`);
    void Promise.all([
      getPool(slug),
      getMatches(slug),
      storedParticipantId ? getPredictions(slug, storedParticipantId) : Promise.resolve([]),
    ]).then(([poolData, matchData, predictionData]) => {
      setParticipantId(storedParticipantId);
      setPool(poolData);
      setMatches(matchData);
      setPredictions(Object.fromEntries(predictionData.map((prediction) => [prediction.matchId, prediction])));
      setScoreDrafts(
        Object.fromEntries(
          predictionData.map((prediction) => [
            prediction.matchId,
            {
              homeScore: String(prediction.homeScore),
              awayScore: String(prediction.awayScore),
            },
          ]),
        ),
      );
    });
  }, [slug]);

  function updateScoreDraft(matchId: number, field: "homeScore" | "awayScore", value: string) {
    setScoreDrafts((current) => ({
      ...current,
      [matchId]: {
        homeScore: current[matchId]?.homeScore ?? "",
        awayScore: current[matchId]?.awayScore ?? "",
        [field]: value,
      },
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>, match: Match) {
    event.preventDefault();
    if (!participantId) {
      setMessage("Entre no bolao antes de palpitar.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const penaltyWinnerTeamId = form.get("penaltyWinnerTeamId");
    const saved = await savePrediction(slug, {
      participantId,
      matchId: match.id,
      homeScore: Number(form.get("homeScore")),
      awayScore: Number(form.get("awayScore")),
      penaltyWinnerTeamId: penaltyWinnerTeamId ? Number(penaltyWinnerTeamId) : null,
    });

    setPredictions((current) => ({ ...current, [saved.matchId]: saved }));
    setMessage("Palpite salvo.");
  }

  if (!pool) {
    return <p>Carregando palpites...</p>;
  }

  return (
    <div className="stack">
      <section className="card stack">
        <span className="pill">Palpites</span>
        <h1 style={{ fontSize: "3rem" }}>{pool.name}</h1>
        <p>
          Registre placares antes do inicio de cada jogo. Em mata-mata, palpite empatado significa decisao nos penaltis.
        </p>
        <Link className="button secondary" href={`/pools/${slug}`}>
          Voltar ao ranking
        </Link>
        {!participantId ? <p className="notice">Entre no bolao antes de registrar palpites.</p> : null}
        {message ? <p className="notice">{message}</p> : null}
      </section>

      {matches.map((match) => {
        const prediction = predictions[match.id];
        const draft = scoreDrafts[match.id];
        const homeScore = draft?.homeScore ?? (prediction ? String(prediction.homeScore) : "");
        const awayScore = draft?.awayScore ?? (prediction ? String(prediction.awayScore) : "");
        const isPredictedKnockoutDraw =
          match.stage.isKnockout && homeScore !== "" && awayScore !== "" && Number(homeScore) === Number(awayScore);

        return (
          <section className="card stack" key={match.id}>
            <div>
              <span className="pill">{match.stage.name}</span>
              <h2>
                {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
              </h2>
              <p>
                Fecha em {new Date(match.startsAt).toLocaleString("pt-BR")} ·{" "}
                {match.isLocked ? "bloqueado" : "aberto"}
              </p>
            </div>

            <form className="stack" onSubmit={(event) => onSubmit(event, match)}>
              <div className="grid">
                <label>
                  Gols {match.homeTeam?.shortName ?? "mandante"}
                  <input
                    disabled={match.isLocked}
                    min={0}
                    name="homeScore"
                    onChange={(event) => updateScoreDraft(match.id, "homeScore", event.target.value)}
                    required
                    type="number"
                    value={homeScore}
                  />
                </label>
                <label>
                  Gols {match.awayTeam?.shortName ?? "visitante"}
                  <input
                    disabled={match.isLocked}
                    min={0}
                    name="awayScore"
                    onChange={(event) => updateScoreDraft(match.id, "awayScore", event.target.value)}
                    required
                    type="number"
                    value={awayScore}
                  />
                </label>
              </div>

              {match.stage.isKnockout ? (
                <div className="stack">
                  <p>
                    Se o palpite for empate, o jogo sera considerado decidido nos penaltis. Nesse caso, escolha o
                    vencedor abaixo.
                  </p>
                  <label>
                    Vencedor nos penaltis
                    <select
                      defaultValue={prediction?.penaltyWinnerTeamId ?? ""}
                      disabled={match.isLocked || !isPredictedKnockoutDraw}
                      name="penaltyWinnerTeamId"
                      required={isPredictedKnockoutDraw}
                    >
                      <option value="">Selecione se o placar for empate</option>
                      {match.homeTeam ? <option value={match.homeTeam.id}>{match.homeTeam.name}</option> : null}
                      {match.awayTeam ? <option value={match.awayTeam.id}>{match.awayTeam.name}</option> : null}
                    </select>
                  </label>
                </div>
              ) : null}

              <button className="button" disabled={match.isLocked || !participantId} type="submit">
                {prediction ? "Atualizar palpite" : "Salvar palpite"}
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
