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
import { useRouter } from "next/navigation";

import { getMyPools } from "@/lib/api";
import { MeusBoloesPageSkeleton } from "@/components/page-skeletons";
import { useAuth } from "@/contexts/auth";
import type { MyPoolsByTournament } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Em andamento",
  finished: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: "green",
  finished: "gray",
};

export default function MeusBoloes() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<MyPoolsByTournament[] | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/meus-boloes");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    void getMyPools().then(setGroups);
  }, [user]);

  if (authLoading || !user) {
    return <MeusBoloesPageSkeleton />;
  }

  if (!groups) {
    return <MeusBoloesPageSkeleton />;
  }

  if (groups.length === 0) {
    return (
      <Stack gap={6} maxW="2xl" mx="auto">
        <Heading size="xl">Meus Bolões</Heading>
        <Card.Root rounded="2xl">
          <Card.Body gap={4}>
            <Text color="fg.muted">Você ainda não participa de nenhum bolão.</Text>
            <Button asChild colorPalette="green" rounded="lg" alignSelf="flex-start" color="white">
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
        <Button asChild colorPalette="green" rounded="lg" color="white">
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
                      <Text fontSize="sm" color="fg.muted">
                        Criado por {pool.creatorName} · {pool.participantsCount} participante{pool.participantsCount !== 1 ? "s" : ""}
                      </Text>
                    </Stack>
                    <HStack gap={4}>
                      <Stack gap={0} align="center">
                        <Text fontSize="2xl" fontWeight="bold" lineHeight="1">{pool.myPosition}º</Text>
                        <Text fontSize="xs" color="fg.muted">posição</Text>
                      </Stack>
                      <Stack gap={0} align="center">
                        <Text fontSize="2xl" fontWeight="bold" lineHeight="1">{pool.myPoints}</Text>
                        <Text fontSize="xs" color="fg.muted">pontos</Text>
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
