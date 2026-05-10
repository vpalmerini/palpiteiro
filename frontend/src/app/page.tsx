import Link from "next/link";

export default function Home() {
  return (
    <section className="hero">
      <div className="stack">
        <span className="pill">MVP Copa do Mundo</span>
        <h1>Crie seu bolão e acompanhe cada palpite.</h1>
        <p>
          Convide participantes por link público, colete palpites por fase, acompanhe o ranking e deixe
          claros os prêmios dos três primeiros colocados.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="button" href="/pools/new">
            Criar um bolão
          </Link>
        </div>
      </div>
      <aside className="card stack">
        <h2>Fluxo do MVP</h2>
        <p>1. Cadastre torneio e jogos via admin da API.</p>
        <p>2. Crie o bolão com prêmios e regras.</p>
        <p>3. Compartilhe o link e receba palpites.</p>
        <p>4. Registre resultados e veja o ranking.</p>
      </aside>
    </section>
  );
}
