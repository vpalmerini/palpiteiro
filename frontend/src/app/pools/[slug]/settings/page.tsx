"use client";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Field,
  Heading,
  HStack,
  Input,
  Portal,
  Separator,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { ArrowLeft, Lock, UserMinus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeParticipant, updatePool, type AwardConfigPayload, type RemovedParticipant } from "@/lib/api";
import { poolKeys, usePoolDetail } from "@/lib/pool-queries";
import { PoolDetailPageSkeleton } from "@/components/page-skeletons";
import { useAuth } from "@/contexts/auth";
import type { Pool, RankingEntry } from "@/types";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

type ScoringState = {
  exactScore: number;
  outcome: number;
  oneTeamGoals: number;
  penaltyBonus: number;
};

type AwardsState = {
  champion: AwardConfigPayload;
  runnerUp: AwardConfigPayload;
  thirdPlace: AwardConfigPayload;
  topScorer: AwardConfigPayload;
  bestPlayer: AwardConfigPayload;
};

const SCORING_KEY_ORDER: (keyof ScoringState)[] = ["exactScore", "outcome", "oneTeamGoals", "penaltyBonus"];

const SCORING_LABELS: Record<keyof ScoringState, { label: string; helper: string }> = {
  exactScore:   { label: "Placar exato",         helper: "Acertou o placar certinho" },
  outcome:      { label: "Resultado",             helper: "Acertou vitória, empate ou derrota" },
  oneTeamGoals: { label: "Gols de um time",       helper: "Acertou os gols de pelo menos um dos times" },
  penaltyBonus: { label: "Bônus pênaltis",        helper: "Acertou o vencedor nos pênaltis (mata-mata)" },
};

const AWARD_KEY_ORDER: (keyof AwardsState)[] = ["champion", "runnerUp", "thirdPlace", "topScorer", "bestPlayer"];

const AWARD_LABELS: Record<keyof AwardsState, string> = {
  champion:   "Campeão",
  runnerUp:   "Vice-campeão",
  thirdPlace: "Terceiro lugar",
  topScorer:  "Artilheiro",
  bestPlayer: "Melhor jogador",
};

