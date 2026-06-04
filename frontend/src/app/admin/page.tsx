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
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import {
  adminAddTournamentTeam,
  adminAssignTeamGroup,
  adminCreateGroup,
  adminListTournamentGroups,
  adminCreateMatch,
  adminCreateRound,
  adminCreateStage,
  adminCreateTeam,
  adminCreateTournament,
  adminDeleteGroup,
  adminDeleteMatch,
  adminDeleteRound,
  adminDeleteStage,
  adminGenerateRoundSnapshot,
  adminListMatches,
  adminListPools,
  adminListStages,
  adminListTeams,
  adminListTournamentTeams,
  adminListTournaments,
  adminRemoveTournamentTeam,
  adminRenameGroup,
  adminUpdateMatch,
  adminUpdateRound,
  adminUpdateStage,
  adminUpdateTeam,
  adminUpdateTournamentAwards,
  adminUpdateTournamentStatus,
  ordinalRound,
} from "@/lib/api";
import type { AdminPool, EntityId, Match, Round, Stage, Team, TournamentGroup, TournamentTeamEntry, Tournament, TournamentStatus } from "@/types";

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
  selectedId: EntityId | null;
  onSelect: (id: EntityId) => void;
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
// Tournament teams panel
// ---------------------------------------------------------------------------

const TEAM_TYPE_LABELS: Record<string, string> = {
  national: "Seleção",
  club: "Clube",
};

const TEAM_TYPE_COLORS: Record<string, string> = {
  national: "green",
  club: "blue",
};

