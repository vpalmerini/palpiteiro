"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createPool } from "@/lib/api";

export default function NewPoolPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const pool = await createPool({
        name: String(form.get("name")),
        description: String(form.get("description")),
        creatorName: String(form.get("creatorName")),
        prizes: [1, 2, 3].map((position) => ({
          position,
          description: String(form.get(`prize${position}`)),
        })),
      });
      router.push(`/pools/${pool.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel criar o bolao.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div>
        <span className="pill">Novo bolao</span>
        <h1 style={{ fontSize: "2.8rem", marginTop: 12 }}>Configure a experiencia</h1>
        <p>Defina o nome, os premios e compartilhe o link publico com os participantes.</p>
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <label>
          Nome do bolao
          <input name="name" required placeholder="Bolao da firma" />
        </label>
        <label>
          Nome do criador
          <input name="creatorName" required placeholder="Victor" />
        </label>
        <label>
          Descricao
          <textarea name="description" rows={4} placeholder="Regras combinadas, valor de entrada, observacoes..." />
        </label>
        <div className="grid">
          <label>
            Premio 1o lugar
            <input name="prize1" required placeholder="R$ 500" />
          </label>
          <label>
            Premio 2o lugar
            <input name="prize2" required placeholder="R$ 250" />
          </label>
          <label>
            Premio 3o lugar
            <input name="prize3" required placeholder="R$ 100" />
          </label>
        </div>
        {error ? <p className="notice">{error}</p> : null}
        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Criando..." : "Criar bolao"}
        </button>
      </form>
    </section>
  );
}
