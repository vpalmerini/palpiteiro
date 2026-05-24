"use client";

import {
  Badge,
  Button,
  Card,
  Heading,
  HStack,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getParticipantPools } from "@/lib/api";
import type { MyPoolsByTournament } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Em andamento",
  finished: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: "green",
  finished: "blue",
};

export default function MeusBoloes() {
  const [groups, setGroups] = useState<MyPoolsByTournament[] | null>(null);
  const [hasId, setHasId] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.localStorage.getItem("bolao:participantId");
    if (!id) {
      setHasId(false);
      return;
    }
    setHasId(true);
    void getParticipantPools(id).then(setGroups);
  }, []);

  if (hasId === null) return null;

  if (!hasId) {
    return (
      <Stack gap={6} maxW="2xl" mx="auto">
        <Heading size="xl">Meus Bolões</Heading>
        <Card.Root rounded="2xl">
          <Card.Body gap={4}>
            <Text color="gray.600">
              Você ainda não criou nem entrou em nenhum bolão neste dispositivo.
            </Text>
            <HStack gap={3}>
              <Button asChild colorPalette="blue" rounded="full">
                <Link href="/pools/new">Criar bolão</Link>
              </Button>
            </HStack>
          </Card.Body>
        </Card.Root>
      </Stack>
    );
  }

  if (!groups) {
    return (
      <Stack gap={6} maxW="2xl" mx="auto">
        <Heading size="xl">Meus Bolões</Heading>
        <Text color="gray.500">Carregando…</Text>
      </Stack>
    );
  }

  if (groups.length === 0) {
    return (
      <Stack gap={6} maxW="2xl" mx="auto">
        <Heading size="xl">Meus Bolões</Heading>
        <Card.Root rounded="2xl">
          <Card.Body gap={4}>
            <Text color="gray.600">Você ainda não participa de nenhum bolão.</Text>
            <Button asChild colorPalette="blue" rounded="full" alignSelf="flex-start">
              <Link href="/pools/new">Criar bolão</Link>
            </Button>
          </Card.Body>
        </Card.Root>
      </Stack>
    );
  }

  return (
    <Stack gap={8} maxW="3xl" mx="auto">
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <Heading size="xl">Meus Bolões</Heading>
        <Button asChild colorPalette="blue" variant="subtle" rounded="full">
          <Link href="/pools/new">+ Criar bolão</Link>
        </Button>
      </HStack>

      {groups.map(({ tournament, pools }) => (
        <Stack key={tournament.id} gap={3}>
          <HStack gap={2} align="center">
            <Heading size="md">{tournament.name}</Heading>
            <Badge variant="subtle" fontSize="sm">{tournament.year}</Badge>
            <Badge colorPalette={STATUS_COLORS[tournament.status] ?? "gray"} variant="subtle" fontSize="sm">
              {STATUS_LABELS[tournament.status] ?? tournament.status}
            </Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
            {pools.map((pool) => (
              <Card.Root key={pool.slug} rounded="xl" asChild>
                <Link href={`/pools/${pool.slug}`} style={{ textDecoration: "none" }}>
                  <Card.Body gap={3}>
                    <Stack gap={1}>
                      <Text fontWeight="semibold" fontSize="lg">{pool.name}</Text>
                      <Text fontSize="sm" color="gray.500">
                        Criado por {pool.creatorName} · {pool.participantsCount} participante{pool.participantsCount !== 1 ? "s" : ""}
                      </Text>
                    </Stack>
                    <HStack gap={4}>
                      <Stack gap={0} align="center">
                        <Text fontSize="2xl" fontWeight="bold" lineHeight="1">{pool.myPosition}º</Text>
                        <Text fontSize="xs" color="gray.500">posição</Text>
                      </Stack>
                      <Stack gap={0} align="center">
                        <Text fontSize="2xl" fontWeight="bold" lineHeight="1">{pool.myPoints}</Text>
                        <Text fontSize="xs" color="gray.500">pontos</Text>
                      </Stack>
                    </HStack>
                  </Card.Body>
                </Link>
              </Card.Root>
            ))}
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}
