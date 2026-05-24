"use client";

import {
  Badge,
  Button,
  Card,
  Field,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { getMatches, getPool, getRanking, joinPool } from "@/lib/api";
import type { Match, Pool, RankingEntry } from "@/types";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export default function PoolPage({ params }: PageProps) {
  const [slug, setSlug] = useState<string>("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    void Promise.all([getPool(slug), getMatches(slug), getRanking(slug)]).then(([poolData, matchData, rankingData]) => {
      setParticipantId(window.localStorage.getItem(`bolao:${slug}:participantId`));
      setPool(poolData);
      setMatches(matchData);
      setRanking(rankingData);
    });
  }, [slug]);

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined" || !slug) return "";
    return `${window.location.origin}/pools/${slug}`;
  }, [slug]);

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug) return;

    const form = new FormData(event.currentTarget);
    const globalId = window.localStorage.getItem("bolao:participantId") ?? undefined;
    const result = await joinPool(slug, {
      name: String(form.get("name")),
      email: String(form.get("email")),
      nickname: String(form.get("nickname") || ""),
      participantId: participantId ?? globalId,
    });
    window.localStorage.setItem(`bolao:${slug}:participantId`, result.participantId);
    if (!window.localStorage.getItem("bolao:participantId")) {
      window.localStorage.setItem("bolao:participantId", result.participantId);
    }
    setParticipantId(result.participantId);
    setMessage("Entrada confirmada. Agora você já pode registrar seus palpites.");
    setRanking(await getRanking(slug));
  }

  async function copyPublicLink() {
    if (!publicUrl) return;

    await navigator.clipboard.writeText(publicUrl);
    setCopyMessage("Link copiado para a área de transferência.");
  }

  if (!pool) {
    return <Text>Carregando bolão...</Text>;
  }

  return (
    <Stack gap={6}>
      <Card.Root as="section" rounded="2xl" shadow="lg">
        <Card.Body gap={4}>
          <Badge alignSelf="flex-start" colorPalette="blue" rounded="full" px={3} py={1}>
            Link público
          </Badge>
          <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }}>
            {pool.name}
          </Heading>
          <Text color="gray.600">{pool.description || "Sem descrição."}</Text>
          <Input readOnly value={publicUrl} onFocus={(event) => event.currentTarget.select()} />
          <Button alignSelf="flex-start" colorPalette="blue" onClick={copyPublicLink} rounded="full">
            Copiar link
          </Button>
          {copyMessage ? <Text color="green.600">{copyMessage}</Text> : null}
        </Card.Body>
      </Card.Root>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Card.Root as="section" rounded="2xl">
          <Card.Body gap={4}>
            {participantId ? (
              <>
                <Card.Title>Você já está no bolão</Card.Title>
                <Text color="green.600">Sua participação está confirmada neste navegador.</Text>
                {message ? <Text color="green.600">{message}</Text> : null}
                <Button asChild alignSelf="flex-start" color="white" colorPalette="blue" rounded="full">
                  <Link href={`/pools/${slug}/predictions`}>Fazer palpites</Link>
                </Button>
              </>
            ) : (
              <>
                <Card.Title>Entrar no bolão</Card.Title>
                <form onSubmit={onJoin}>
                  <Stack gap={4}>
                    <Field.Root required>
                      <Field.Label>Nome</Field.Label>
                      <Input name="name" placeholder="Seu nome" />
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>Nickname</Field.Label>
                      <Input name="nickname" placeholder="Como você quer aparecer no ranking" />
                      <Field.HelperText>Opcional. Se não preencher, seu nome será usado.</Field.HelperText>
                    </Field.Root>
                    <Field.Root required>
                      <Field.Label>E-mail</Field.Label>
                      <Input name="email" placeholder="seu-email@exemplo.com" type="email" />
                    </Field.Root>
                    {message ? <Text color="green.600">{message}</Text> : null}
                    <Button colorPalette="blue" rounded="full" type="submit">
                      Participar
                    </Button>
                  </Stack>
                </form>
              </>
            )}
          </Card.Body>
        </Card.Root>

        <Card.Root as="section" rounded="2xl">
          <Card.Body gap={4}>
            {pool.description ? (
              <>
                <Card.Title>Descrição</Card.Title>
                <Text color="gray.600">{pool.description}</Text>
              </>
            ) : null}
            <Card.Title>Prêmios</Card.Title>
            <Stack gap={3}>
              {pool.prizes.map((prize) => (
                <Text color="gray.700" key={prize.position}>
                  <Text as="span" fontWeight="bold">
                    {prize.position}º lugar:
                  </Text>{" "}
                  {prize.description}
                </Text>
              ))}
            </Stack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <Card.Root as="section" rounded="2xl">
        <Card.Body gap={4}>
          <Card.Title>Ranking</Card.Title>
          <Table.ScrollArea>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="12">Pos.</Table.ColumnHeader>
                  <Table.ColumnHeader>Participante</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="center">Pontos</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="center" title="Critério de desempate 1">Placares exatos</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="center" title="Critério de desempate 2">Resultados</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="center" title="Critério de desempate 3">Pts. mata-mata</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {ranking.map((entry) => (
                  <Table.Row key={entry.participantId}>
                    <Table.Cell>{entry.position}</Table.Cell>
                    <Table.Cell>{entry.displayName}</Table.Cell>
                    <Table.Cell textAlign="center" fontWeight="semibold">{entry.points}</Table.Cell>
                    <Table.Cell textAlign="center">{entry.exactScores}</Table.Cell>
                    <Table.Cell textAlign="center">{entry.outcomeHits}</Table.Cell>
                    <Table.Cell textAlign="center">{entry.knockoutPoints}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>
          {ranking.length === 0 ? <Text color="gray.600">Nenhum participante ainda.</Text> : null}
        </Card.Body>
      </Card.Root>

      <Card.Root as="section" rounded="2xl">
        <Card.Body gap={4}>
          <Card.Title>Próximos jogos</Card.Title>
          <Stack gap={3}>
            {matches.map((match) => (
              <Card.Root key={match.id} rounded="xl" variant="outline">
                <Card.Body gap={3}>
                  <Text fontWeight="bold">
                    {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
                  </Text>
                  <Text color="gray.600">
                    {match.stage.name} · {new Date(match.startsAt).toLocaleString("pt-BR")} ·{" "}
                    {match.isLocked ? "palpites bloqueados" : "palpites abertos"}
                  </Text>
                  <Button asChild alignSelf="flex-start" colorPalette="blue" rounded="full" size="sm" variant="subtle">
                    <Link href={`/pools/${slug}/predictions`}>Fazer palpites</Link>
                  </Button>
                </Card.Body>
              </Card.Root>
            ))}
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