function TournamentTeamsPanel({
  tournamentId,
  allTeams,
  tournamentTeams,
  isFinished,
  onAdded,
  onRemoved,
  onCreated,
  onTeamGroupChanged,
}: {
  tournamentId: EntityId;
  allTeams: Team[];
  tournamentTeams: TournamentTeamEntry[];
  isFinished: boolean;
  onAdded: (t: TournamentTeamEntry) => void;
  onRemoved: (teamId: EntityId) => void;
  onCreated: (t: Team) => void;
  onTeamGroupChanged: (entry: TournamentTeamEntry) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<EntityId>>(new Set());
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [teamType, setTeamType] = useState("national");
  const [flagCode, setFlagCode] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [editingTeamId, setEditingTeamId] = useState<EntityId | null>(null);
  const [editFlagCode, setEditFlagCode] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [availableGroups, setAvailableGroups] = useState<TournamentGroup[]>([]);

  useEffect(() => {
    adminListTournamentGroups(tournamentId).then(setAvailableGroups);
  }, [tournamentId]);

  const assignedIds = new Set(tournamentTeams.map((t) => t.id));
  const available = allTeams.filter((t) => !assignedIds.has(t.id));

  function toggleSelect(teamId: EntityId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  }

  async function handleAddSelected() {
    if (selectedIds.size === 0) return;
    setAddError(null);
    setAddLoading(true);
    try {
      await Promise.all([...selectedIds].map((id) => adminAddTournamentTeam(tournamentId, id)));
      for (const id of selectedIds) {
        const team = allTeams.find((t) => t.id === id);
        if (team) onAdded({ ...team, groupId: null, groupName: null });
      }
      setSelectedIds(new Set());
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Erro ao adicionar");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(teamId: EntityId) {
    try {
      await adminRemoveTournamentTeam(tournamentId, teamId);
      onRemoved(teamId);
    } catch {
      // silently ignore
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const t = await adminCreateTeam({
        name: name.trim(),
        shortName: shortName.trim().toUpperCase(),
        teamType,
        flagCode: flagCode.trim().toUpperCase() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      onCreated(t);
      await adminAddTournamentTeam(tournamentId, t.id);
      onAdded({ ...t, groupId: null, groupName: null });
      setName("");
      setShortName("");
      setTeamType("national");
      setFlagCode("");
      setLogoUrl("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro ao criar time");
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(t: TournamentTeamEntry) {
    setEditingTeamId(t.id);
    setEditFlagCode(t.flagCode ?? "");
    setEditLogoUrl(t.logoUrl ?? "");
  }

  async function saveEdit(teamId: EntityId) {
    setEditLoading(true);
    try {
      const updated = await adminUpdateTeam(teamId, {
        flagCode: editFlagCode.trim().toUpperCase() || undefined,
        logoUrl: editLogoUrl.trim() || undefined,
      });
      onCreated(updated); // reuse to sync allTeams list
      setEditingTeamId(null);
    } finally {
      setEditLoading(false);
    }
  }

  const allGroups = availableGroups;

  return (
    <Stack gap={4}>
      <Heading size="sm">Times do torneio ({tournamentTeams.length})</Heading>
      {tournamentTeams.length === 0 ? (
        <Text color="gray.500" fontSize="sm">Nenhum time adicionado a este torneio ainda.</Text>
      ) : (
        <Table.Root size="sm" variant="outline" rounded="xl" overflow="hidden">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Nome</Table.ColumnHeader>
              <Table.ColumnHeader>Sigla</Table.ColumnHeader>
              <Table.ColumnHeader>Tipo</Table.ColumnHeader>
              <Table.ColumnHeader>Bandeira / Logo</Table.ColumnHeader>
              <Table.ColumnHeader>Grupo</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {tournamentTeams.map((t) => {
              const isEditing = editingTeamId === t.id;
              return (
                <>
                  <Table.Row key={t.id}>
                    <Table.Cell>{t.name}</Table.Cell>
                    <Table.Cell>{t.shortName ? <Badge variant="subtle">{t.shortName}</Badge> : <Text color="gray.400" fontSize="xs">—</Text>}</Table.Cell>
                    <Table.Cell>
                      <Badge colorPalette={TEAM_TYPE_COLORS[t.teamType] ?? "gray"} variant="subtle">
                        {TEAM_TYPE_LABELS[t.teamType] ?? t.teamType}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        {t.flagCode && (
                          <Text fontSize="lg" title={`Código: ${t.flagCode}`}>
                            {[...t.flagCode.toUpperCase()].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("")}
                          </Text>
                        )}
                        {t.logoUrl && (
                          <img
                            src={t.logoUrl}
                            alt={t.name}
                            width={20}
                            height={20}
                            style={{ objectFit: "contain" }}
                          />
                        )}
                        {!t.flagCode && !t.logoUrl && <Text color="gray.400" fontSize="xs">—</Text>}
                        <Button size="xs" variant="ghost" onClick={() => isEditing ? setEditingTeamId(null) : startEdit(t)}>
                          {isEditing ? "Cancelar" : "Editar"}
                        </Button>
                      </HStack>
                    </Table.Cell>
                  <Table.Cell>
                    {allGroups.length > 0 ? (
                      <NativeSelect.Root size="xs" minW="120px" disabled={isFinished}>
                        <NativeSelect.Field
                          value={t.groupId != null ? String(t.groupId) : ""}
                          onChange={async (e) => {
                            const val = e.target.value;
                            const updated = await adminAssignTeamGroup(tournamentId, t.id, val || null);
                            onTeamGroupChanged(updated);
                          }}
                        >
                          <option value="">—</option>
                          {allGroups.map((g) => (
                            <option key={g.id} value={String(g.id)}>{g.name}</option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    ) : (
                      <Text color="gray.400" fontSize="xs">—</Text>
                    )}
                  </Table.Cell>
                    <Table.Cell>
                      <Button size="xs" variant="ghost" colorPalette="red" disabled={isFinished} onClick={() => handleRemove(t.id)}>
                        Remover
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                  {isEditing && (
                    <Table.Row key={`${t.id}-edit`} bg="bg.subtle">
                      <Table.Cell colSpan={6}>
                        <HStack gap={3} py={1} flexWrap="wrap">
                          <Field.Root maxW="140px">
                            <Field.Label fontSize="xs">Código ISO (ex: BR)</Field.Label>
                            <Input size="xs" maxLength={2} value={editFlagCode} onChange={(e) => setEditFlagCode(e.target.value.toUpperCase())} placeholder="BR" />
                          </Field.Root>
                          <Field.Root flex={1} minW="200px">
                            <Field.Label fontSize="xs">URL do escudo/logo</Field.Label>
                            <Input size="xs" value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} placeholder="https://..." />
                          </Field.Root>
                          <Button size="xs" colorPalette="green" loading={editLoading} onClick={() => saveEdit(t.id)}>Salvar</Button>
                        </HStack>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}

      {!isFinished && (
        <Stack gap={3}>
          {available.length > 0 && (
            <Card.Root rounded="xl">
              <Card.Body gap={3}>
                <Card.Title fontSize="sm">Adicionar times existentes</Card.Title>
                {["national", "club"].map((type) => {
                  const group = available.filter((t) => t.teamType === type);
                  if (group.length === 0) return null;
                  return (
                    <Stack key={type} gap={1}>
                      <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">
                        {TEAM_TYPE_LABELS[type]}
                      </Text>
                      <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={1}>
                        {group.map((t) => (
                          <Checkbox.Root
                            key={t.id}
                            size="sm"
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                            disabled={addLoading}
                          >
                            <Checkbox.HiddenInput />
                            <Checkbox.Control />
                            <Checkbox.Label fontSize="sm">{t.name}{t.shortName ? ` (${t.shortName})` : ""}</Checkbox.Label>
                          </Checkbox.Root>
                        ))}
                      </SimpleGrid>
                    </Stack>
                  );
                })}
                {addError && <Text color="red.500" fontSize="sm">{addError}</Text>}
                <HStack gap={3} align="center">
                  <Button
                    size="sm"
                    colorPalette="blue"
                    loading={addLoading}
                    disabled={selectedIds.size === 0}
                    onClick={handleAddSelected}
                  >
                    Adicionar {selectedIds.size > 0 ? `(${selectedIds.size})` : "selecionados"}
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                      Limpar seleção
                    </Button>
                  )}
                </HStack>
              </Card.Body>
            </Card.Root>
          )}

          <Card.Root rounded="xl">
            <Card.Body gap={3}>
              <Card.Title fontSize="sm">Criar novo time e adicionar</Card.Title>
              <form onSubmit={handleCreate}>
                <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                  <Field.Root required>
                    <Field.Label>Nome</Field.Label>
                    <Input size="sm" placeholder="Brasil" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Sigla <Text as="span" color="gray.400" fontWeight="normal">(opcional)</Text></Field.Label>
                    <Input size="sm" placeholder="BRA" maxLength={12} value={shortName} onChange={(e) => setShortName(e.target.value)} />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Tipo</Field.Label>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field value={teamType} onChange={(e) => setTeamType(e.target.value)}>
                        <option value="national">Seleção</option>
                        <option value="club">Clube</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>
                      Código da bandeira{" "}
                      <Text as="span" color="gray.400" fontWeight="normal">(ISO, ex: BR)</Text>
                    </Field.Label>
                    <Input
                      size="sm"
                      placeholder="BR"
                      maxLength={2}
                      value={flagCode}
                      onChange={(e) => setFlagCode(e.target.value.toUpperCase())}
                    />
                  </Field.Root>
                  <Field.Root gridColumn={{ md: "span 2" }}>
                    <Field.Label>
                      URL do escudo/logo{" "}
                      <Text as="span" color="gray.400" fontWeight="normal">(opcional, substitui bandeira)</Text>
                    </Field.Label>
                    <Input
                      size="sm"
                      placeholder="https://..."
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                  </Field.Root>
                </SimpleGrid>
                {createError && <Text color="red.500" fontSize="sm" mt={2}>{createError}</Text>}
                <Button type="submit" size="sm" colorPalette="blue" mt={3} loading={createLoading}>
                  Criar e adicionar
                </Button>
              </form>
            </Card.Body>
          </Card.Root>
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Stages panel
// ---------------------------------------------------------------------------

const STAGE_TYPE_LABELS: Record<string, string> = {
  group: "Fase de grupos",
  league: "Pontos corridos",
  knockout: "Mata-mata",
};

const STAGE_TYPE_COLORS: Record<string, string> = {
  group: "blue",
  league: "teal",
  knockout: "purple",
};

function StagesPanel({
  tournamentId,
  stages,
  isFinished,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  tournamentId: EntityId;
  stages: Stage[];
  isFinished: boolean;
  onCreated: (s: Stage) => void;
  onUpdated: (s: Stage) => void;
  onDeleted: (stageId: EntityId) => void;
}) {
  const [name, setName] = useState("");
  const [order, setOrder] = useState(String(stages.length + 1));
  const [stageType, setStageType] = useState("group");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<EntityId | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [editStageType, setEditStageType] = useState("group");

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const s = await adminCreateStage(tournamentId, {
        name: name.trim(),
        order: Number(order),
        stageType,
      });
      setName("");
      setOrder(String(stages.length + 2));
      setStageType("group");
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
    setEditStageType(stage.stageType);
  }

  async function saveEdit(stageId: EntityId) {
    try {
      const s = await adminUpdateStage(stageId, {
        name: editName.trim(),
        order: Number(editOrder),
        stageType: editStageType,
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
                    <NativeSelect.Root size="xs" w="36">
                      <NativeSelect.Field value={editStageType} onChange={(e) => setEditStageType(e.target.value)}>
                        {Object.entries(STAGE_TYPE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
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
                    <Badge colorPalette={STAGE_TYPE_COLORS[stage.stageType] ?? "gray"} variant="subtle">
                      {STAGE_TYPE_LABELS[stage.stageType] ?? stage.stageType}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <HStack gap={1}>
                      <Button size="xs" variant="ghost" disabled={isFinished} onClick={() => startEdit(stage)}>Editar</Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        disabled={isFinished}
                        onClick={async () => {
                          if (!confirm(`Deletar a fase "${stage.name}"? Todos os jogos associados serão removidos.`)) return;
                          await adminDeleteStage(stage.id);
                          onDeleted(stage.id);
                        }}
                      >
                        Deletar
                      </Button>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ),
            )}
          </Table.Body>
        </Table.Root>
      )}

      {sorted.filter((s) => s.stageType === "group").map((s) => (
        <GroupsSubPanel
          key={s.id}
          stage={s}
          isFinished={isFinished}
          onGroupsChanged={(groups) => onUpdated({ ...s, groups })}
        />
      ))}

      {sorted.map((s) => (
        <RoundsSubPanel
          key={s.id}
          stage={s}
          isFinished={isFinished}
          onRoundsChanged={(rounds) => onUpdated({ ...s, rounds })}
        />
      ))}

      {!isFinished && (
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
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field value={stageType} onChange={(e) => setStageType(e.target.value)}>
                      {Object.entries(STAGE_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              </SimpleGrid>
              {error && <Text color="red.500" fontSize="sm" mt={2}>{error}</Text>}
              <Button type="submit" size="sm" colorPalette="blue" mt={3} loading={submitting}>
                Criar fase
              </Button>
            </form>
          </Card.Body>
        </Card.Root>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Groups sub-panel (used inside StagesPanel)
// ---------------------------------------------------------------------------

function GroupsSubPanel({
  stage,
  isFinished,
  onGroupsChanged,
}: {
  stage: Stage;
  isFinished: boolean;
  onGroupsChanged: (groups: TournamentGroup[]) => void;
}) {
  const [groups, setGroups] = useState<TournamentGroup[]>(stage.groups);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<EntityId | null>(null);
  const [editName, setEditName] = useState("");

  function sync(updated: TournamentGroup[]) {
    setGroups(updated);
    onGroupsChanged(updated);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const g = await adminCreateGroup(stage.id, { name: newName.trim() });
      const updated = [...groups, g].sort((a, b) => a.name.localeCompare(b.name));
      sync(updated);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(groupId: EntityId) {
    if (!confirm("Deletar este grupo? Os times serão desassociados.")) return;
    await adminDeleteGroup(groupId);
    sync(groups.filter((g) => g.id !== groupId));
  }

  async function handleRename(groupId: EntityId) {
    if (!editName.trim()) return;
    const g = await adminRenameGroup(groupId, { name: editName.trim() });
    sync(groups.map((x) => (x.id === groupId ? g : x)));
    setEditingId(null);
  }

  return (
    <Stack gap={2} pl={4} borderLeftWidth="2px" borderColor="blue.100">
      <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">
        Grupos de {stage.name}
      </Text>
      {groups.length === 0 ? (
        <Text fontSize="sm" color="gray.400">Nenhum grupo criado.</Text>
      ) : (
        <Stack gap={1}>
          {groups.map((g) =>
            editingId === g.id ? (
              <HStack key={g.id} gap={2}>
                <Input size="xs" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <Button size="xs" colorPalette="green" onClick={() => handleRename(g.id)}>Salvar</Button>
                <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
              </HStack>
            ) : (
              <HStack key={g.id} gap={2} justify="space-between">
                <Badge variant="subtle" colorPalette="blue">{g.name}</Badge>
                {!isFinished && (
                  <HStack gap={1}>
                    <Button size="xs" variant="ghost" onClick={() => { setEditingId(g.id); setEditName(g.name); }}>Renomear</Button>
                    <Button size="xs" variant="ghost" colorPalette="red" onClick={() => handleDelete(g.id)}>Deletar</Button>
                  </HStack>
                )}
              </HStack>
            )
          )}
        </Stack>
      )}
      {!isFinished && (
        <form onSubmit={handleCreate}>
          <HStack gap={2}>
            <Input size="xs" placeholder="Grupo A" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button type="submit" size="xs" colorPalette="blue" loading={creating} disabled={!newName.trim()}>
              + Grupo
            </Button>
          </HStack>
        </form>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Rounds sub-panel (used inside StagesPanel)
// ---------------------------------------------------------------------------

function RoundsSubPanel({
  stage,
  isFinished,
  onRoundsChanged,
}: {
  stage: Stage;
  isFinished: boolean;
  onRoundsChanged: (rounds: Round[]) => void;
}) {
  const [rounds, setRounds] = useState<Round[]>(stage.rounds);
  const [newNumber, setNewNumber] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<EntityId | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [snapshotting, setSnapshotting] = useState<EntityId | null>(null);
  const [snapshotDone, setSnapshotDone] = useState<Record<EntityId, string>>({});

  function sync(updated: Round[]) {
    const sorted = [...updated].sort((a, b) => a.number - b.number);
    setRounds(sorted);
    onRoundsChanged(sorted);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const num = parseInt(newNumber, 10);
    if (isNaN(num)) return;
    setCreating(true);
    try {
      const r = await adminCreateRound(stage.id, { number: num });
      sync([...rounds, r]);
      setNewNumber("");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(roundId: EntityId) {
    if (!confirm("Deletar esta rodada? Todos os jogos associados serão removidos.")) return;
    await adminDeleteRound(roundId);
    sync(rounds.filter((r) => r.id !== roundId));
  }

  async function handleRenumber(roundId: EntityId) {
    const num = parseInt(editNumber, 10);
    if (isNaN(num)) return;
    const r = await adminUpdateRound(roundId, { number: num });
    sync(rounds.map((x) => (x.id === roundId ? r : x)));
    setEditingId(null);
  }

  return (
    <Stack gap={2} pl={4} borderLeftWidth="2px" borderColor="teal.100">
      <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">
        Rodadas de {stage.name}
      </Text>
      {rounds.length === 0 ? (
        <Text fontSize="sm" color="gray.400">Nenhuma rodada criada.</Text>
      ) : (
        <Stack gap={1}>
          {rounds.map((r) =>
            editingId === r.id ? (
              <HStack key={r.id} gap={2}>
                <Input
                  size="xs"
                  type="number"
                  w="20"
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  autoFocus
                />
                <Button size="xs" colorPalette="green" onClick={() => handleRenumber(r.id)}>Salvar</Button>
                <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
              </HStack>
            ) : (
              <HStack key={r.id} gap={2} justify="space-between" flexWrap="wrap">
                <HStack gap={2}>
                  <Badge variant="subtle" colorPalette="teal">{ordinalRound(r.number)}</Badge>
                  {snapshotDone[r.id] && (
                    <Text fontSize="xs" color="green.600">✓ snapshot {snapshotDone[r.id]}</Text>
                  )}
                </HStack>
                <HStack gap={1}>
                  <Button
                    size="xs"
                    variant="outline"
                    colorPalette="teal"
                    loading={snapshotting === r.id}
                    onClick={async () => {
                      setSnapshotting(r.id);
                      try {
                        const res = await adminGenerateRoundSnapshot(r.id);
                        setSnapshotDone((prev) => ({ ...prev, [r.id]: `(${res.poolsSnapshotted} bolões)` }));
                      } finally {
                        setSnapshotting(null);
                      }
                    }}
                  >
                    Snapshot
                  </Button>
                  {!isFinished && (
                    <>
                      <Button size="xs" variant="ghost" onClick={() => { setEditingId(r.id); setEditNumber(String(r.number)); }}>Renumerar</Button>
                      <Button size="xs" variant="ghost" colorPalette="red" onClick={() => handleDelete(r.id)}>Deletar</Button>
                    </>
                  )}
                </HStack>
              </HStack>
            )
          )}
        </Stack>
      )}
      {!isFinished && (
        <form onSubmit={handleCreate}>
          <HStack gap={2}>
            <Input
              size="xs"
              type="number"
              placeholder={String(rounds.length + 1)}
              w="20"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
            />
            <Button type="submit" size="xs" colorPalette="teal" loading={creating} disabled={!newNumber.trim()}>
              + Rodada
            </Button>
          </HStack>
        </form>
      )}
    </Stack>
  );
}


// ---------------------------------------------------------------------------
// Matches panel
// ---------------------------------------------------------------------------

type MatchDraft = {
  stageId: string;
  roundId: string;
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
  isFinished,
  onUpdated,
  onDeleted,
}: {
  match: Match;
  stages: Stage[];
  teams: Team[];
  isFinished: boolean;
  onUpdated: (m: Match) => void;
  onDeleted: (matchId: EntityId) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [draft, setDraft] = useState<MatchDraft>({
    stageId: String(match.stage.id),
    roundId: String(match.round.id),
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

  const selectedStageForEdit = stages.find((s) => s.id === draft.stageId);
  const roundsForEdit = selectedStageForEdit?.rounds ?? [];
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
        roundId: draft.roundId,
        homeTeamId: draft.homeTeamId || null,
        awayTeamId: draft.awayTeamId || null,
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
        payload.penaltyWinnerTeamId = result.penaltyWinnerId || null;
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
              <Badge colorPalette={STAGE_TYPE_COLORS[match.stage.stageType] ?? "gray"} variant="subtle" rounded="full">
                {match.stage.name}
              </Badge>
              {match.stage.stageType !== "knockout" && (
                <Badge colorPalette="teal" variant="subtle" rounded="full">
                  {ordinalRound(match.round.number)}
                </Badge>
              )}
              {match.group && (
                <Badge colorPalette="blue" variant="outline" rounded="full">
                  {match.group.name}
                </Badge>
              )}
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
            <Button size="xs" variant="outline" disabled={isFinished} onClick={() => { setEditOpen((v) => !v); setResultOpen(false); setError(null); }}>
              {editOpen ? "Cancelar" : "Editar"}
            </Button>
            <Button size="xs" variant="outline" colorPalette="green" disabled={isFinished} onClick={() => { setResultOpen((v) => !v); setEditOpen(false); setError(null); }}>
              {resultOpen ? "Cancelar" : "Resultado"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              colorPalette="red"
              disabled={isFinished}
              onClick={async () => {
                if (!confirm("Deletar este jogo? Esta ação não pode ser desfeita.")) return;
                await adminDeleteMatch(match.id);
                onDeleted(match.id);
              }}
            >
              Deletar
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
                      onChange={(e) => setDraft((d) => ({ ...d, stageId: e.target.value, roundId: "" }))}
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root required>
                  <Field.Label>Rodada</Field.Label>
                  <NativeSelect.Root size="sm" disabled={roundsForEdit.length === 0}>
                    <NativeSelect.Field
                      value={draft.roundId}
                      onChange={(e) => setDraft((d) => ({ ...d, roundId: e.target.value }))}
                    >
                      {roundsForEdit.length === 0 && <option value="">Cadastre uma rodada primeiro</option>}
                      {roundsForEdit.map((r) => (
                        <option key={r.id} value={r.id}>{ordinalRound(r.number)}</option>
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
  isFinished,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  tournamentId: EntityId;
  matches: Match[];
  stages: Stage[];
  teams: Team[];
  isFinished: boolean;
  onCreated: (m: Match) => void;
  onUpdated: (m: Match) => void;
  onDeleted: (matchId: EntityId) => void;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<MatchDraft>({
    stageId: stages[0] ? String(stages[0].id) : "",
    roundId: stages[0]?.rounds[0] ? String(stages[0].rounds[0].id) : "",
    homeTeamId: "",
    awayTeamId: "",
    startsAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedStage = stages.find((s) => s.id === draft.stageId);
  const availableRounds = selectedStage?.rounds ?? [];

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const m = await adminCreateMatch(tournamentId, {
        roundId: draft.roundId,
        startsAt: new Date(draft.startsAt).toISOString(),
        homeTeamId: draft.homeTeamId || null,
        awayTeamId: draft.awayTeamId || null,
      });
      onCreated(m);
      setNewOpen(false);
      setDraft({ stageId: stages[0] ? String(stages[0].id) : "", roundId: stages[0]?.rounds[0] ? String(stages[0].rounds[0].id) : "", homeTeamId: "", awayTeamId: "", startsAt: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar jogo");
    } finally {
      setSubmitting(false);
    }
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.stage.id !== b.stage.id) return a.stage.name.localeCompare(b.stage.name);
    if (a.round.number !== b.round.number) return a.round.number - b.round.number;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  return (
    <Stack gap={4}>
      <HStack justify="space-between">
        <Heading size="sm">Jogos ({matches.length})</Heading>
        <Button size="sm" colorPalette="blue" variant="outline" disabled={isFinished} onClick={() => setNewOpen((v) => !v)}>
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
                      onChange={(e) => {
                        const stg = stages.find((s) => s.id === e.target.value);
                        setDraft((d) => ({ ...d, stageId: e.target.value, roundId: stg?.rounds[0] ? String(stg.rounds[0].id) : "" }));
                      }}
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
                  <Field.Label>Rodada</Field.Label>
                  <NativeSelect.Root size="sm" disabled={availableRounds.length === 0}>
                    <NativeSelect.Field
                      value={draft.roundId}
                      onChange={(e) => setDraft((d) => ({ ...d, roundId: e.target.value }))}
                    >
                      {availableRounds.length === 0 && <option value="">Cadastre uma rodada primeiro</option>}
                      {availableRounds.map((r) => (
                        <option key={r.id} value={r.id}>{ordinalRound(r.number)}</option>
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
              <Button
                type="submit"
                size="sm"
                colorPalette="blue"
                mt={3}
                loading={submitting}
                disabled={
                  stages.length === 0 ||
                  !draft.stageId ||
                  !draft.roundId ||
                  !draft.startsAt
                }
              >
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
            <MatchRow key={m.id} match={m} stages={stages} teams={teams} isFinished={isFinished} onUpdated={onUpdated} onDeleted={onDeleted} />
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
// Tournament status control
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Em andamento",
  finished: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: "green",
  finished: "blue",
};

function TournamentStatusControl({
  tournament,
  onUpdated,
}: {
  tournament: Tournament;
  onUpdated: (t: Tournament) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleChange(status: TournamentStatus) {
    setLoading(true);
    try {
      const updated = await adminUpdateTournamentStatus(tournament.id, status);
      onUpdated(updated);
    } finally {
      setLoading(false);
    }
  }

  return (
    <HStack gap={2} align="center">
      <NativeSelect.Root size="xs" w="44" disabled={loading}>
        <NativeSelect.Field
          value={tournament.status}
          onChange={(e) => handleChange(e.target.value as TournamentStatus)}
        >
          {(Object.keys(STATUS_LABELS) as TournamentStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      {loading && <Text fontSize="xs" color="gray.500">Salvando…</Text>}
    </HStack>
  );
}


// ---------------------------------------------------------------------------
// Awards panel
// ---------------------------------------------------------------------------

function AwardsPanel({
  tournament,
  teams,
  isFinished,
  onUpdated,
}: {
  tournament: Tournament;
  teams: Team[];
  isFinished: boolean;
  onUpdated: (t: Tournament) => void;
}) {
  const aw = tournament.awards;
  const [draft, setDraft] = useState({
    championTeamId: aw.championTeamId ? String(aw.championTeamId) : "",
    runnerUpTeamId: aw.runnerUpTeamId ? String(aw.runnerUpTeamId) : "",
    thirdPlaceTeamId: aw.thirdPlaceTeamId ? String(aw.thirdPlaceTeamId) : "",
    topScorer: aw.topScorer ?? "",
    bestPlayer: aw.bestPlayer ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await adminUpdateTournamentAwards(tournament.id, {
        championTeamId: draft.championTeamId || null,
        runnerUpTeamId: draft.runnerUpTeamId || null,
        thirdPlaceTeamId: draft.thirdPlaceTeamId || null,
        topScorer: draft.topScorer || "",
        bestPlayer: draft.bestPlayer || "",
      });
      onUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap={4}>
      <Heading size="sm">Resultados do torneio</Heading>
      <Text color="gray.500" fontSize="sm">
        Quando definidos, os pontos de palpites especiais são calculados automaticamente no ranking de cada bolão.
      </Text>
      <form onSubmit={handleSubmit}>
        <Stack gap={4}>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            <Stack gap={1}>
              <Text fontSize="sm" fontWeight="medium">Campeão</Text>
              <NativeSelect.Root size="sm" disabled={isFinished}>
                <NativeSelect.Field
                  value={draft.championTeamId}
                  onChange={(e) => { setDraft((d) => ({ ...d, championTeamId: e.target.value })); setSaved(false); }}
                >
                  <option value="">Não definido</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Stack>
            <Stack gap={1}>
              <Text fontSize="sm" fontWeight="medium">Vice-campeão</Text>
              <NativeSelect.Root size="sm" disabled={isFinished}>
                <NativeSelect.Field
                  value={draft.runnerUpTeamId}
                  onChange={(e) => { setDraft((d) => ({ ...d, runnerUpTeamId: e.target.value })); setSaved(false); }}
                >
                  <option value="">Não definido</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Stack>
            <Stack gap={1}>
              <Text fontSize="sm" fontWeight="medium">Terceiro lugar</Text>
              <NativeSelect.Root size="sm" disabled={isFinished}>
                <NativeSelect.Field
                  value={draft.thirdPlaceTeamId}
                  onChange={(e) => { setDraft((d) => ({ ...d, thirdPlaceTeamId: e.target.value })); setSaved(false); }}
                >
                  <option value="">Não definido</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Stack>
            <Stack gap={1}>
              <Text fontSize="sm" fontWeight="medium">Artilheiro</Text>
              <Input
                size="sm"
                placeholder="Nome do jogador"
                disabled={isFinished}
                value={draft.topScorer}
                onChange={(e) => { setDraft((d) => ({ ...d, topScorer: e.target.value })); setSaved(false); }}
              />
            </Stack>
            <Stack gap={1}>
              <Text fontSize="sm" fontWeight="medium">Melhor jogador</Text>
              <Input
                size="sm"
                placeholder="Nome do jogador"
                disabled={isFinished}
                value={draft.bestPlayer}
                onChange={(e) => { setDraft((d) => ({ ...d, bestPlayer: e.target.value })); setSaved(false); }}
              />
            </Stack>
          </SimpleGrid>
          {error && <Text color="red.500" fontSize="sm">{error}</Text>}
          <HStack gap={3} align="center">
            <Button type="submit" size="sm" colorPalette="green" loading={saving} disabled={isFinished}>
              Salvar premiações
            </Button>
            {saved && <Text color="green.600" fontSize="sm">✓ Salvo</Text>}
          </HStack>
        </Stack>
      </form>
    </Stack>
  );
}


// ---------------------------------------------------------------------------
// Tournament detail
// ---------------------------------------------------------------------------

function TournamentDetail({
  tournament: initialTournament,
  teams,
  onTeamCreated,
}: {
  tournament: Tournament;
  teams: Team[];
  onTeamCreated: (t: Team) => void;
}) {
  const [tournament, setTournament] = useState(initialTournament);
  const [stages, setStages] = useState<Stage[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pools, setPools] = useState<AdminPool[]>([]);
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeamEntry[]>([]);
  const [loadedTournamentId, setLoadedTournamentId] = useState<string | null>(null);
  const loading = loadedTournamentId !== tournament.id;

  useEffect(() => {
    Promise.all([
      adminListStages(tournament.id),
      adminListMatches(tournament.id),
      adminListPools(tournament.id),
      adminListTournamentTeams(tournament.id),
    ]).then(([s, m, p, tt]) => {
      setStages(s);
      setMatches(m);
      setPools(p);
      setTournamentTeams(tt);
      setLoadedTournamentId(tournament.id);
    });
  }, [tournament.id]);

  if (loading) {
    return <Text color="gray.500">Carregando…</Text>;
  }

  const isFinished = tournament.status === "finished";

  return (
    <Stack gap={6}>
      <HStack gap={3} align="center" flexWrap="wrap">
        <Heading size="lg">{tournament.name}</Heading>
        <Badge colorPalette="gray" variant="subtle" fontSize="md">{tournament.year}</Badge>
        <TournamentStatusControl tournament={tournament} onUpdated={setTournament} />
      </HStack>

      {isFinished && (
        <Card.Root rounded="xl" borderWidth="1px" borderColor="orange.300" bg="orange.50">
          <Card.Body py={3} px={4}>
            <Text fontSize="sm" color="orange.700">
              Torneio encerrado — edições bloqueadas. Altere o status para <strong>Em andamento</strong> para retomar edições.
            </Text>
          </Card.Body>
        </Card.Root>
      )}

      <Tabs.Root defaultValue="jogos" variant="line">
        <Tabs.List>
          <Tabs.Trigger value="jogos">Jogos ({matches.length})</Tabs.Trigger>
          <Tabs.Trigger value="boloes">Bolões ({pools.length})</Tabs.Trigger>
          <Tabs.Trigger value="fases">Fases</Tabs.Trigger>
          <Tabs.Trigger value="premiacoes">Premiações</Tabs.Trigger>
          <Tabs.Trigger value="times">Times</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="jogos" pt={4}>
          <MatchesPanel
            tournamentId={tournament.id}
            matches={matches}
            stages={stages}
            teams={tournamentTeams}
            isFinished={isFinished}
            onCreated={(m) => setMatches((prev) => [...prev, m])}
            onUpdated={(m) => setMatches((prev) => prev.map((x) => (x.id === m.id ? m : x)))}
            onDeleted={(id) => setMatches((prev) => prev.filter((x) => x.id !== id))}
          />
        </Tabs.Content>

        <Tabs.Content value="boloes" pt={4}>
          <PoolsPanel pools={pools} />
        </Tabs.Content>

        <Tabs.Content value="fases" pt={4}>
          <StagesPanel
            tournamentId={tournament.id}
            stages={stages}
            isFinished={isFinished}
            onCreated={(s) => setStages((prev) => [...prev, s])}
            onUpdated={(s) => setStages((prev) => prev.map((x) => (x.id === s.id ? s : x)))}
            onDeleted={(id) => setStages((prev) => prev.filter((x) => x.id !== id))}
          />
        </Tabs.Content>

        <Tabs.Content value="premiacoes" pt={4}>
          <AwardsPanel tournament={tournament} teams={tournamentTeams} isFinished={isFinished} onUpdated={setTournament} />
        </Tabs.Content>

        <Tabs.Content value="times" pt={4}>
          <TournamentTeamsPanel
            tournamentId={tournament.id}
            allTeams={teams}
            tournamentTeams={tournamentTeams}
            isFinished={isFinished}
            onAdded={(t) => setTournamentTeams((prev) => [...prev, t])}
            onRemoved={(id) => setTournamentTeams((prev) => prev.filter((t) => t.id !== id))}
            onCreated={onTeamCreated}
            onTeamGroupChanged={(entry) =>
              setTournamentTeams((prev) => prev.map((t) => (t.id === entry.id ? entry : t)))
            }
          />
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.replace(user ? "/" : "/login?next=/admin");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    Promise.all([adminListTournaments(), adminListTeams()]).then(([ts, tms]) => {
      setTournaments(ts);
      setTeams(tms);
      if (ts.length > 0) setSelectedId(ts[0].id);
      setLoading(false);
    });
  }, [user]);

  const selected = tournaments.find((t) => t.id === selectedId) ?? null;

  function handleTeamCreated(team: Team) {
    setTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
  }

  if (authLoading || !user?.isAdmin) {
    return null;
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
