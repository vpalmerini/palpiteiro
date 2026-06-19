"use client";

import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Field,
  Heading,
  HStack,
  Input,
  Separator,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Copy, Link2, LineChart as LineChartIcon, Lock, LogIn, Medal, Settings, Share2, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { joinPool, ordinalRound } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { poolKeys, usePoolDetail, usePrefetchPredictionSetup } from "@/lib/pool-queries";
import { PoolDetailPageSkeleton } from "@/components/page-skeletons";
import { TeamLogo, TeamName } from "@/components/team-badge";
import { useAuth } from "@/contexts/auth";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export default function PoolPage({ params }: PageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prefetchPredictions = usePrefetchPredictionSetup();
  const [slug, setSlug] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const { data, isPending } = usePoolDetail(slug);
  const pool = data?.pool ?? null;
  const matches = data?.matches ?? [];
  const ranking = data?.ranking ?? [];
  const rankingUpdatedAt = data?.rankingUpdatedAt ?? null;
  const snapshots = data?.snapshots ?? [];
  const predictedMatchIds = useMemo(
    () => new Set(data?.predictedMatchIds ?? []),
    [data?.predictedMatchIds],
  );

  const joinMutation = useMutation({
    mutationFn: (nickname: string) => joinPool(slug, { nickname }),
    onSuccess: () => {
      setMessage("Entrada confirmada. Agora você já pode registrar seus palpites.");
      void queryClient.invalidateQueries({ queryKey: poolKeys.detail(slug) });
    },
  });

  useEffect(() => {
    Promise.resolve(params).then(({ slug: routeSlug }) => setSlug(routeSlug));
  }, [params]);

  // ── Timeline chart data ────────────────────────────────────────────────────
  const { chartData, participants, stageNames } = useMemo(() => {
    if (!snapshots.length) return { chartData: [], participants: [], stageNames: new Set<string>() };

    const stageNamesSet = new Set(snapshots.map((s) => s.stageName));
    const multipleStages = stageNamesSet.size > 1;

    // Collect all participant ids (ordered by final snapshot position)
    const lastSnapshot = snapshots[snapshots.length - 1];
    const participantsSorted = [...lastSnapshot.entries].sort((a, b) => a.position - b.position);

    const chartPoints = snapshots.map((snap) => {
      const label = multipleStages
        ? `${snap.stageName.substring(0, 6)}… ${ordinalRound(snap.roundNumber)}`
        : ordinalRound(snap.roundNumber);
      const point: Record<string, string | number> = { label };
      for (const entry of snap.entries) {
        point[entry.displayName] = entry.position;
        (point as Record<string, number>)[`${entry.displayName}_pts`] = entry.points;
      }
      return point;
    });

    return { chartData: chartPoints, participants: participantsSorted, stageNames: stageNamesSet };
  }, [snapshots]);

  // Map displayName → pictureUrl built from ranking data
  const pictureMap = useMemo(
    () => new Map(ranking.map((e) => [e.displayName, e.pictureUrl])),
    [ranking],
  );

  const LINE_COLORS = [
    "#3182CE", "#E53E3E", "#38A169", "#D69E2E", "#805AD5",
    "#DD6B20", "#319795", "#D53F8C", "#2B6CB0", "#744210",
  ];

  const publicUrl = typeof window !== "undefined" && slug
    ? `${window.location.origin}/pools/${slug}`
    : "";

  async function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug) return;

    const form = new FormData(event.currentTarget);
    joinMutation.mutate(String(form.get("nickname") || ""));
  }

  async function copyPublicLink() {
    if (!publicUrl) return;

    await navigator.clipboard.writeText(publicUrl);
    setCopyMessage("Link copiado para a área de transferência.");
  }

  if ((isPending && !data) || !pool) {
    return <PoolDetailPageSkeleton />;
  }

  const prefetchProps = {
    onMouseEnter: () => prefetchPredictions(slug),
    onFocus: () => prefetchPredictions(slug),
  };

  if (pool.isRemoved) {
    return (
      <Card.Root rounded="2xl" shadow="lg" mt={8}>
        <Card.Body gap={4}>
          <Alert.Root status="error" rounded="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Você foi removido deste bolão</Alert.Title>
              <Alert.Description>
                O criador removeu sua participação. Não é possível interagir com este bolão.
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
          <Button asChild variant="outline" rounded="lg" alignSelf="flex-start">
            <Link href="/meus-boloes">Voltar para Meus Bolões</Link>
          </Button>
        </Card.Body>
      </Card.Root>
    );
  }

  if (pool.locked && !pool.isParticipant) {
    return (
      <Card.Root rounded="2xl" shadow="lg" mt={8}>
        <Card.Body gap={4}>
          <Alert.Root status="warning" rounded="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Bolão bloqueado</Alert.Title>
              <Alert.Description>
                O criador bloqueou o acesso a novos participantes. Não é possível entrar neste bolão no momento.
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
          <Button asChild variant="outline" rounded="lg" alignSelf="flex-start">
            <Link href="/">Ir para a página inicial</Link>
          </Button>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <Stack gap={6}>
      <Card.Root as="section" rounded="2xl" shadow="lg">
        <Card.Body gap={4}>
          <Badge alignSelf="flex-start" colorPalette="green" rounded="full" px={3} py={1}>
            <HStack gap={1}><Link2 size={12} />Link público</HStack>
          </Badge>
          <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }}>
            {pool.name}
          </Heading>
          <Text color="fg.muted">{pool.description || "Sem descrição."}</Text>
          <Input readOnly value={publicUrl} onFocus={(event) => event.currentTarget.select()} />
          <HStack gap={2} flexWrap="wrap">
            <Button alignSelf="flex-start" colorPalette="green" color="white" onClick={copyPublicLink} rounded="lg">
              <HStack gap={2}><Copy size={15} /><span>Copiar link</span></HStack>
            </Button>
            {user?.id === pool.creatorUserId && pool.tournamentStatus !== "finished" && (
              <Button asChild alignSelf="flex-start" variant="outline" rounded="lg">
                <Link href={`/pools/${slug}/settings`}>
                  <HStack gap={2}><Settings size={15} /><span>Configurações</span></HStack>
                </Link>
              </Button>
            )}
          </HStack>
          {copyMessage ? <Text color="green.600">{copyMessage}</Text> : null}
        </Card.Body>
      </Card.Root>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Card.Root as="section" rounded="2xl">
          <Card.Body gap={4}>
            {pool.isParticipant ? (
              <>
                <Card.Title><HStack gap={2}><CheckCircle2 size={18} color="var(--chakra-colors-green-500)" />Você já está no bolão</HStack></Card.Title>
                <Text color="green.600">Sua participação está confirmada.</Text>
                {message ? <Text color="green.600">{message}</Text> : null}
                <Button asChild alignSelf="flex-start" color="white" colorPalette="green" rounded="lg">
                  <Link href={`/pools/${slug}/predictions`} {...prefetchProps}><HStack gap={2}><ClipboardList size={15} /><span>Fazer palpites</span></HStack></Link>
                </Button>
              </>
            ) : pool.participantsCount >= 30 ? (
              <>
                <Card.Title><HStack gap={2}><Users size={18} />Bolão lotado</HStack></Card.Title>
                <Text color="fg.muted">Este bolão já atingiu o limite de 30 participantes.</Text>
              </>
            ) : !user ? (
              <>
                <Card.Title><HStack gap={2}><UserPlus size={18} />Entrar no bolão</HStack></Card.Title>
                <Text color="fg.muted">Você precisa estar logado para participar deste bolão.</Text>
                <Button asChild alignSelf="flex-start" color="white" colorPalette="green" rounded="lg">
                  <Link href={`/login?next=/pools/${slug}`}><HStack gap={2}><LogIn size={15} /><span>Entrar com Google</span></HStack></Link>
                </Button>
              </>
            ) : (
              <>
                <Card.Title><HStack gap={2}><UserPlus size={18} />Entrar no bolão</HStack></Card.Title>
                <form onSubmit={onJoin}>
                  <Stack gap={4}>
                    <Field.Root>
                      <Field.Label>Nickname</Field.Label>
                      <Input name="nickname" placeholder="Como você quer aparecer no ranking" />
                      <Field.HelperText>Opcional. Se não preencher, seu nome do Google será usado.</Field.HelperText>
                    </Field.Root>
                    {message ? <Text color="green.600">{message}</Text> : null}
                    <Button colorPalette="green" color="white" rounded="lg" type="submit" loading={joinMutation.isPending}>
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
                <Text color="fg.muted">{pool.description}</Text>
              </>
            ) : null}
            <Card.Title><HStack gap={2}><Trophy size={18} />Prêmios</HStack></Card.Title>
            <Stack gap={3}>
              {pool.prizes.map((prize) => (
                <HStack key={prize.position} gap={2}>
                  <Medal size={15} color={prize.position === 1 ? "gold" : prize.position === 2 ? "silver" : "#cd7f32"} />
                  <Text color="gray.700">
                    <Text as="span" fontWeight="bold">{prize.position}º lugar:</Text>{" "}{prize.description}
                  </Text>
                </HStack>
              ))}
            </Stack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <Card.Root as="section" rounded="2xl">
        <Card.Body gap={5}>
          <Card.Title>Regras do bolão</Card.Title>

          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">Pontuação dos jogos</Text>
            <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} mt={1}>
              <Stack gap={0}>
                <Text fontSize="xl" fontWeight="bold">{pool.scoring.exactScore} pts</Text>
                <Text fontSize="sm" color="fg.muted">Placar exato</Text>
              </Stack>
              <Stack gap={0}>
                <Text fontSize="xl" fontWeight="bold">{pool.scoring.outcome} pts</Text>
                <Text fontSize="sm" color="fg.muted">Resultado correto</Text>
              </Stack>
              <Stack gap={0}>
                <Text fontSize="xl" fontWeight="bold">{pool.scoring.oneTeamGoals} pt</Text>
                <Text fontSize="sm" color="fg.muted">Gols de um time</Text>
              </Stack>
              <Stack gap={0}>
                <Text fontSize="xl" fontWeight="bold">{pool.scoring.penaltyBonus} pts</Text>
                <Text fontSize="sm" color="fg.muted">Acerto de pênalti</Text>
              </Stack>
            </SimpleGrid>
          </Stack>

          {(pool.awards.champion.enabled || pool.awards.runnerUp.enabled || pool.awards.thirdPlace.enabled ||
            pool.awards.topScorer.enabled || pool.awards.bestPlayer.enabled) && (
            <>
              <Separator />
              <Stack gap={1}>
                <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">Palpites especiais</Text>
                <SimpleGrid columns={{ base: 2, md: 3 }} gap={3} mt={1}>
                  {pool.awards.champion.enabled && (
                    <HStack gap={2}>
                      <Badge colorPalette="yellow" variant="subtle">{pool.awards.champion.points} pts</Badge>
                      <Text fontSize="sm">Campeão</Text>
                    </HStack>
                  )}
                  {pool.awards.runnerUp.enabled && (
                    <HStack gap={2}>
                      <Badge colorPalette="yellow" variant="subtle">{pool.awards.runnerUp.points} pts</Badge>
                      <Text fontSize="sm">Vice-campeão</Text>
                    </HStack>
                  )}
                  {pool.awards.thirdPlace.enabled && (
                    <HStack gap={2}>
                      <Badge colorPalette="yellow" variant="subtle">{pool.awards.thirdPlace.points} pts</Badge>
                      <Text fontSize="sm">3º lugar</Text>
                    </HStack>
                  )}
                  {pool.awards.topScorer.enabled && (
                    <HStack gap={2}>
                      <Badge colorPalette="yellow" variant="subtle">{pool.awards.topScorer.points} pts</Badge>
                      <Text fontSize="sm">Artilheiro</Text>
                    </HStack>
                  )}
                  {pool.awards.bestPlayer.enabled && (
                    <HStack gap={2}>
                      <Badge colorPalette="yellow" variant="subtle">{pool.awards.bestPlayer.points} pts</Badge>
                      <Text fontSize="sm">Melhor jogador</Text>
                    </HStack>
                  )}
                </SimpleGrid>
              </Stack>
            </>
          )}

          <Separator />

          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">Critérios de desempate</Text>
            <Stack gap={1} mt={1}>
              {[
                "Maior número de placares exatos",
                "Maior número de resultados acertados",
                "Mais pontos em jogos de mata-mata",
              ].map((rule, i) => (
                <HStack key={i} gap={2}>
                  <Badge variant="outline" colorPalette="gray" fontSize="xs">{i + 1}</Badge>
                  <Text fontSize="sm" color="gray.700">{rule}</Text>
                </HStack>
              ))}
            </Stack>
          </Stack>
        </Card.Body>
      </Card.Root>

      <Card.Root as="section" rounded="2xl">
        <Card.Body gap={4}>
          <HStack justify="space-between" align="baseline" flexWrap="wrap" gap={2}>
            <Card.Title>Ranking</Card.Title>
            <HStack gap={1.5} color="fg.muted">
              <Clock size={14} aria-hidden />
              <Text fontSize="xs">
                {rankingUpdatedAt
                  ? `Atualizado em ${formatDateTime(rankingUpdatedAt)}`
                  : "Aguardando resultados para atualizar o ranking"}
              </Text>
            </HStack>
          </HStack>
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
                  <Table.Row key={entry.userId}>
                    <Table.Cell>{entry.position}</Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <Avatar.Root size="sm">
                          {entry.pictureUrl ? (
                            <Avatar.Image src={entry.pictureUrl} alt={entry.displayName} />
                          ) : (
                            <Avatar.Fallback>{entry.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
                          )}
                        </Avatar.Root>
                        <Text>{entry.displayName}</Text>
                      </HStack>
                    </Table.Cell>
                    <Table.Cell textAlign="center" fontWeight="semibold">{entry.points}</Table.Cell>
                    <Table.Cell textAlign="center">{entry.exactScores}</Table.Cell>
                    <Table.Cell textAlign="center">{entry.outcomeHits}</Table.Cell>
                    <Table.Cell textAlign="center">{entry.knockoutPoints}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>
          {ranking.length === 0 ? <Text color="fg.muted">Nenhum participante ainda.</Text> : null}
        </Card.Body>
      </Card.Root>

      {snapshots.length > 0 && (
        <Card.Root as="section" rounded="2xl">
          <Card.Body gap={4}>
            <Card.Title><HStack gap={2}><LineChartIcon size={18} />Timeline do ranking</HStack></Card.Title>
            {stageNames.size > 0 && (
              <HStack gap={2} flexWrap="wrap">
                {[...stageNames].map((name) => (
                  <Badge key={name} variant="outline" colorPalette="green" fontSize="xs">{name}</Badge>
                ))}
              </HStack>
            )}
            <Box w="full" h={{ base: `${Math.max(280, participants.length * 44)}px`, md: `${Math.max(360, participants.length * 52)}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chakra-colors-gray-200)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    reversed
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    domain={[1, participants.length || 1]}
                    label={{ value: "Pos.", angle: -90, position: "insideLeft", offset: 20, style: { fontSize: 11 } }}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <Box bg="white" border="1px solid" borderColor="gray.200" rounded="md" p={3} shadow="md" fontSize="sm">
                          <Text fontWeight="semibold" mb={1}>{label}</Text>
                          {payload
                            .filter((entry: any) => !String(entry.dataKey).endsWith("_pts"))
                            .sort((a: any, b: any) => a.value - b.value)
                            .map((entry: any) => {
                              const pts = payload.find((e: any) => e.dataKey === `${entry.dataKey}_pts`)?.value;
                              return (
                                <HStack key={entry.dataKey} gap={2}>
                                  <Box w={3} h={3} rounded="full" bg={entry.color} flexShrink={0} />
                                  <Text color="gray.700">{entry.name}: <Text as="span" fontWeight="bold">{entry.value}º</Text>{pts != null ? ` (${pts} pts)` : ""}</Text>
                                </HStack>
                              );
                            })}
                        </Box>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: string) => (value as any).endsWith("_pts") ? null : value}
                  />
                  {participants.map((p, idx) => {
                    const color = LINE_COLORS[idx % LINE_COLORS.length];
                    const pic = pictureMap.get(p.displayName) ?? null;
                    const R = 10;

                    return (
                      <Line
                        key={p.userId}
                        type="monotone"
                        dataKey={p.displayName}
                        stroke={color}
                        strokeWidth={2}
                        connectNulls
                        dot={(dotProps) => {
                          const { cx, cy, index } = dotProps as { cx: number; cy: number; index: number };
                          const uid = `av-${p.userId}-${index}`;
                          if (pic) {
                            return (
                              <g key={uid}>
                                <defs>
                                  <clipPath id={uid}>
                                    <circle cx={cx} cy={cy} r={R} />
                                  </clipPath>
                                </defs>
                                <circle cx={cx} cy={cy} r={R + 1} fill={color} />
                                <image href={pic} x={cx - R} y={cy - R} width={R * 2} height={R * 2} clipPath={`url(#${uid})`} />
                              </g>
                            );
                          }
                          return <circle key={uid} cx={cx} cy={cy} r={R} fill={color} stroke="white" strokeWidth={2} />;
                        }}
                        activeDot={(dotProps) => {
                          const { cx, cy, index } = dotProps as { cx: number; cy: number; index: number };
                          const uid = `av-a-${p.userId}-${index}`;
                          const Ra = R + 3;
                          if (pic) {
                            return (
                              <g key={uid}>
                                <defs>
                                  <clipPath id={uid}>
                                    <circle cx={cx} cy={cy} r={Ra} />
                                  </clipPath>
                                </defs>
                                <circle cx={cx} cy={cy} r={Ra + 2} fill={color} opacity={0.4} />
                                <circle cx={cx} cy={cy} r={Ra + 1} fill={color} />
                                <image href={pic} x={cx - Ra} y={cy - Ra} width={Ra * 2} height={Ra * 2} clipPath={`url(#${uid})`} />
                              </g>
                            );
                          }
                          return <circle key={uid} cx={cx} cy={cy} r={Ra} fill={color} stroke="white" strokeWidth={2} />;
                        }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </Box>
            <Text fontSize="xs" color="fg.muted">
              Posição no ranking ao final de cada rodada finalizada pelo admin.
            </Text>
          </Card.Body>
        </Card.Root>
      )}

      <Card.Root as="section" rounded="2xl">
        <Card.Body gap={4}>
          {(() => {
            const upcomingMatches = matches.filter((m) => !m.isLocked);
            return (
          <>
          <HStack justify="space-between" align="center">
            <Card.Title><HStack gap={2}><CalendarDays size={18} />Próximos jogos</HStack></Card.Title>
            {upcomingMatches.length > 6 && (
              <Button asChild size="xs" variant="ghost" colorPalette="green">
                <Link href={`/pools/${slug}/predictions`} {...prefetchProps}>Ver todos ({upcomingMatches.length})</Link>
              </Button>
            )}
          </HStack>
          {upcomingMatches.length === 0 ? (
            <Text color="fg.muted" fontSize="sm">Nenhum jogo próximo.</Text>
          ) : (
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
            {upcomingMatches.slice(0, 6).map((match) => {
              const hasPrediction = predictedMatchIds.has(match.id);
              return (
                <Card.Root
                  key={match.id}
                  rounded="xl"
                  variant="outline"
                  borderColor={hasPrediction ? "green.300" : undefined}
                  borderWidth={hasPrediction ? "2px" : "1px"}
                >
                  <Card.Body gap={2} p={3}>
                    <HStack gap={1.5} align="center" wrap="nowrap">
                      {match.homeTeam && <TeamLogo team={match.homeTeam} size="xs" />}
                      <Text fontWeight="bold" fontSize="sm" lineClamp={1}>
                        {match.homeTeam?.name ?? "A definir"} x {match.awayTeam?.name ?? "A definir"}
                      </Text>
                      {match.awayTeam && <TeamLogo team={match.awayTeam} size="xs" />}
                    </HStack>
                    <Text color="fg.muted" fontSize="xs">
                      {match.stage.name}{match.group ? ` · ${match.group.name}` : ""}
                    </Text>
                    <HStack gap={1} color="fg.muted" flexWrap="wrap">
                      <CalendarDays size={11} />
                      <Text fontSize="xs">
                        {new Date(match.startsAt).toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </Text>
                      <Text fontSize="xs" color="border">·</Text>
                      <Clock size={11} />
                      <Text fontSize="xs">
                        {new Date(match.startsAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </HStack>
                    <HStack justify="space-between" align="center" mt={1}>
                    <Badge
                      colorPalette={hasPrediction ? "green" : match.isLocked ? "red" : "gray"}
                      variant="subtle"
                      rounded="full"
                      fontSize="xs"
                    >
                      <HStack gap={1}>
                        {hasPrediction ? <CheckCircle2 size={10} /> : match.isLocked ? <Lock size={10} /> : <Clock size={10} />}
                        {hasPrediction ? "Palpitado" : match.isLocked ? "Bloqueado" : "Sem palpite"}
                      </HStack>
                    </Badge>
                        <Button asChild colorPalette="green" rounded="lg" size="xs" variant="subtle">
                        <Link href={`/pools/${slug}/predictions`} {...prefetchProps}>
                          {hasPrediction ? "Mudar palpite" : "Palpitar"}
                        </Link>
                      </Button>
                    </HStack>
                  </Card.Body>
                </Card.Root>
              );
            })}
          </SimpleGrid>
          )}
          </>
            );
          })()}
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}
