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
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, { homeScore: string; awayScore: string }>>({});
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
            },
          ]),
        ),
      );
    });
  }, [slug]);

  function updateScoreDraft(matchId: number, field: "homeScore" | "awayScore", value: string) {
    setScoreDrafts((current) => ({
      ...current,
      [matchId]: {
        homeScore: current[matchId]?.homeScore ?? "",
        awayScore: current[matchId]?.awayScore ?? "",
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

        return (
          <Card.Root as="section" key={match.id} rounded="2xl">
            <Card.Body gap={4}>
              <Stack gap={2}>
                <Badge alignSelf="flex-start" colorPalette={match.stage.isKnockout ? "purple" : "blue"} rounded="full">
                  {match.stage.name}
                </Badge>
                <Heading as="h2" fontSize="2xl">
                {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
                </Heading>
                <Text color="gray.600">
                  Fecha em {new Date(match.startsAt).toLocaleString("pt-BR")} ·{" "}
                  {match.isLocked ? "bloqueado" : "aberto"}
                </Text>
              </Stack>

              <form onSubmit={(event) => onSubmit(event, match)}>
                <Stack gap={4}>
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                    <Field.Root required>
                      <Field.Label>Gols {match.homeTeam?.shortName ?? "mandante"}</Field.Label>
                      <Input
                        disabled={match.isLocked}
                        min={0}
                        name="homeScore"
                        onChange={(event) => updateScoreDraft(match.id, "homeScore", event.target.value)}
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
                        onChange={(event) => updateScoreDraft(match.id, "awayScore", event.target.value)}
                        required
                        type="number"
                        value={awayScore}
                      />
                    </Field.Root>
                  </SimpleGrid>

                  {match.stage.isKnockout ? (
                    <Stack gap={3}>
                      <Text color="gray.600">
                        Se o palpite for empate, o jogo será considerado decidido nos pênaltis. Nesse caso, escolha o
                        vencedor abaixo.
                      </Text>
                      <Field.Root required={isPredictedKnockoutDraw}>
                        <Field.Label>Vencedor nos pênaltis</Field.Label>
                        <NativeSelect.Root disabled={match.isLocked || !isPredictedKnockoutDraw}>
                          <NativeSelect.Field
                            defaultValue={prediction?.penaltyWinnerTeamId ?? ""}
                            name="penaltyWinnerTeamId"
                          >
                            <option value="">Selecione se o placar for empate</option>
                            {match.homeTeam ? <option value={match.homeTeam.id}>{match.homeTeam.name}</option> : null}
                            {match.awayTeam ? <option value={match.awayTeam.id}>{match.awayTeam.name}</option> : null}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </Field.Root>
                    </Stack>
                  ) : null}

                  <Button colorPalette="blue" disabled={match.isLocked || !participantId} rounded="full" type="submit">
                    {prediction ? "Atualizar palpite" : "Salvar palpite"}
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
