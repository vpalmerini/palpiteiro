"use client";

import {
  Badge,
  Button,
  Card,
  Field,
  Heading,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Separator,
} from "@chakra-ui/react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { getMatches, getPool, getPredictions, savePrediction } from "@/lib/api";
import type { Match, Pool, Prediction } from "@/types";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export default function PredictionsPage({ params }: PageProps) {
  const [slug, setSlug] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, { homeScore: string; awayScore: string; penaltyWinnerId: string }>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    const storedParticipantId = window.localStorage.getItem(`bolao:${slug}:participantId`);
    void Promise.all([
      getPool(slug),
      getMatches(slug),
      storedParticipantId ? getPredictions(slug, storedParticipantId) : Promise.resolve([]),
    ]).then(([poolData, matchData, predictionData]) => {
      setParticipantId(storedParticipantId);
      setPool(poolData);
      setMatches(matchData);
      setPredictions(Object.fromEntries(predictionData.map((prediction) => [prediction.matchId, prediction])));
      setScoreDrafts(
        Object.fromEntries(
          predictionData.map((prediction) => [
            prediction.matchId,
            {
              homeScore: String(prediction.homeScore),
              awayScore: String(prediction.awayScore),
              penaltyWinnerId: prediction.penaltyWinnerTeamId ? String(prediction.penaltyWinnerTeamId) : "",
            },
          ]),
        ),
      );
    });
  }, [slug]);

  function updateDraft(matchId: number, field: "homeScore" | "awayScore" | "penaltyWinnerId", value: string) {
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

  async function onSubmit(event: FormEvent<HTMLFormElement>, match: Match) {
    event.preventDefault();
    if (!participantId) {
      setMessage("Entre no bolão antes de palpitar.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const penaltyWinnerTeamId = form.get("penaltyWinnerTeamId");
    const saved = await savePrediction(slug, {
      participantId,
      matchId: match.id,
      homeScore: Number(form.get("homeScore")),
      awayScore: Number(form.get("awayScore")),
      penaltyWinnerTeamId: penaltyWinnerTeamId ? Number(penaltyWinnerTeamId) : null,
    });

    setPredictions((current) => ({ ...current, [saved.matchId]: saved }));
    setScoreDrafts((current) => ({
      ...current,
      [saved.matchId]: {
        homeScore: String(saved.homeScore),
        awayScore: String(saved.awayScore),
        penaltyWinnerId: saved.penaltyWinnerTeamId ? String(saved.penaltyWinnerTeamId) : "",
      },
    }));
    setMessage("Palpite salvo.");
  }

  if (!pool) {
    return <Text>Carregando palpites...</Text>;
  }

  return (
    <Stack gap={6}>
      <Card.Root as="section" rounded="2xl" shadow="lg">
        <Card.Body gap={4}>
          <Badge alignSelf="flex-start" colorPalette="blue" rounded="full" px={3} py={1}>
            Palpites
          </Badge>
          <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }}>
            {pool.name}
          </Heading>
          <Text color="gray.600">
          Registre placares antes do início de cada jogo. Em mata-mata, palpite empatado significa decisão nos pênaltis.
          </Text>
          <Button asChild alignSelf="flex-start" colorPalette="blue" rounded="full" variant="subtle">
            <Link href={`/pools/${slug}`}>Voltar ao ranking</Link>
          </Button>
          {!participantId ? <Text color="green.600">Entre no bolão antes de registrar palpites.</Text> : null}
          {message ? <Text color="green.600">{message}</Text> : null}
        </Card.Body>
      </Card.Root>

      {matches.map((match) => {
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
            <Card.Body gap={4}>
              <Stack gap={2}>
                <Stack direction="row" align="center" flexWrap="wrap" gap={2}>
                  <Badge alignSelf="flex-start" colorPalette={match.stage.isKnockout ? "purple" : "blue"} rounded="full">
                    {match.stage.name}
                  </Badge>
                  {isDirty ? (
                    <Badge colorPalette="orange" rounded="full" variant="subtle">
                      Alterações não salvas
                    </Badge>
                  ) : prediction ? (
                    <Badge colorPalette="green" rounded="full" variant="subtle">
                      ✓ Palpite salvo: {prediction.homeScore} x {prediction.awayScore}
                    </Badge>
                  ) : (
                    <Badge colorPalette="orange" rounded="full" variant="subtle">
                      Sem palpite
                    </Badge>
                  )}
                </Stack>
                <Heading as="h2" fontSize="2xl">
                {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
                </Heading>
                <Text color="gray.600">
                  Fecha em {new Date(match.startsAt).toLocaleString("pt-BR")} ·{" "}
                  {match.isLocked ? "bloqueado" : "aberto"}
                </Text>
              </Stack>

              <Separator />

              <form onSubmit={(event) => onSubmit(event, match)}>
                <Stack gap={4}>
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                    <Field.Root required>
                      <Field.Label>Gols {match.homeTeam?.shortName ?? "mandante"}</Field.Label>
                      <Input
                        disabled={match.isLocked}
                        min={0}
                        name="homeScore"
                        onChange={(event) => updateDraft(match.id, "homeScore", event.target.value)}
                        required
                        type="number"
                        value={homeScore}
                      />
                    </Field.Root>
                    <Field.Root required>
                      <Field.Label>Gols {match.awayTeam?.shortName ?? "visitante"}</Field.Label>
                      <Input
                        disabled={match.isLocked}
                        min={0}
                        name="awayScore"
                        onChange={(event) => updateDraft(match.id, "awayScore", event.target.value)}
                        required
                        type="number"
                        value={awayScore}
                      />
                    </Field.Root>
                  </SimpleGrid>

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
                      <Text color="gray.500" fontSize="sm">
                        Jogo de mata-mata — palpite um empate para escolher o vencedor nos pênaltis.
                      </Text>
                    )
                  ) : null}

                  <Button
                    colorPalette={isDirty ? "orange" : "blue"}
                    disabled={match.isLocked || !participantId}
                    rounded="full"
                    type="submit"
                  >
                    {isDirty ? "Salvar alterações" : prediction ? "Atualizar palpite" : "Salvar palpite"}
                  </Button>
                </Stack>
              </form>
            </Card.Body>
          </Card.Root>
        );
      })}
    </Stack>
  );
}
