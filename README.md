# Palpiteiro

Aplicação web para criar e participar de bolões de futebol.

## Stack

- **Backend:** Python, Flask, SQLAlchemy, Alembic
- **Frontend:** Next.js (TypeScript)
- **Banco:** PostgreSQL

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) e Docker Compose
- [Node.js](https://nodejs.org/) 18+ (só para rodar frontend sem Docker)
- Python 3.12+ (só para rodar backend sem Docker)

## Rodando com Docker Compose

A forma mais rápida. Sobe Postgres, backend e frontend de uma vez:

```bash
docker compose up -d
```

O backend aplica as migrations e popula dados de exemplo automaticamente. Abra `http://localhost:3000`.

```bash
# Acompanhar logs
docker compose logs -f

# Parar tudo
docker compose down

# Parar e apagar o volume do banco
docker compose down -v
```

Serviços expostos:

| Serviço  | URL                         |
|----------|-----------------------------|
| Frontend | http://localhost:3000       |
| Backend  | http://localhost:5001       |
| Postgres | localhost:5432              |

## Rodando sem Docker Compose

### Banco de dados

```bash
docker compose up -d postgres
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # ajuste GOOGLE_CLIENT_ID e JWT_SECRET
flask --app run db upgrade
flask --app run seed-db         # opcional — popula dados de exemplo
flask --app run run --port 5001
```

Variáveis de ambiente relevantes (ver `backend/.env.example`):

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL do Postgres (padrão: `postgresql+psycopg://bolao:bolao@localhost:5432/bolao`) |
| `FRONTEND_ORIGIN` | Origem permitida no CORS (padrão: `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Client ID do Google OAuth |
| `JWT_SECRET` | Segredo para assinar cookies de sessão |
| `FOOTBALL_DATA_API_KEY` | Chave da API [football-data.org](https://www.football-data.org/) — necessária para sincronização automática de placares |

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # ajuste NEXT_PUBLIC_GOOGLE_CLIENT_ID
npm run dev
```

Variáveis de ambiente relevantes (ver `frontend/.env.local.example`):

| Variável | Descrição |
|----------|-----------|
| `FLASK_API_URL` | URL do backend usada pelo proxy Next.js (padrão: `http://localhost:5001`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client ID do Google OAuth (exposto ao browser) |

## Sincronização automática de placares

Os placares das partidas são sincronizados automaticamente via [football-data.org](https://www.football-data.org/) v4.

### Configuração inicial (one-shot)

Após aplicar as migrations em produção, execute **uma vez** para vincular os times e partidas com seus IDs externos:

```bash
flask --app run link-external-ids
```

Isso preenche `Team.external_id` e `Match.external_id` sem chamar nada de manual. O comando é idempotente — pode ser re-executado sem efeito colateral.

### Cron de sincronização

O comando `sync-results` roda de hora em hora no Railway:

```bash
flask --app run sync-results
```

O fluxo a cada execução:
1. Busca partidas não-finalizadas que começaram há ≥2h (janela de lookback de 24h).
2. Se não houver candidatas, encerra sem chamar a API.
3. Consulta a API para o período e aplica o placar das partidas com `status: FINISHED`.
4. Recalcula pontuações de todos os pools automaticamente.

Partidas de mata-mata cujos times ainda não estão definidos são ignoradas e vinculadas nas execuções seguintes.

## Migrations (Alembic)

O schema é versionado com [Alembic](https://alembic.sqlalchemy.org/) via Flask-Migrate. Os arquivos ficam em `backend/migrations/versions/`.

```bash
cd backend

# Aplicar migrations pendentes
flask --app run db upgrade

# Criar nova migration após alterar models.py
flask --app run db migrate -m "descricao da mudanca"

# Ver revisão atual
flask --app run db current

# Histórico de revisões
flask --app run db history
```

### Banco novo

```bash
flask --app run db upgrade
flask --app run seed-db   # opcional
```