function ParticipantsSection({
  pool,
  slug,
  ranking,
  removedParticipants,
  creatorUserId,
}: {
  pool: Pool;
  slug: string;
  ranking: RankingEntry[];
  removedParticipants: RemovedParticipant[];
  creatorUserId: string;
}) {
  const queryClient = useQueryClient();
  const [targetUser, setTargetUser] = useState<RankingEntry | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeParticipant(slug, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: poolKeys.detail(slug) });
      setTargetUser(null);
    },
  });

  const others = ranking.filter((e) => e.userId !== creatorUserId);

  return (
    <>
      <Separator />
      <Stack gap={3}>
        <Heading size="sm">Participantes</Heading>
        {others.length === 0 && removedParticipants.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">Nenhum outro participante ainda.</Text>
        ) : (
          <Stack gap={2}>
            {others.map((entry) => (
              <HStack key={entry.userId} gap={3} justify="space-between">
                <HStack gap={3}>
                  <Avatar.Root size="sm">
                    {entry.pictureUrl ? (
                      <Avatar.Image src={entry.pictureUrl} alt={entry.displayName} />
                    ) : (
                      <Avatar.Fallback>{entry.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
                    )}
                  </Avatar.Root>
                  <Stack gap={0}>
                    <Text fontSize="sm" fontWeight="medium">{entry.displayName}</Text>
                    <Text fontSize="xs" color="fg.muted">{entry.points} pts · #{entry.position}</Text>
                  </Stack>
                </HStack>
                <Button
                  size="sm"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() => setTargetUser(entry)}
                  aria-label={`Remover ${entry.displayName}`}
                >
                  <UserMinus size={14} />
                  Remover
                </Button>
              </HStack>
            ))}
            {removedParticipants.length > 0 && (
              <>
                <Separator />
                <Text fontSize="xs" fontWeight="medium" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
                  Removidos
                </Text>
                {removedParticipants.map((entry) => (
                  <HStack key={entry.userId} gap={3} opacity={0.5}>
                    <Avatar.Root size="sm">
                      {entry.pictureUrl ? (
                        <Avatar.Image src={entry.pictureUrl} alt={entry.displayName} />
                      ) : (
                        <Avatar.Fallback>{entry.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
                      )}
                    </Avatar.Root>
                    <Text fontSize="sm" textDecoration="line-through" color="fg.muted">{entry.displayName}</Text>
                    <Badge colorPalette="red" variant="subtle" size="sm">Removido</Badge>
                  </HStack>
                ))}
              </>
            )}
          </Stack>
        )}
      </Stack>

      <Dialog.Root
        open={targetUser !== null}
        onOpenChange={(d) => { if (!d.open) setTargetUser(null); }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Remover participante</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text>
                  Tem certeza que deseja remover{" "}
                  <Text as="span" fontWeight="bold">{targetUser?.displayName}</Text>?
                </Text>
                <Text mt={2} fontSize="sm" color="fg.muted">
                  Esta ação é permanente e irreversível. O participante não poderá mais entrar neste bolão.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button ref={cancelRef} variant="outline" disabled={removeMutation.isPending}>
                    Cancelar
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="red"
                  loading={removeMutation.isPending}
                  onClick={() => {
                    if (targetUser) removeMutation.mutate(targetUser.userId);
                  }}
                >
                  Sim, remover
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}

function PoolSettingsForm({ pool, slug, ranking, removedParticipants }: { pool: Pool; slug: string; ranking: RankingEntry[]; removedParticipants: RemovedParticipant[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState(pool.name);
  const [description, setDescription] = useState(pool.description ?? "");
  const [prize1, setPrize1] = useState(pool.prizes.find((p) => p.position === 1)?.description ?? "");
  const [prize2, setPrize2] = useState(pool.prizes.find((p) => p.position === 2)?.description ?? "");
  const [prize3, setPrize3] = useState(pool.prizes.find((p) => p.position === 3)?.description ?? "");
  const [scoring, setScoring] = useState<ScoringState>({ ...pool.scoring });
  const [awards, setAwards] = useState<AwardsState>({ ...pool.awards });

  const locked = pool.hasPredictions;

  const mutation = useMutation({
    mutationFn: () =>
      updatePool(slug, {
        name,
        description,
        prizes: [
          { position: 1, description: prize1 },
          { position: 2, description: prize2 },
          { position: 3, description: prize3 },
        ],
        ...(!locked && { scoring, awards }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: poolKeys.detail(slug) });
      setSuccess(true);
      setTimeout(() => router.push(`/pools/${slug}`), 1200);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Erro ao salvar alterações.");
    },
  });

  function setAwardField(key: keyof AwardsState, field: keyof AwardConfigPayload, value: boolean | number) {
    setAwards((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  return (
    <Card.Root as="section" maxW="3xl" mx="auto" rounded="2xl" shadow="lg">
      <Card.Body gap={6}>
        <Stack gap={1}>
          <Button asChild variant="ghost" alignSelf="flex-start" size="sm" px={0}>
            <Link href={`/pools/${slug}`}>
              <HStack gap={1}><ArrowLeft size={14} /><span>Voltar ao bolão</span></HStack>
            </Link>
          </Button>
          <HStack gap={3} align="center">
            <Heading as="h1" fontSize={{ base: "2xl", md: "4xl" }}>Configurações do bolão</Heading>
          </HStack>
          <Text color="fg.muted">{pool.name}</Text>
        </Stack>

        <Stack gap={4}>
          {/* Basic info */}
          <Field.Root required>
            <Field.Label>Nome do bolão</Field.Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do bolão" />
          </Field.Root>

          <Field.Root>
            <Field.Label>Descrição</Field.Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Regras combinadas, valor de entrada, observações..."
              rows={4}
            />
          </Field.Root>

          {/* Prizes */}
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
            <Field.Root>
              <Field.Label>Prêmio 1º lugar</Field.Label>
              <Input value={prize1} onChange={(e) => setPrize1(e.target.value)} placeholder="R$ 500" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Prêmio 2º lugar</Field.Label>
              <Input value={prize2} onChange={(e) => setPrize2(e.target.value)} placeholder="R$ 250" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Prêmio 3º lugar</Field.Label>
              <Input value={prize3} onChange={(e) => setPrize3(e.target.value)} placeholder="R$ 100" />
            </Field.Root>
          </SimpleGrid>

          <Separator />

          {/* Scoring */}
          <Stack gap={3}>
            <HStack gap={2} align="center">
              <Heading size="sm">Pontuação dos jogos</Heading>
              {locked && (
                <Badge colorPalette="orange" variant="subtle" gap={1}>
                  <HStack gap={1}><Lock size={10} /><span>Bloqueado</span></HStack>
                </Badge>
              )}
            </HStack>
            {locked && (
              <Text fontSize="sm" color="orange.600">
                Regras de pontuação não podem ser alteradas pois já existem palpites neste bolão.
              </Text>
            )}
            {SCORING_KEY_ORDER.map((key) => (
              <HStack key={key} gap={4} align="center" opacity={locked ? 0.5 : 1}>
                <Stack flex="1" gap={0}>
                  <Text fontSize="sm" fontWeight="medium">{SCORING_LABELS[key].label}</Text>
                  <Text fontSize="xs" color="fg.muted">{SCORING_LABELS[key].helper}</Text>
                </Stack>
                <HStack gap={2} align="center">
                  <Input
                    type="number"
                    min={0}
                    w="20"
                    size="sm"
                    value={scoring[key]}
                    disabled={locked}
                    onChange={(e) =>
                      setScoring((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                  />
                  <Text fontSize="sm" color="fg.muted" whiteSpace="nowrap">pts</Text>
                </HStack>
              </HStack>
            ))}
          </Stack>

          <Separator />

          {/* Awards */}
          <Stack gap={3}>
            <HStack gap={2} align="center">
              <Heading size="sm">Palpites especiais</Heading>
              {locked && (
                <Badge colorPalette="orange" variant="subtle">
                  <HStack gap={1}><Lock size={10} /><span>Bloqueado</span></HStack>
                </Badge>
              )}
            </HStack>
            {locked && (
              <Text fontSize="sm" color="orange.600">
                Palpites especiais não podem ser alterados pois já existem palpites neste bolão.
              </Text>
            )}
            {AWARD_KEY_ORDER.map((key) => (
              <HStack key={key} gap={4} align="center" opacity={locked ? 0.5 : 1}>
                <Checkbox.Root
                  checked={awards[key].enabled}
                  onCheckedChange={(d) => setAwardField(key, "enabled", Boolean(d.checked))}
                  disabled={locked}
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
                    disabled={locked || !awards[key].enabled}
                    onChange={(e) => setAwardField(key, "points", Number(e.target.value))}
                  />
                  <Text fontSize="sm" color="fg.muted" whiteSpace="nowrap">pts</Text>
                </HStack>
              </HStack>
            ))}
          </Stack>

          {error && <Text color="red.600">{error}</Text>}
          {success && <Text color="green.600">Alterações salvas! Redirecionando…</Text>}

          <Button
            colorPalette="green"
            color="white"
            rounded="lg"
            loading={mutation.isPending}
            disabled={mutation.isPending || success}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            Salvar alterações
          </Button>

          {pool.creatorUserId && (
            <ParticipantsSection
              pool={pool}
              slug={slug}
              ranking={ranking}
              removedParticipants={removedParticipants}
              creatorUserId={pool.creatorUserId}
            />
          )}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

export default function PoolSettingsPage({ params }: PageProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [slug, setSlug] = useState("");

  const { data, isPending } = usePoolDetail(slug);
  const pool = data?.pool ?? null;
  const ranking = data?.ranking ?? [];
  const removedParticipants = data?.removedParticipants ?? [];

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/pools/${slug}/settings`);
    }
  }, [authLoading, user, slug, router]);

  if (authLoading || (isPending && !data) || !slug) {
    return <PoolDetailPageSkeleton />;
  }

  if (!pool) {
    return <PoolDetailPageSkeleton />;
  }

  if (user?.id !== pool.creatorUserId) {
    router.replace(`/pools/${slug}`);
    return null;
  }

  if (pool.tournamentStatus === "finished") {
    router.replace(`/pools/${slug}`);
    return null;
  }

  return <PoolSettingsForm pool={pool} slug={slug} ranking={ranking} removedParticipants={removedParticipants} />;
}
