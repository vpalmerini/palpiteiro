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
flask --app run db upgrade
flask --app run seed-db
flask --app run run --port 5001
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Migrations (Alembic)

O schema do banco é versionado com [Alembic](https://alembic.sqlalchemy.org/) via Flask-Migrate. Os arquivos ficam em `backend/migrations/versions/`.

### Comandos do dia a dia

```bash
cd backend

# Aplicar migrations pendentes (local, Docker, deploy)
flask --app run db upgrade

# Depois de alterar models.py, gerar nova migration
flask --app run db migrate -m "descricao da mudanca"

# Ver revision atual
flask --app run db current

# Histórico
flask --app run db history
```

`flask --app run init-db` continua disponível como alias de `db upgrade`.

### Banco novo (dev)

```bash
flask --app run db upgrade
flask --app run seed-db   # opcional
```

### Supabase / produção com schema já existente

Confirme no SQL Editor que existem tabelas no plural (`teams`, `users`, …):

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
```

Se **já existem**, marque a revision inicial e aplique só o índice:

```bash
flask --app run stamp-db      # marca d129c90f03ee (não roda SQL)
flask --app run db upgrade    # aplica f8a1b2c3d4e5 (índice ix_teams_name_active)
```

### Erro `relation "teams" does not exist` no db upgrade

O banco foi marcado com `stamp` mas **não tem** o schema plural. Reset e recrie:

```bash
# 1. No Supabase SQL Editor (apaga tudo — só se puder perder os dados):
# DROP SCHEMA public CASCADE;
# CREATE SCHEMA public;
# GRANT ALL ON SCHEMA public TO postgres;
# GRANT ALL ON SCHEMA public TO public;

# 2. Local, com DATABASE_URL do Supabase:
flask --app run db stamp base    # limpa alembic_version
flask --app run db upgrade       # cria schema completo + índice
```

### Banco local antigo (tabelas no singular: `user`, `team`, …)

Esse schema não é compatível. Recrie o banco ou rode no Supabase:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Depois: `flask --app run db upgrade`.

### Deploy (Railway)

No startup do backend:

```bash
flask --app run db upgrade && gunicorn 'run:app' --bind 0.0.0.0:$PORT
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
