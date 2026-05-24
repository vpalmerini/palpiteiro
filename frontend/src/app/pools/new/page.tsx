"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Separator,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createPool, listTournaments, type AwardConfigPayload } from "@/lib/api";

type AwardsState = {
  champion: AwardConfigPayload;
  runnerUp: AwardConfigPayload;
  thirdPlace: AwardConfigPayload;
  topScorer: AwardConfigPayload;
  bestPlayer: AwardConfigPayload;
};

const AWARD_LABELS: Record<keyof AwardsState, string> = {
  champion: "Campeão",
  runnerUp: "Vice-campeão",
  thirdPlace: "Terceiro lugar",
  topScorer: "Artilheiro",
  bestPlayer: "Melhor jogador",
};

const DEFAULT_AWARDS: AwardsState = {
  champion: { enabled: true, points: 15 },
  runnerUp: { enabled: true, points: 10 },
  thirdPlace: { enabled: true, points: 7 },
  topScorer: { enabled: false, points: 10 },
  bestPlayer: { enabled: false, points: 10 },
};

export default function NewPoolPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [awards, setAwards] = useState<AwardsState>(DEFAULT_AWARDS);
  const [tournaments, setTournaments] = useState<{ id: number; name: string; year: number; status: string }[]>([]);
  const [tournamentId, setTournamentId] = useState<number | null>(null);

  useEffect(() => {
    listTournaments().then((ts) => {
      setTournaments(ts);
      if (ts.length > 0) setTournamentId(ts[0].id);
    });
  }, []);

  function setAwardField(key: keyof AwardsState, field: keyof AwardConfigPayload, value: boolean | number) {
    setAwards((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!tournamentId) {
      setError("Selecione um torneio.");
      setIsSubmitting(false);
      return;
    }

    const form = new FormData(event.currentTarget);
    try {
      const pool = await createPool({
        tournamentId,
        name: String(form.get("name")),
        description: String(form.get("description")),
        creatorName: String(form.get("creatorName")),
        creatorEmail: String(form.get("creatorEmail")),
        creatorNickname: String(form.get("creatorNickname") || ""),
        prizes: [1, 2, 3].map((position) => ({
          position,
          description: String(form.get(`prize${position}`)),
        })),
        awards,
      });
      window.localStorage.setItem(`bolao:${pool.slug}:participantId`, pool.creatorParticipantId);
      router.push(`/pools/${pool.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o bolão.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card.Root as="section" maxW="3xl" mx="auto" rounded="2xl" shadow="lg">
      <Card.Body gap={6}>
        <Stack gap={3}>
          <Badge alignSelf="flex-start" colorPalette="blue" rounded="full" px={3} py={1}>
            Novo bolão
          </Badge>
          <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }}>
            Configure a experiência
          </Heading>
          <Text color="gray.600">Defina o nome, os prêmios e compartilhe o link público com os participantes.</Text>
        </Stack>

        <form onSubmit={onSubmit}>
          <Stack gap={4}>
            <Field.Root required>
              <Field.Label>Torneio</Field.Label>
              {tournaments.length === 0 ? (
                <Text color="orange.600" fontSize="sm">
                  Nenhum torneio cadastrado. Peça ao administrador para criar um antes de abrir um bolão.
                </Text>
              ) : (
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={tournamentId ?? ""}
                    onChange={(e) => setTournamentId(Number(e.target.value))}
                  >
                    {tournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.year}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              )}
            </Field.Root>
            <Field.Root required>
              <Field.Label>Nome do bolão</Field.Label>
              <Input name="name" placeholder="Bolão da firma" />
            </Field.Root>
            <Field.Root required>
              <Field.Label>Nome</Field.Label>
              <Input name="creatorName" placeholder="Victor" />
            </Field.Root>
            <Field.Root required>
              <Field.Label>E-mail</Field.Label>
              <Input name="creatorEmail" placeholder="seu-email@exemplo.com" type="email" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Nickname</Field.Label>
              <Input name="creatorNickname" placeholder="Como você quer aparecer no ranking" />
              <Field.HelperText>Opcional. Se não preencher, o nome do criador será usado.</Field.HelperText>
            </Field.Root>
            <Field.Root>
              <Field.Label>Descrição</Field.Label>
              <Textarea name="description" placeholder="Regras combinadas, valor de entrada, observações..." rows={4} />
            </Field.Root>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              <Field.Root required>
                <Field.Label>Prêmio 1º lugar</Field.Label>
                <Input name="prize1" placeholder="R$ 500" />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Prêmio 2º lugar</Field.Label>
                <Input name="prize2" placeholder="R$ 250" />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Prêmio 3º lugar</Field.Label>
                <Input name="prize3" placeholder="R$ 100" />
              </Field.Root>
            </SimpleGrid>

            <Separator />

            <Stack gap={3}>
              <Heading size="sm">Palpites especiais</Heading>
              <Text color="gray.600" fontSize="sm">
                Permita que os participantes palpitem o campeão, vice e terceiro lugar do torneio, além de artilheiro e melhor jogador. Cada acerto vale os pontos configurados.
              </Text>
              {(Object.keys(awards) as (keyof AwardsState)[]).map((key) => (
                <HStack key={key} gap={4} align="center">
                  <Checkbox.Root
                    checked={awards[key].enabled}
                    onCheckedChange={(d) => setAwardField(key, "enabled", Boolean(d.checked))}
                    flex="1"
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                    <Checkbox.Label>{AWARD_LABELS[key]}</Checkbox.Label>
                  </Checkbox.Root>
                  <HStack gap={2} align="center" opacity={awards[key].enabled ? 1 : 0.4}>
                    <Input
                      type="number"
                      min={1}
                      w="20"
                      size="sm"
                      value={awards[key].points}
                      onChange={(e) => setAwardField(key, "points", Number(e.target.value))}
                      disabled={!awards[key].enabled}
                    />
                    <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">pts</Text>
                  </HStack>
                </HStack>
              ))}
            </Stack>

            {error ? <Text color="red.600">{error}</Text> : null}
            <Button colorPalette="blue" disabled={isSubmitting || tournaments.length === 0} rounded="full" type="submit">
              {isSubmitting ? "Criando..." : "Criar bolão"}
            </Button>
          </Stack>
        </form>
      </Card.Body>
    </Card.Root>
  );
}
