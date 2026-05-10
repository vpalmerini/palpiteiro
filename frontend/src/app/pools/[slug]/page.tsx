"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { getMatches, getPool, getRanking, joinPool } from "@/lib/api";
import type { Match, Pool, RankingEntry } from "@/types";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export default function PoolPage({ params }: PageProps) {
  const [slug, setSlug] = useState<string>("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    void Promise.all([getPool(slug), getMatches(slug), getRanking(slug)]).then(([poolData, matchData, rankingData]) => {
      setParticipantId(window.localStorage.getItem(`bolao:${slug}:participantId`));
      setPool(poolData);
      setMatches(matchData);
      setRanking(rankingData);
    });
  }, [slug]);

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined" || !slug) return "";
    return `${window.location.origin}/pools/${slug}`;
  }, [slug]);

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug) return;

    const form = new FormData(event.currentTarget);
    const result = await joinPool(slug, {
      name: String(form.get("name")),
      email: String(form.get("email") || ""),
      participantId: participantId ?? undefined,
    });
    window.localStorage.setItem(`bolao:${slug}:participantId`, result.participantId);
    setParticipantId(result.participantId);
    setMessage("Entrada confirmada. Agora voce ja pode registrar seus palpites.");
    setRanking(await getRanking(slug));
  }

  if (!pool) {
    return <p>Carregando bolao...</p>;
  }

  return (
    <div className="stack">
      <section className="card stack">
        <span className="pill">Link publico</span>
        <h1 style={{ fontSize: "3rem" }}>{pool.name}</h1>
        <p>{pool.description || "Sem descricao."}</p>
        <input readOnly value={publicUrl} onFocus={(event) => event.currentTarget.select()} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="button" href={`/pools/${slug}/predictions`}>
            Fazer palpites
          </Link>
        </div>
      </section>

      <div className="grid">
        <section className="card stack">
          <h2>Entrar no bolao</h2>
          {participantId ? <p className="notice">Voce ja esta participando neste navegador.</p> : null}
          <form className="stack" onSubmit={onJoin}>
            <label>
              Nome exibido
              <input name="name" required placeholder="Seu nome" />
            </label>
            <label>
              E-mail opcional
              <input name="email" type="email" placeholder="voce@email.com" />
            </label>
            {message ? <p className="notice">{message}</p> : null}
            <button className="button" type="submit">
              Participar
            </button>
          </form>
        </section>

        <section className="card stack">
          <h2>Premios</h2>
          {pool.prizes.map((prize) => (
            <p key={prize.position}>
              <strong>{prize.position}o lugar:</strong> {prize.description}
            </p>
          ))}
        </section>
      </div>

      <section className="card stack">
        <h2>Ranking</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Posicao</th>
              <th>Participante</th>
              <th>Pontos</th>
              <th>Placares exatos</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((entry) => (
              <tr key={entry.participantId}>
                <td>{entry.position}</td>
                <td>{entry.displayName}</td>
                <td>{entry.points}</td>
                <td>{entry.exactScores}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ranking.length === 0 ? <p>Nenhum participante ainda.</p> : null}
      </section>

      <section className="card stack">
        <h2>Proximos jogos</h2>
        {matches.map((match) => (
          <div className="card" key={match.id} style={{ boxShadow: "none" }}>
            <strong>
              {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
            </strong>
            <p>
              {match.stage.name} · {new Date(match.startsAt).toLocaleString("pt-BR")} ·{" "}
              {match.isLocked ? "palpites bloqueados" : "palpites abertos"}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
