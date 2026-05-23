"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  adminCreateMatch,
  adminCreateStage,
  adminCreateTeam,
  adminCreateTournament,
  adminListMatches,
  adminListPools,
  adminListStages,
  adminListTeams,
  adminListTournaments,
  adminUpdateMatch,
  adminUpdateStage,
} from "@/lib/api";
import type { AdminPool, Match, Stage, Team, Tournament } from "@/types";

// ---------------------------------------------------------------------------
// Tournament selector
// ---------------------------------------------------------------------------

function TournamentSidebar({
  tournaments,
  selectedId,
  onSelect,
  onCreated,
}: {
  tournaments: Tournament[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreated: (t: Tournament) => void;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const t = await adminCreateTournament({ name: name.trim(), year: Number(year) });
      setName("");
      onCreated(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar torneio");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap={4} minW="220px">
      <Heading size="md">Torneios</Heading>
      <Stack gap={1}>
        {tournaments.map((t) => (
          <Button
            key={t.id}
            variant={selectedId === t.id ? "solid" : "ghost"}
            colorPalette={selectedId === t.id ? "blue" : "gray"}
            justifyContent="flex-start"
            onClick={() => onSelect(t.id)}
            size="sm"
          >
            {t.name} {t.year}
          </Button>
        ))}
        {tournaments.length === 0 && (
          <Text color="gray.500" fontSize="sm">
            Nenhum torneio cadastrado.
          </Text>
        )}
      </Stack>

      <Card.Root rounded="xl">
        <Card.Body gap={3}>
          <Card.Title fontSize="sm">Novo torneio</Card.Title>
          <form onSubmit={handleSubmit}>
            <Stack gap={3}>
              <Field.Root required>
                <Field.Label>Nome</Field.Label>
                <Input
                  size="sm"
                  placeholder="Copa do Mundo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Ano</Field.Label>
                <Input
                  size="sm"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </Field.Root>
              {error && <Text color="red.500" fontSize="sm">{error}</Text>}
              <Button type="submit" size="sm" colorPalette="blue" loading={submitting}>
                Criar
              </Button>
            </Stack>
          </form>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Teams panel (global)
// ---------------------------------------------------------------------------

function TeamsPanel({
  teams,
  onCreated,
}: {
  teams: Team[];
  onCreated: (t: Team) => void;
}) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const t = await adminCreateTeam({ name: name.trim(), shortName: shortName.trim().toUpperCase() });
      setName("");
      setShortName("");
      onCreated(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar time");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap={4}>
      <Heading size="sm">Times cadastrados</Heading>
      {teams.length === 0 ? (
        <Text color="gray.500" fontSize="sm">Nenhum time cadastrado.</Text>
      ) : (
        <Table.Root size="sm" variant="outline" rounded="xl" overflow="hidden">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Nome</Table.ColumnHeader>
              <Table.ColumnHeader>Sigla</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {teams.map((t) => (
              <Table.Row key={t.id}>
                <Table.Cell>{t.name}</Table.Cell>
                <Table.Cell>
                  <Badge variant="subtle">{t.shortName}</Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}

      <Card.Root rounded="xl">
        <Card.Body gap={3}>
          <Card.Title fontSize="sm">Novo time</Card.Title>
          <form onSubmit={handleSubmit}>
            <SimpleGrid columns={2} gap={3}>
              <Field.Root required>
                <Field.Label>Nome</Field.Label>
                <Input size="sm" placeholder="Brasil" value={name} onChange={(e) => setName(e.target.value)} />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Sigla</Field.Label>
                <Input
                  size="sm"
                  placeholder="BRA"
                  maxLength={12}
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                />
              </Field.Root>
            </SimpleGrid>
            {error && <Text color="red.500" fontSize="sm" mt={2}>{error}</Text>}
            <Button type="submit" size="sm" colorPalette="blue" mt={3} loading={submitting}>
              Criar time
            </Button>
          </form>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Stages panel
// ---------------------------------------------------------------------------

function StagesPanel({
  tournamentId,
  stages,
  onCreated,
  onUpdated,
}: {
  tournamentId: number;
  stages: Stage[];
  onCreated: (s: Stage) => void;
  onUpdated: (s: Stage) => void;
}) {
  const [name, setName] = useState("");
  const [order, setOrder] = useState(String(stages.length + 1));
  const [isKnockout, setIsKnockout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [editIsKnockout, setEditIsKnockout] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const s = await adminCreateStage(tournamentId, {
        name: name.trim(),
        order: Number(order),
        isKnockout,
      });
      setName("");
      setOrder(String(stages.length + 2));
      setIsKnockout(false);
      onCreated(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar fase");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(stage: Stage) {
    setEditingId(stage.id);
    setEditName(stage.name);
    setEditOrder(String(stage.order));
    setEditIsKnockout(stage.isKnockout);
  }

  async function saveEdit(stageId: number) {
    try {
      const s = await adminUpdateStage(stageId, {
        name: editName.trim(),
        order: Number(editOrder),
        isKnockout: editIsKnockout,
      });
      setEditingId(null);
      onUpdated(s);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar fase");
    }
  }

  const sorted = [...stages].sort((a, b) => a.order - b.order);

  return (
    <Stack gap={4}>
      <Heading size="sm">Fases</Heading>
      {sorted.length === 0 ? (
        <Text color="gray.500" fontSize="sm">Nenhuma fase cadastrada.</Text>
      ) : (
        <Table.Root size="sm" variant="outline" rounded="xl" overflow="hidden">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Ordem</Table.ColumnHeader>
              <Table.ColumnHeader>Nome</Table.ColumnHeader>
              <Table.ColumnHeader>Tipo</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sorted.map((stage) =>
              editingId === stage.id ? (
                <Table.Row key={stage.id}>
                  <Table.Cell>
                    <Input
                      size="xs"
                      type="number"
                      value={editOrder}
                      onChange={(e) => setEditOrder(e.target.value)}
                      w="16"
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Input size="xs" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </Table.Cell>
                  <Table.Cell>
                    <Checkbox.Root
                      checked={editIsKnockout}
                      onCheckedChange={(d) => setEditIsKnockout(Boolean(d.checked))}
                      size="sm"
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>Mata-mata</Checkbox.Label>
                    </Checkbox.Root>
                  </Table.Cell>
                  <Table.Cell>
                    <HStack gap={1}>
                      <Button size="xs" colorPalette="green" onClick={() => saveEdit(stage.id)}>Salvar</Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ) : (
                <Table.Row key={stage.id}>
                  <Table.Cell>{stage.order}</Table.Cell>
                  <Table.Cell>{stage.name}</Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={stage.isKnockout ? "purple" : "blue"} variant="subtle">
                      {stage.isKnockout ? "Mata-mata" : "Grupos"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Button size="xs" variant="ghost" onClick={() => startEdit(stage)}>Editar</Button>
                  </Table.Cell>
                </Table.Row>
              ),
            )}
          </Table.Body>
        </Table.Root>
      )}

      <Card.Root rounded="xl">
        <Card.Body gap={3}>
          <Card.Title fontSize="sm">Nova fase</Card.Title>
          <form onSubmit={handleCreate}>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
              <Field.Root required>
                <Field.Label>Nome</Field.Label>
                <Input size="sm" placeholder="Fase de grupos" value={name} onChange={(e) => setName(e.target.value)} />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Ordem</Field.Label>
                <Input size="sm" type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
              </Field.Root>
              <Field.Root>
                <Field.Label>Tipo</Field.Label>
                <Checkbox.Root
                  checked={isKnockout}
                  onCheckedChange={(d) => setIsKnockout(Boolean(d.checked))}
                  size="sm"
                  mt={1}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label>Mata-mata</Checkbox.Label>
                </Checkbox.Root>
              </Field.Root>
            </SimpleGrid>
            {error && <Text color="red.500" fontSize="sm" mt={2}>{error}</Text>}
            <Button type="submit" size="sm" colorPalette="blue" mt={3} loading={submitting}>
              Criar fase
            </Button>
          </form>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Matches panel
// ---------------------------------------------------------------------------

type MatchDraft = {
  stageId: string;
  homeTeamId: string;
  awayTeamId: string;
  startsAt: string;
};

type ResultDraft = {
  homeScore: string;
  awayScore: string;
  penaltyWinnerId: string;
};

function toLocalDatetimeValue(isoString: string) {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MatchRow({
  match,
  stages,
  teams,
  onUpdated,
}: {
  match: Match;
  stages: Stage[];
  teams: Team[];
  onUpdated: (m: Match) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [draft, setDraft] = useState<MatchDraft>({
    stageId: String(match.stage.id),
    homeTeamId: match.homeTeam ? String(match.homeTeam.id) : "",
    awayTeamId: match.awayTeam ? String(match.awayTeam.id) : "",
    startsAt: toLocalDatetimeValue(match.startsAt),
  });
  const [result, setResult] = useState<ResultDraft>({
    homeScore: match.homeScore !== null ? String(match.homeScore) : "",
    awayScore: match.awayScore !== null ? String(match.awayScore) : "",
    penaltyWinnerId: match.penaltyWinnerTeamId ? String(match.penaltyWinnerTeamId) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStage = stages.find((s) => s.id === match.stage.id);
  const isResultDraw =
    currentStage?.isKnockout &&
    result.homeScore !== "" &&
    result.awayScore !== "" &&
    Number(result.homeScore) === Number(result.awayScore);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await adminUpdateMatch(match.id, {
        stageId: Number(draft.stageId),
        homeTeamId: draft.homeTeamId ? Number(draft.homeTeamId) : null,
        awayTeamId: draft.awayTeamId ? Number(draft.awayTeamId) : null,
        startsAt: new Date(draft.startsAt).toISOString(),
      });
      onUpdated(updated);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function saveResult(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Parameters<typeof adminUpdateMatch>[1] = {
        homeScore: Number(result.homeScore),
        awayScore: Number(result.awayScore),
      };
      if (isResultDraw) {
        payload.penaltyWinnerTeamId = result.penaltyWinnerId ? Number(result.penaltyWinnerId) : null;
      }
      const updated = await adminUpdateMatch(match.id, payload);
      onUpdated(updated);
      setResultOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar resultado");
    } finally {
      setSaving(false);
    }
  }

  const statusColor = match.status === "finished" ? "green" : match.status === "live" ? "orange" : "gray";
  const statusLabel = match.status === "finished" ? "Encerrado" : match.status === "live" ? "Ao vivo" : "Agendado";

  return (
    <Card.Root rounded="xl" borderWidth="1px">
      <Card.Body gap={3}>
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Stack gap={1}>
            <HStack gap={2} flexWrap="wrap">
              <Badge colorPalette={match.stage.isKnockout ? "purple" : "blue"} variant="subtle" rounded="full">
                {match.stage.name}
              </Badge>
              <Badge colorPalette={statusColor} variant="subtle" rounded="full">
                {statusLabel}
              </Badge>
            </HStack>
            <Text fontWeight="semibold">
              {match.homeTeam?.name ?? "A definir"} × {match.awayTeam?.name ?? "A definir"}
            </Text>
            <Text fontSize="sm" color="gray.600">
              {new Date(match.startsAt).toLocaleString("pt-BR")}
              {match.status === "finished" && match.homeScore !== null && (
                <> — Resultado: {match.homeScore} × {match.awayScore}
                  {match.wentToPenalties && " (pen.)"}
                </>
              )}
            </Text>
          </Stack>
          <HStack gap={2}>
            <Button size="xs" variant="outline" onClick={() => { setEditOpen((v) => !v); setResultOpen(false); setError(null); }}>
              {editOpen ? "Cancelar" : "Editar"}
            </Button>
            <Button size="xs" variant="outline" colorPalette="green" onClick={() => { setResultOpen((v) => !v); setEditOpen(false); setError(null); }}>
              {resultOpen ? "Cancelar" : "Resultado"}
            </Button>
          </HStack>
        </HStack>

        {editOpen && (
          <form onSubmit={saveEdit}>
            <Stack gap={3} pt={2} borderTopWidth="1px">
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Field.Root required>
                  <Field.Label>Fase</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={draft.stageId}
                      onChange={(e) => setDraft((d) => ({ ...d, stageId: e.target.value }))}
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root required>
                  <Field.Label>Data e horário</Field.Label>
                  <Input
                    size="sm"
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Time mandante</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={draft.homeTeamId}
                      onChange={(e) => setDraft((d) => ({ ...d, homeTeamId: e.target.value }))}
                    >
                      <option value="">A definir</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root>
                  <Field.Label>Time visitante</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={draft.awayTeamId}
                      onChange={(e) => setDraft((d) => ({ ...d, awayTeamId: e.target.value }))}
                    >
                      <option value="">A definir</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              </SimpleGrid>
              {error && <Text color="red.500" fontSize="sm">{error}</Text>}
              <Button type="submit" size="sm" colorPalette="blue" loading={saving} alignSelf="flex-start">
                Salvar
              </Button>
            </Stack>
          </form>
        )}

        {resultOpen && (
          <form onSubmit={saveResult}>
            <Stack gap={3} pt={2} borderTopWidth="1px">
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
                <Field.Root required>
                  <Field.Label>{match.homeTeam?.name ?? "Mandante"}</Field.Label>
                  <Input
                    size="sm"
                    type="number"
                    min={0}
                    value={result.homeScore}
                    onChange={(e) => setResult((r) => ({ ...r, homeScore: e.target.value }))}
                  />
                </Field.Root>
                <Field.Root required>
                  <Field.Label>{match.awayTeam?.name ?? "Visitante"}</Field.Label>
                  <Input
                    size="sm"
                    type="number"
                    min={0}
                    value={result.awayScore}
                    onChange={(e) => setResult((r) => ({ ...r, awayScore: e.target.value }))}
                  />
                </Field.Root>
                {isResultDraw && (
                  <Field.Root required gridColumn={{ md: "span 2" }}>
                    <Field.Label>Vencedor nos pênaltis</Field.Label>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field
                        value={result.penaltyWinnerId}
                        onChange={(e) => setResult((r) => ({ ...r, penaltyWinnerId: e.target.value }))}
                      >
                        <option value="">Selecione</option>
                        {match.homeTeam && <option value={match.homeTeam.id}>{match.homeTeam.name}</option>}
                        {match.awayTeam && <option value={match.awayTeam.id}>{match.awayTeam.name}</option>}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                )}
              </SimpleGrid>
              {error && <Text color="red.500" fontSize="sm">{error}</Text>}
              <Button type="submit" size="sm" colorPalette="green" loading={saving} alignSelf="flex-start">
                Salvar resultado
              </Button>
            </Stack>
          </form>
        )}
      </Card.Body>
    </Card.Root>
  );
}

function MatchesPanel({
  tournamentId,
  matches,
  stages,
  teams,
  onCreated,
  onUpdated,
}: {
  tournamentId: number;
  matches: Match[];
  stages: Stage[];
  teams: Team[];
  onCreated: (m: Match) => void;
  onUpdated: (m: Match) => void;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<MatchDraft>({
    stageId: stages[0] ? String(stages[0].id) : "",
    homeTeamId: "",
    awayTeamId: "",
    startsAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const m = await adminCreateMatch(tournamentId, {
        stageId: Number(draft.stageId),
        startsAt: new Date(draft.startsAt).toISOString(),
        homeTeamId: draft.homeTeamId ? Number(draft.homeTeamId) : null,
        awayTeamId: draft.awayTeamId ? Number(draft.awayTeamId) : null,
      });
      onCreated(m);
      setNewOpen(false);
      setDraft({ stageId: stages[0] ? String(stages[0].id) : "", homeTeamId: "", awayTeamId: "", startsAt: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar jogo");
    } finally {
      setSubmitting(false);
    }
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.stage.id !== b.stage.id) return a.stage.id - b.stage.id;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  return (
    <Stack gap={4}>
      <HStack justify="space-between">
        <Heading size="sm">Jogos ({matches.length})</Heading>
        <Button size="sm" colorPalette="blue" variant="outline" onClick={() => setNewOpen((v) => !v)}>
          {newOpen ? "Cancelar" : "+ Novo jogo"}
        </Button>
      </HStack>

      {newOpen && (
        <Card.Root rounded="xl">
          <Card.Body gap={3}>
            <Card.Title fontSize="sm">Novo jogo</Card.Title>
            <form onSubmit={handleCreate}>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Field.Root required>
                  <Field.Label>Fase</Field.Label>
                  <NativeSelect.Root size="sm" disabled={stages.length === 0}>
                    <NativeSelect.Field
                      value={draft.stageId}
                      onChange={(e) => setDraft((d) => ({ ...d, stageId: e.target.value }))}
                    >
                      {stages.length === 0 && <option value="">Cadastre uma fase primeiro</option>}
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root required>
                  <Field.Label>Data e horário</Field.Label>
                  <Input
                    size="sm"
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>Time mandante</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={draft.homeTeamId}
                      onChange={(e) => setDraft((d) => ({ ...d, homeTeamId: e.target.value }))}
                    >
                      <option value="">A definir</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root>
                  <Field.Label>Time visitante</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={draft.awayTeamId}
                      onChange={(e) => setDraft((d) => ({ ...d, awayTeamId: e.target.value }))}
                    >
                      <option value="">A definir</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              </SimpleGrid>
              {error && <Text color="red.500" fontSize="sm" mt={2}>{error}</Text>}
              <Button type="submit" size="sm" colorPalette="blue" mt={3} loading={submitting} disabled={stages.length === 0}>
                Criar jogo
              </Button>
            </form>
          </Card.Body>
        </Card.Root>
      )}

      {sorted.length === 0 ? (
        <Text color="gray.500" fontSize="sm">Nenhum jogo cadastrado.</Text>
      ) : (
        <Stack gap={3}>
          {sorted.map((m) => (
            <MatchRow key={m.id} match={m} stages={stages} teams={teams} onUpdated={onUpdated} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Pools panel (read-only)
// ---------------------------------------------------------------------------

function PoolsPanel({ pools }: { pools: AdminPool[] }) {
  if (pools.length === 0) {
    return <Text color="gray.500" fontSize="sm">Nenhum bolão criado para este torneio.</Text>;
  }

  return (
    <Table.Root size="sm" variant="outline" rounded="xl" overflow="hidden">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Nome</Table.ColumnHeader>
          <Table.ColumnHeader>Criador</Table.ColumnHeader>
          <Table.ColumnHeader>Participantes</Table.ColumnHeader>
          <Table.ColumnHeader>Criado em</Table.ColumnHeader>
          <Table.ColumnHeader />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {pools.map((pool) => (
          <Table.Row key={pool.id}>
            <Table.Cell fontWeight="medium">{pool.name}</Table.Cell>
            <Table.Cell>{pool.creatorName}</Table.Cell>
            <Table.Cell>{pool.participantsCount}</Table.Cell>
            <Table.Cell>{new Date(pool.createdAt).toLocaleDateString("pt-BR")}</Table.Cell>
            <Table.Cell>
              <Button asChild size="xs" variant="ghost">
                <Link href={`/pools/${pool.slug}`}>Ver bolão →</Link>
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// ---------------------------------------------------------------------------
// Tournament detail
// ---------------------------------------------------------------------------

function TournamentDetail({
  tournament,
  teams,
  onTeamCreated,
}: {
  tournament: Tournament;
  teams: Team[];
  onTeamCreated: (t: Team) => void;
}) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pools, setPools] = useState<AdminPool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminListStages(tournament.id),
      adminListMatches(tournament.id),
      adminListPools(tournament.id),
    ]).then(([s, m, p]) => {
      setStages(s);
      setMatches(m);
      setPools(p);
      setLoading(false);
    });
  }, [tournament.id]);

  if (loading) {
    return <Text color="gray.500">Carregando…</Text>;
  }

  return (
    <Stack gap={6}>
      <HStack gap={3} align="baseline">
        <Heading size="lg">{tournament.name}</Heading>
        <Badge colorPalette="gray" variant="subtle" fontSize="md">{tournament.year}</Badge>
      </HStack>

      <Tabs.Root defaultValue="jogos" variant="line">
        <Tabs.List>
          <Tabs.Trigger value="jogos">Jogos ({matches.length})</Tabs.Trigger>
          <Tabs.Trigger value="boloes">Bolões ({pools.length})</Tabs.Trigger>
          <Tabs.Trigger value="fases">Fases</Tabs.Trigger>
          <Tabs.Trigger value="times">Times</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="jogos" pt={4}>
          <MatchesPanel
            tournamentId={tournament.id}
            matches={matches}
            stages={stages}
            teams={teams}
            onCreated={(m) => setMatches((prev) => [...prev, m])}
            onUpdated={(m) => setMatches((prev) => prev.map((x) => (x.id === m.id ? m : x)))}
          />
        </Tabs.Content>

        <Tabs.Content value="boloes" pt={4}>
          <PoolsPanel pools={pools} />
        </Tabs.Content>

        <Tabs.Content value="fases" pt={4}>
          <StagesPanel
            tournamentId={tournament.id}
            stages={stages}
            onCreated={(s) => setStages((prev) => [...prev, s])}
            onUpdated={(s) => setStages((prev) => prev.map((x) => (x.id === s.id ? s : x)))}
          />
        </Tabs.Content>

        <Tabs.Content value="times" pt={4}>
          <TeamsPanel teams={teams} onCreated={onTeamCreated} />
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminListTournaments(), adminListTeams()]).then(([ts, tms]) => {
      setTournaments(ts);
      setTeams(tms);
      if (ts.length > 0) setSelectedId(ts[0].id);
      setLoading(false);
    });
  }, []);

  const selected = tournaments.find((t) => t.id === selectedId) ?? null;

  function handleTeamCreated(team: Team) {
    setTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
  }

  if (loading) {
    return (
      <Box p={8}>
        <Text color="gray.500">Carregando…</Text>
      </Box>
    );
  }

  return (
    <Box p={{ base: 4, md: 8 }} maxW="1200px" mx="auto">
      <Stack gap={2} mb={8}>
        <Heading size="xl">Administração</Heading>
        <Text color="gray.600">Gerencie torneios, jogos e resultados.</Text>
      </Stack>

      <SimpleGrid columns={{ base: 1, md: 4 }} gap={8} alignItems="flex-start">
        <Box>
          <TournamentSidebar
            tournaments={tournaments}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreated={(t) => {
              setTournaments((prev) => [t, ...prev]);
              setSelectedId(t.id);
            }}
          />
        </Box>

        <Box gridColumn={{ md: "span 3" }}>
          {selected ? (
            <TournamentDetail
              key={selected.id}
              tournament={selected}
              teams={teams}
              onTeamCreated={handleTeamCreated}
            />
          ) : (
            <Text color="gray.500">Selecione ou crie um torneio para começar.</Text>
          )}
        </Box>
      </SimpleGrid>
    </Box>
  );
}
