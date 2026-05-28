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
