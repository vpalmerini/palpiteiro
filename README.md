# Bolao da Copa

Aplicacao web para validar a experiencia de criacao e participacao em boloes de futebol.

## Stack

- Backend: Python, Flask, SQLAlchemy
- Frontend: Next.js
- Banco: PostgreSQL

## Rodando localmente

Suba banco, backend e frontend com Docker Compose:

```bash
docker compose up -d
```

O backend inicializa as tabelas e cria dados de exemplo automaticamente. Depois abra `http://localhost:3000`.

Para acompanhar os logs:

```bash
docker compose logs -f
```

Para parar tudo:

```bash
docker compose down
```

Para parar e apagar o volume do banco:

```bash
docker compose down -v
```

Servicos expostos:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5001`
- Postgres: `localhost:5432`

### Rodando Sem Docker Compose

Se quiser rodar manualmente, suba apenas o Postgres e execute backend/frontend em terminais separados:

```bash
docker compose up -d postgres
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
flask --app run init-db
flask --app run seed-db
flask --app run run --port 5001
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Fluxos Implementados

- Criar bolao com nome, descricao, criador e premios para os tres primeiros lugares.
- Compartilhar link publico do bolao.
- Entrar no bolao com nome e e-mail opcional, sem autenticacao completa.
- Registrar palpites por partida antes do horario de inicio.
- Em mata-mata, palpite empatado assume pênaltis e exige indicar o vencedor.
- Cadastrar resultados via API administrativa.
- Calcular ranking automaticamente com criterios de pontuacao do bolao.

## Endpoints Principais

- `POST /api/admin/seed`: cria torneio, times, fases e jogos de exemplo.
- `POST /api/pools`: cria um bolao.
- `GET /api/pools/{slug}`: busca detalhes do bolao.
- `POST /api/pools/{slug}/join`: entra no bolao.
- `GET /api/pools/{slug}/matches`: lista partidas do torneio.
- `POST /api/pools/{slug}/predictions`: cria ou atualiza palpite.
- `GET /api/pools/{slug}/ranking`: calcula e retorna ranking.
- `POST /api/admin/matches/{id}/result`: cadastra resultado oficial.

Exemplo de cadastro de resultado:

```bash
curl -X POST http://localhost:5001/api/admin/matches/1/result \
  -H "Content-Type: application/json" \
  -d '{"homeScore":2,"awayScore":1}'
```

Em jogos de mata-mata, um resultado empatado tambem assume decisao por penaltis:

```bash
curl -X POST http://localhost:5001/api/admin/matches/3/result \
  -H "Content-Type: application/json" \
  -d '{"homeScore":1,"awayScore":1,"penaltyWinnerTeamId":5}'
```
