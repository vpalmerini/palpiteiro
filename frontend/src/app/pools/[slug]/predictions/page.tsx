"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Collapsible,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Separator,
} from "@chakra-ui/react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Lock, Star, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { getPredictionSetup, ordinalRound, saveAwardPrediction, savePrediction } from "@/lib/api";
import { PredictionsPageSkeleton } from "@/components/page-skeletons";
import { TeamLogo, TeamName } from "@/components/team-badge";
import type { AwardPrediction, Match, Pool, Prediction, Team } from "@/types";
import { useAuth } from "@/contexts/auth";
import { useRouter } from "next/navigation";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

type AwardDraft = {
  championTeamId: string;
  runnerUpTeamId: string;
  thirdPlaceTeamId: string;
  topScorer: string;
  bestPlayer: string;
};

export default function PredictionsPage({ params }: PageProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { homeScore: string; awayScore: string; penaltyWinnerId: string }>>({});
  const [savedAwardPrediction, setSavedAwardPrediction] = useState<AwardPrediction | null>(null);
  const [awardDraft, setAwardDraft] = useState<AwardDraft>({ championTeamId: "", runnerUpTeamId: "", thirdPlaceTeamId: "", topScorer: "", bestPlayer: "" });
  const [awardLocked, setAwardLocked] = useState(false);
  const [awardMessage, setAwardMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/pools/${slug || ""}/predictions`);
    }
  }, [authLoading, user, slug, router]);

  useEffect(() => {
    if (!slug || !user) return;
    void getPredictionSetup(slug).then((data) => {
      setPool(data.pool);
      setMatches(data.matches);
      setTeams(data.teams);
      setAwardLocked(data.awardPrediction.isLocked);
      setPredictions(Object.fromEntries(data.predictions.map((prediction) => [prediction.matchId, prediction])));
      setScoreDrafts(
        Object.fromEntries(
          data.predictions.map((prediction) => [
            prediction.matchId,
            {
              homeScore: String(prediction.homeScore),
              awayScore: String(prediction.awayScore),
              penaltyWinnerId: prediction.penaltyWinnerTeamId ? String(prediction.penaltyWinnerTeamId) : "",
            },
          ]),
        ),
      );
      if (data.awardPrediction.prediction) {
        const p = data.awardPrediction.prediction;
        setSavedAwardPrediction(p);
        setAwardDraft({
          championTeamId: p.championTeamId ? String(p.championTeamId) : "",
          runnerUpTeamId: p.runnerUpTeamId ? String(p.runnerUpTeamId) : "",
          thirdPlaceTeamId: p.thirdPlaceTeamId ? String(p.thirdPlaceTeamId) : "",
          topScorer: p.topScorer ?? "",
          bestPlayer: p.bestPlayer ?? "",
        });
      }
    });
  }, [slug, user]);

  function updateDraft(matchId: string, field: "homeScore" | "awayScore" | "penaltyWinnerId", value: string) {
    setScoreDrafts((current) => ({
      ...current,
      [matchId]: {
        homeScore: current[matchId]?.homeScore ?? "",
        awayScore: current[matchId]?.awayScore ?? "",
        penaltyWinnerId: current[matchId]?.penaltyWinnerId ?? "",
        [field]: value,
      },
    }));
  }

  async function onAwardSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const previous = savedAwardPrediction;
    const optimistic: AwardPrediction = {
      id: previous?.id ?? "pending",
      championTeamId: awardDraft.championTeamId || null,
      runnerUpTeamId: awardDraft.runnerUpTeamId || null,
      thirdPlaceTeamId: awardDraft.thirdPlaceTeamId || null,
      topScorer: awardDraft.topScorer || null,
      bestPlayer: awardDraft.bestPlayer || null,
      updatedAt: new Date().toISOString(),
    };

    setSavedAwardPrediction(optimistic);
    setAwardMessage("Salvando palpites especiais…");

    try {
      const saved = await saveAwardPrediction(slug, {
        championTeamId: awardDraft.championTeamId || null,
        runnerUpTeamId: awardDraft.runnerUpTeamId || null,
        thirdPlaceTeamId: awardDraft.thirdPlaceTeamId || null,
        topScorer: awardDraft.topScorer,
        bestPlayer: awardDraft.bestPlayer,
      });
      setSavedAwardPrediction(saved);
      setAwardMessage("Palpites especiais salvos.");
    } catch (err) {
      setSavedAwardPrediction(previous);
      setAwardMessage(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>, match: Match) {
    event.preventDefault();
    if (!user) return;

    const form = new FormData(event.currentTarget);
    const penaltyWinnerTeamId =
      typeof form.get("penaltyWinnerTeamId") === "string" && form.get("penaltyWinnerTeamId")
        ? String(form.get("penaltyWinnerTeamId"))
        : null;
    const homeScore = Number(form.get("homeScore"));
    const awayScore = Number(form.get("awayScore"));
    const previous = predictions[match.id];

    const optimistic: Prediction = {
      id: previous?.id ?? match.id,
      matchId: match.id,
      userId: user.id,
      homeScore,
      awayScore,
      predictsPenalties: match.stage.isKnockout && homeScore === awayScore,
      penaltyWinnerTeamId,
      updatedAt: new Date().toISOString(),
      score: previous?.score ?? null,
    };

    setPredictions((current) => ({ ...current, [match.id]: optimistic }));
    setScoreDrafts((current) => ({
      ...current,
      [match.id]: {
        homeScore: String(homeScore),
        awayScore: String(awayScore),
        penaltyWinnerId: penaltyWinnerTeamId ?? "",
      },
    }));
    setMessage("Salvando palpite…");

    try {
      const saved = await savePrediction(slug, {
        matchId: match.id,
        homeScore,
        awayScore,
        penaltyWinnerTeamId,
      });
      setPredictions((current) => ({ ...current, [saved.matchId]: saved }));
      setMessage("Palpite salvo.");
    } catch (err) {
      setPredictions((current) => {
        const next = { ...current };
        if (previous) next[match.id] = previous;
        else delete next[match.id];
        return next;
      });
      setMessage(err instanceof Error ? err.message : "Erro ao salvar palpite.");
    }
  }

  if (authLoading || !user || !pool) {
    return <PredictionsPageSkeleton />;
  }

  return (
    <Stack gap={6}>
      <Card.Root as="section" rounded="2xl" shadow="lg">
        <Card.Body gap={3} p={{ base: 4, md: 6 }}>
          <Badge alignSelf="flex-start" colorPalette="green" rounded="full" px={3} py={1}>
            Palpites
          </Badge>
          <Heading as="h1" fontSize={{ base: "2xl", md: "4xl" }}>
            {pool.name}
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            Registre placares antes do início de cada jogo. Em mata-mata, palpite empatado significa decisão nos pênaltis.
          </Text>
          <Button asChild alignSelf="flex-start" colorPalette="green" rounded="lg" variant="subtle" size="sm">
            <Link href={`/pools/${slug}`}>Voltar ao ranking</Link>
          </Button>
          {pool && !pool.isParticipant ? <Text color="orange.600" fontSize="sm">Entre no bolão antes de registrar palpites.</Text> : null}
          {message ? <Text color="green.600" fontSize="sm">{message}</Text> : null}
        </Card.Body>
      </Card.Root>

      {pool && (pool.awards.champion.enabled || pool.awards.runnerUp.enabled || pool.awards.thirdPlace.enabled || pool.awards.topScorer.enabled || pool.awards.bestPlayer.enabled) ? (
        <Card.Root
          as="section"
          rounded="2xl"
          borderWidth={savedAwardPrediction ? "2px" : "1px"}
          borderColor={savedAwardPrediction ? "green.300" : undefined}
        >
          <Card.Body gap={4}>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2} flexWrap="wrap">
                <Badge colorPalette="yellow" rounded="full">Palpites especiais</Badge>
                {savedAwardPrediction ? (
                  <Badge colorPalette="green" rounded="full" variant="subtle">✓ Salvo</Badge>
                ) : (
                  <Badge colorPalette="orange" rounded="full" variant="subtle">Sem palpite</Badge>
                )}
              </Stack>
              <Text color="fg.muted" fontSize="sm">
                {awardLocked
                  ? "O torneio já começou — palpites especiais bloqueados."
                  : "Disponíveis até o início do primeiro jogo. Cada acerto vale pontos extras no ranking."}
              </Text>
            </Stack>

            <Separator />

            <form onSubmit={onAwardSubmit} style={{ width: "100%" }}>
              <fieldset disabled={awardLocked || !user} style={{ border: "none", padding: 0, margin: 0 }}>
              <Stack gap={4}>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                  {pool.awards.champion.enabled && (
                    <Field.Root>
                      <Field.Label>Campeão <Badge colorPalette="yellow" variant="subtle" ml={1}>{pool.awards.champion.points} pts</Badge></Field.Label>
                      <NativeSelect.Root disabled={awardLocked || !user}>
                        <NativeSelect.Field value={awardDraft.championTeamId} onChange={(e) => setAwardDraft((d) => ({ ...d, championTeamId: e.target.value }))}>
                          <option value="">Selecione</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>
                  )}
                  {pool.awards.runnerUp.enabled && (
                    <Field.Root>
                      <Field.Label>Vice-campeão <Badge colorPalette="yellow" variant="subtle" ml={1}>{pool.awards.runnerUp.points} pts</Badge></Field.Label>
                      <NativeSelect.Root disabled={awardLocked || !user}>
                        <NativeSelect.Field value={awardDraft.runnerUpTeamId} onChange={(e) => setAwardDraft((d) => ({ ...d, runnerUpTeamId: e.target.value }))}>
                          <option value="">Selecione</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>
                  )}
                  {pool.awards.thirdPlace.enabled && (
                    <Field.Root>
                      <Field.Label>Terceiro lugar <Badge colorPalette="yellow" variant="subtle" ml={1}>{pool.awards.thirdPlace.points} pts</Badge></Field.Label>
                      <NativeSelect.Root disabled={awardLocked || !user}>
                        <NativeSelect.Field value={awardDraft.thirdPlaceTeamId} onChange={(e) => setAwardDraft((d) => ({ ...d, thirdPlaceTeamId: e.target.value }))}>
                          <option value="">Selecione</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>
                  )}
                  {pool.awards.topScorer.enabled && (
                    <Field.Root>
                      <Field.Label>Artilheiro <Badge colorPalette="yellow" variant="subtle" ml={1}>{pool.awards.topScorer.points} pts</Badge></Field.Label>
                      <Input
                        placeholder="Nome do jogador"
                        disabled={awardLocked || !user}
                        value={awardDraft.topScorer}
                        onChange={(e) => setAwardDraft((d) => ({ ...d, topScorer: e.target.value }))}
                      />
                    </Field.Root>
                  )}
                  {pool.awards.bestPlayer.enabled && (
                    <Field.Root>
                      <Field.Label>Melhor jogador <Badge colorPalette="yellow" variant="subtle" ml={1}>{pool.awards.bestPlayer.points} pts</Badge></Field.Label>
                      <Input
                        placeholder="Nome do jogador"
                        disabled={awardLocked || !user}
                        value={awardDraft.bestPlayer}
                        onChange={(e) => setAwardDraft((d) => ({ ...d, bestPlayer: e.target.value }))}
                      />
                    </Field.Root>
                  )}
                </SimpleGrid>

                {awardMessage && (
                  <Text color={awardMessage.includes("Erro") ? "red.600" : "green.600"} fontSize="sm">
                    {awardMessage}
                  </Text>
                )}

                <Button
                  type="submit"
                  colorPalette="green"
                  color="white"
                  rounded="lg"
                  disabled={awardLocked || !user}
                  width={{ base: "full", md: "auto" }}
                  alignSelf={{ base: "stretch", md: "flex-start" }}
                >
                  {awardLocked
                    ? "Torneio iniciado — palpites bloqueados"
                    : savedAwardPrediction ? "Atualizar palpites especiais" : "Salvar palpites especiais"}
                </Button>
              </Stack>
              </fieldset>
            </form>
          </Card.Body>
        </Card.Root>
      ) : null}

      {(() => {
        // Group matches: stage → round (ordered by round.number)
        type RoundSection = { roundId: string; roundNumber: number; matches: Match[] };
        type StageSection = {
          stageId: string;
          stageName: string;
          stageType: string;
          rounds: RoundSection[];
        };

        const STAGE_COLORS: Record<string, string> = { knockout: "purple", league: "teal", group: "blue" };

        function buildStageMap(matchList: Match[]) {
          const map = new Map<string, StageSection>();
          for (const match of matchList) {
            if (!map.has(match.stage.id)) {
              map.set(match.stage.id, {
                stageId: match.stage.id,
                stageName: match.stage.name,
                stageType: match.stage.stageType,
                rounds: [],
              });
            }
            const section = map.get(match.stage.id)!;
            let rs = section.rounds.find((r) => r.roundId === match.round.id);
            if (!rs) {
              rs = { roundId: match.round.id, roundNumber: match.round.number, matches: [] };
              section.rounds.push(rs);
            }
            rs.matches.push(match);
          }
          for (const section of map.values()) {
            section.rounds.sort((a, b) => a.roundNumber - b.roundNumber);
          }
          return map;
        }

        const stageMap = buildStageMap(matches);

        function renderMatchGrid(matchList: Match[]) {
          return (
            <Box display="flex" flexWrap="wrap" alignItems="flex-start" gap={3} pt={2}>
              {matchList.map((match) => (
                <Box key={match.id} flex="0 0 auto" width={{ base: "100%", md: "calc(50% - 6px)", xl: "calc(33.333% - 8px)" }}>
                  {renderMatchCard(match)}
                </Box>
              ))}
            </Box>
          );
        }

        function renderRoundContent(rs: RoundSection) {
          // Group matches by group within the round
          type GroupBucket = { groupKey: string; groupName: string | null; matches: Match[] };
          const buckets = new Map<string, GroupBucket>();
          for (const match of rs.matches) {
            const key = match.group ? `g:${match.group.id}` : "ungrouped";
            if (!buckets.has(key)) {
              buckets.set(key, { groupKey: key, groupName: match.group?.name ?? null, matches: [] });
            }
            buckets.get(key)!.matches.push(match);
          }
          const sorted = [...buckets.values()].sort((a, b) => {
            if (a.groupKey === "ungrouped") return 1;
            if (b.groupKey === "ungrouped") return -1;
            return (a.groupName ?? "").localeCompare(b.groupName ?? "");
          });

          // If no named groups, render matches directly
          if (sorted.every((b) => b.groupName === null)) {
            return renderMatchGrid(rs.matches);
          }

          return (
            <Stack gap={3} pt={2}>
              {sorted.map((bucket) =>
                bucket.groupName ? (
                  <Collapsible.Root key={bucket.groupKey} defaultOpen>
                    <Collapsible.Trigger asChild>
                      <HStack
                        gap={2}
                        cursor="pointer"
                        userSelect="none"
                        borderLeftWidth="3px"
                        borderColor="green.300"
                        pl={3}
                        pr={2}
                        py={1}
                        rounded="sm"
                        _hover={{ bg: "bg.subtle" }}
                        transition="background 0.15s"
                      >
                        <Text fontWeight="semibold" color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wide" flex={1}>
                          {bucket.groupName}
                        </Text>
                        <Box
                          color="gray.400"
                          css={{ "[data-state=closed] &": { transform: "rotate(-90deg)" }, "[data-state=open] &": { transform: "rotate(0deg)" } }}
                          style={{ transition: "transform 0.2s" }}
                        >
                          <ChevronDown size={14} />
                        </Box>
                      </HStack>
                    </Collapsible.Trigger>
                    <Collapsible.Content>
                      {renderMatchGrid(bucket.matches)}
                    </Collapsible.Content>
                  </Collapsible.Root>
                ) : (
                  renderMatchGrid(bucket.matches)
                )
              )}
            </Stack>
          );
        }

        function renderStageSections(map: Map<string, StageSection>) {
          return [...map.values()].map((section) => (
            <Collapsible.Root key={section.stageId} defaultOpen>
              <Collapsible.Trigger asChild>
                <HStack
                  gap={3}
                  cursor="pointer"
                  userSelect="none"
                  bg="bg.subtle"
                  borderWidth="1px"
                  borderColor="border"
                  rounded="xl"
                  px={4}
                  py={3}
                  _hover={{ bg: "bg.muted" }}
                  transition="background 0.15s"
                >
                  <Heading as="h3" size="sm" flex={1}>{section.stageName}</Heading>
                  <Badge display={{ base: "none", sm: "flex" }} colorPalette={STAGE_COLORS[section.stageType] ?? "gray"} rounded="full" variant="subtle">
                    {section.stageType === "group" ? "Fase de grupos" : section.stageType === "league" ? "Pontos corridos" : "Mata-mata"}
                  </Badge>
                  <Box
                    color="gray.400"
                    css={{ "[data-state=closed] &": { transform: "rotate(-90deg)" }, "[data-state=open] &": { transform: "rotate(0deg)" } }}
                    style={{ transition: "transform 0.2s" }}
                  >
                    <ChevronDown size={16} />
                  </Box>
                </HStack>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <Stack gap={4} pt={2}>
                  {section.rounds.map((rs) =>
                    section.stageType === "knockout" ? (
                      // Knockout: no round label, groups still collapsible if present
                      <Box key={rs.roundId}>{renderRoundContent(rs)}</Box>
                    ) : (
                      <Collapsible.Root key={rs.roundId} defaultOpen>
                        <Collapsible.Trigger asChild>
                          <HStack
                            gap={2}
                            cursor="pointer"
                            userSelect="none"
                            borderLeftWidth="3px"
                            borderColor="teal.300"
                            pl={3}
                            pr={2}
                            py={1}
                            rounded="sm"
                            _hover={{ bg: "bg.subtle" }}
                            transition="background 0.15s"
                          >
                            <Text fontWeight="semibold" color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wide" flex={1}>
                              {ordinalRound(rs.roundNumber)}
                            </Text>
                            <Box
                              color="gray.400"
                              css={{ "[data-state=closed] &": { transform: "rotate(-90deg)" }, "[data-state=open] &": { transform: "rotate(0deg)" } }}
                              style={{ transition: "transform 0.2s" }}
                            >
                              <ChevronDown size={14} />
                            </Box>
                          </HStack>
                        </Collapsible.Trigger>
                        <Collapsible.Content>
                          {renderRoundContent(rs)}
                        </Collapsible.Content>
                      </Collapsible.Root>
                    )
                  )}
                </Stack>
              </Collapsible.Content>
            </Collapsible.Root>
          ));
        }

        const pending = matches.filter((m) => !predictions[m.id] && !m.isLocked);
        const predicted = matches.filter((m) => !!predictions[m.id]);
        const missed = matches.filter((m) => !predictions[m.id] && m.isLocked);

        function renderMatchCard(match: Match) {
          const prediction = predictions[match.id];
          const draft = scoreDrafts[match.id];
          const homeScore = draft?.homeScore ?? (prediction ? String(prediction.homeScore) : "");
          const awayScore = draft?.awayScore ?? (prediction ? String(prediction.awayScore) : "");
          const isPredictedKnockoutDraw =
            match.stage.isKnockout && homeScore !== "" && awayScore !== "" && Number(homeScore) === Number(awayScore);
          const savedPenaltyWinnerId = prediction?.penaltyWinnerTeamId ? String(prediction.penaltyWinnerTeamId) : "";
          const isDirty =
            prediction !== undefined &&
            draft !== undefined &&
            (
              draft.homeScore !== String(prediction.homeScore) ||
              draft.awayScore !== String(prediction.awayScore) ||
              (isPredictedKnockoutDraw && (draft.penaltyWinnerId ?? "") !== savedPenaltyWinnerId)
            );

          return (
            <Card.Root
              as="section"
              key={match.id}
              rounded="2xl"
              borderWidth={prediction || isDirty ? "2px" : "1px"}
              borderColor={isDirty ? "orange.300" : prediction ? "green.300" : undefined}
            >
              <Card.Body gap={3} p={{ base: 3, md: 4 }}>
                <Stack gap={2}>
                  <HStack gap={2} align="center" wrap="wrap">
                    {match.homeTeam && <TeamLogo team={match.homeTeam} size="sm" />}
                    <Heading as="h2" fontSize={{ base: "md", md: "xl" }} fontWeight="bold" lineHeight="short">
                      {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
                    </Heading>
                    {match.awayTeam && <TeamLogo team={match.awayTeam} size="sm" />}
                  </HStack>
                  <Stack direction="row" align="center" flexWrap="wrap" gap={2}>
                    <Badge
                      colorPalette={match.isLocked ? "red" : "green"}
                      variant="subtle"
                      rounded="full"
                      fontSize="xs"
                    >
                      <HStack gap={1}>
                        {match.isLocked ? <Lock size={10} /> : <Clock size={10} />}
                        {match.isLocked ? "Encerrado" : "Aberto"}
                      </HStack>
                    </Badge>
                    {match.group && (
                      <Badge colorPalette="gray" variant="outline" rounded="full" fontSize="xs">
                        {match.group.name}
                      </Badge>
                    )}
                    <Text color="fg.muted" fontSize="xs">
                      {new Date(match.startsAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Stack>
                  <Stack direction="row" align="center" flexWrap="wrap" gap={2}>
                    {isDirty ? (
                      <Badge colorPalette="orange" rounded="full" variant="subtle">
                        <HStack gap={1}><AlertTriangle size={10} />Alterações não salvas</HStack>
                      </Badge>
                    ) : prediction ? (
                      <Badge colorPalette="green" rounded="full" variant="subtle">
                        <HStack gap={1}><CheckCircle2 size={10} />Palpite salvo: {prediction.homeScore} x {prediction.awayScore}</HStack>
                      </Badge>
                    ) : (
                      <Badge colorPalette="gray" rounded="full" variant="subtle">
                        Sem palpite
                      </Badge>
                    )}
                    {prediction?.score != null && (
                      <Badge
                        colorPalette={prediction.score.points > 0 ? "yellow" : "gray"}
                        variant="subtle"
                        rounded="full"
                        title={
                          prediction.score.exactScore
                            ? "Placar exato"
                            : prediction.score.outcomeHit
                            ? "Resultado correto"
                            : "Sem acerto"
                        }
                      >
                        <HStack gap={1}>
                          <Star size={10} />
                          {prediction.score.points} pts
                          {prediction.score.exactScore && (
                            <Text as="span" fontSize="xs" fontWeight="bold"> · exato</Text>
                          )}
                        </HStack>
                      </Badge>
                    )}
                  </Stack>
                </Stack>

                <Separator />

                <form onSubmit={(event) => onSubmit(event, match)} style={{ width: "100%" }}>
                  <Stack gap={4}>
                    <HStack gap={0} justify="center" align="center">
                      {/* Home team stepper */}
                      <Stack flex={1} align="center" gap={1} minW={0}>
                        <HStack gap={1} justify="center">
                          {match.homeTeam && <TeamLogo team={match.homeTeam} size="xs" />}
                          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" truncate maxW="full">
                            {match.homeTeam?.shortName ?? match.homeTeam?.name ?? "Mandante"}
                          </Text>
                        </HStack>
                        <HStack gap={0} rounded="xl" overflow="hidden" borderWidth="1px" borderColor="border">
                          <Button
                            type="button"
                            variant="ghost"
                            minW="44px"
                            h="44px"
                            px={0}
                            disabled={match.isLocked || homeScore === "" || Number(homeScore) <= 0}
                            onClick={() => updateDraft(match.id, "homeScore", String(Math.max(0, Number(homeScore) - 1)))}
                            fontSize="xl"
                            rounded="none"
                          >
                            −
                          </Button>
                          <Box
                            minW="44px"
                            h="44px"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="xl"
                            fontWeight="bold"
                            borderX="1px solid"
                            borderColor="border"
                          >
                            {homeScore === "" ? "·" : homeScore}
                          </Box>
                          <Button
                            type="button"
                            variant="ghost"
                            minW="44px"
                            h="44px"
                            px={0}
                            disabled={match.isLocked}
                            onClick={() => updateDraft(match.id, "homeScore", String(Number(homeScore || 0) + 1))}
                            fontSize="xl"
                            rounded="none"
                          >
                            +
                          </Button>
                        </HStack>
                      </Stack>

                      {/* Divider */}
                      <Box px={2} color="gray.300" fontWeight="bold" fontSize="xl" flexShrink={0}>×</Box>

                      {/* Away team stepper */}
                      <Stack flex={1} align="center" gap={1} minW={0}>
                        <HStack gap={1} justify="center">
                          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" truncate maxW="full">
                            {match.awayTeam?.shortName ?? match.awayTeam?.name ?? "Visitante"}
                          </Text>
                          {match.awayTeam && <TeamLogo team={match.awayTeam} size="xs" />}
                        </HStack>
                        <HStack gap={0} rounded="xl" overflow="hidden" borderWidth="1px" borderColor="border">
                          <Button
                            type="button"
                            variant="ghost"
                            minW="44px"
                            h="44px"
                            px={0}
                            disabled={match.isLocked || awayScore === "" || Number(awayScore) <= 0}
                            onClick={() => updateDraft(match.id, "awayScore", String(Math.max(0, Number(awayScore) - 1)))}
                            fontSize="xl"
                            rounded="none"
                          >
                            −
                          </Button>
                          <Box
                            minW="44px"
                            h="44px"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="xl"
                            fontWeight="bold"
                            borderX="1px solid"
                            borderColor="border"
                          >
                            {awayScore === "" ? "·" : awayScore}
                          </Box>
                          <Button
                            type="button"
                            variant="ghost"
                            minW="44px"
                            h="44px"
                            px={0}
                            disabled={match.isLocked}
                            onClick={() => updateDraft(match.id, "awayScore", String(Number(awayScore || 0) + 1))}
                            fontSize="xl"
                            rounded="none"
                          >
                            +
                          </Button>
                        </HStack>
                      </Stack>
                    </HStack>
                    {/* Hidden inputs for form submission */}
                    <input type="hidden" name="homeScore" value={homeScore} />
                    <input type="hidden" name="awayScore" value={awayScore} />

                    {match.stage.isKnockout ? (
                      isPredictedKnockoutDraw ? (
                        <Field.Root required>
                          <Field.Label>Vencedor nos pênaltis</Field.Label>
                          <NativeSelect.Root disabled={match.isLocked}>
                            <NativeSelect.Field
                              name="penaltyWinnerTeamId"
                              value={draft?.penaltyWinnerId ?? (prediction?.penaltyWinnerTeamId ? String(prediction.penaltyWinnerTeamId) : "")}
                              onChange={(event) => updateDraft(match.id, "penaltyWinnerId", event.target.value)}
                            >
                              <option value="">Selecione o vencedor</option>
                              {match.homeTeam ? <option value={match.homeTeam.id}>{match.homeTeam.name}</option> : null}
                              {match.awayTeam ? <option value={match.awayTeam.id}>{match.awayTeam.name}</option> : null}
                            </NativeSelect.Field>
                            <NativeSelect.Indicator />
                          </NativeSelect.Root>
                        </Field.Root>
                      ) : (
                        <Text color="fg.muted" fontSize="sm">
                          Jogo de mata-mata — palpite um empate para escolher o vencedor nos pênaltis.
                        </Text>
                      )
                    ) : null}

                    <Button
                      colorPalette={isDirty ? "orange" : "green"}
                      disabled={match.isLocked || !user}
                      rounded="lg"
                      type="submit"
                      width="full"
                    >
                      {isDirty ? "Salvar alterações" : prediction ? "Atualizar palpite" : "Salvar palpite"}
                    </Button>
                  </Stack>
                </form>
              </Card.Body>
            </Card.Root>
          );
        }

        return (
          <Tabs.Root defaultValue="all" variant="enclosed" size="sm">
            <Tabs.List>
              {/* Mobile: icon + count only. Desktop: icon + label + count */}
              <Tabs.Trigger value="all" flex={{ base: 1, sm: "initial" }}>
                <HStack gap={1}>
                  <Users size={13} />
                  <Box as="span" display={{ base: "none", sm: "inline" }}>Todos</Box>
                </HStack>
                <Badge ml={1} colorPalette="gray" variant="subtle" rounded="full">{matches.length}</Badge>
              </Tabs.Trigger>
              <Tabs.Trigger value="pending" flex={{ base: 1, sm: "initial" }}>
                <HStack gap={1}>
                  <Clock size={13} />
                  <Box as="span" display={{ base: "none", sm: "inline" }}>Pendentes</Box>
                </HStack>
                {pending.length > 0 && <Badge ml={1} colorPalette="orange" variant="subtle" rounded="full">{pending.length}</Badge>}
              </Tabs.Trigger>
              <Tabs.Trigger value="predicted" flex={{ base: 1, sm: "initial" }}>
                <HStack gap={1}>
                  <CheckCircle2 size={13} />
                  <Box as="span" display={{ base: "none", sm: "inline" }}>Palpitados</Box>
                </HStack>
                {predicted.length > 0 && <Badge ml={1} colorPalette="green" variant="subtle" rounded="full">{predicted.length}</Badge>}
              </Tabs.Trigger>
              {missed.length > 0 && (
                <Tabs.Trigger value="missed" flex={{ base: 1, sm: "initial" }}>
                  <HStack gap={1}>
                    <AlertTriangle size={13} />
                    <Box as="span" display={{ base: "none", sm: "inline" }}>Sem palpite</Box>
                  </HStack>
                  <Badge ml={1} colorPalette="red" variant="subtle" rounded="full">{missed.length}</Badge>
                </Tabs.Trigger>
              )}
            </Tabs.List>

            <Tabs.Content value="all" pt={4}>
              <Stack gap={8}>{renderStageSections(stageMap)}</Stack>
            </Tabs.Content>

            <Tabs.Content value="pending" pt={4}>
              {pending.length === 0
                ? <Text color="fg.muted" fontSize="sm">Nenhum jogo pendente.</Text>
                : <Stack gap={8}>{renderStageSections(buildStageMap(pending))}</Stack>}
            </Tabs.Content>

            <Tabs.Content value="predicted" pt={4}>
              {predicted.length === 0
                ? <Text color="fg.muted" fontSize="sm">Nenhum palpite registrado ainda.</Text>
                : <Stack gap={8}>{renderStageSections(buildStageMap(predicted))}</Stack>}
            </Tabs.Content>

            {missed.length > 0 && (
              <Tabs.Content value="missed" pt={4}>
                <Stack gap={8}>{renderStageSections(buildStageMap(missed))}</Stack>
              </Tabs.Content>
            )}
          </Tabs.Root>
        );
      })()}

    </Stack>
  );
}
