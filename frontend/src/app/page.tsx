"use client";

import React from "react";
import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Card,
  HStack,
  Heading,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  BarChart2,
  CheckCircle,
  Globe,
  Link2,
  LogIn,
  Medal,
  Share2,
  Shuffle,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";

// ─── SVG football (black & white patches) ──────────────────────────────────
function FootballSVG({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="white" stroke="#e2e8f0" strokeWidth="2" />
      {/* centre pentagon */}
      <polygon points="50,28 63,38 58,53 42,53 37,38" fill="#1a202c" />
      {/* top-left */}
      <polygon points="22,22 37,28 37,38 24,42 16,32" fill="#1a202c" />
      {/* top-right */}
      <polygon points="78,22 84,32 76,42 63,38 63,28" fill="#1a202c" />
      {/* bottom-left */}
      <polygon points="16,68 24,58 37,62 37,76 24,80" fill="#1a202c" />
      {/* bottom-right */}
      <polygon points="84,68 76,80 63,76 63,62 76,58" fill="#1a202c" />
      {/* bottom */}
      <polygon points="42,72 58,72 63,76 50,84 37,76" fill="#1a202c" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: TrendingUp,
    color: "#3182CE",
    bg: "blue.50",
    borderColor: "#bee3f8",
    title: "Timeline do ranking",
    description:
      "Gráfico interativo que mostra a evolução de cada participante rodada a rodada. Vire o jogo até o apito final.",
  },
  {
    icon: Shuffle,
    color: "#38A169",
    bg: "green.50",
    borderColor: "#c6f6d5",
    title: "Vários bolões ao mesmo tempo",
    description:
      "Um pra família, um pro trampo, um pros amigos — participe de quantos quiser com a mesma conta.",
  },
  {
    icon: Medal,
    color: "#D69E2E",
    bg: "yellow.50",
    borderColor: "#fefcbf",
    title: "Palpites especiais",
    description:
      "Além dos placares, aposte no campeão, vice, artilheiro e melhor jogador. Cada acerto vale pontos extras.",
  },
  {
    icon: Link2,
    color: "#805AD5",
    bg: "purple.50",
    borderColor: "#e9d8fd",
    title: "Convite por link",
    description:
      "Cada bolão tem um link único. Compartilhe onde quiser — qualquer pessoa entra com um clique.",
  },
];

const STEPS = [
  {
    emoji: "🔐",
    number: "01",
    title: "Entre com Google",
    description: "Sem cadastro chato. Um clique e você já está dentro.",
  },
  {
    emoji: "⚙️",
    number: "02",
    title: "Crie seu bolão",
    description: "Configure regras, pontuações e prêmios do seu jeito, ou entre via link de outro bolão.",
  },
  {
    emoji: "🎯",
    number: "03",
    title: "Palpite e vença",
    description: "Registre seus palpites antes de cada jogo e suba no ranking a cada rodada.",
  },
];

const FULL_BLEED: React.CSSProperties = {
  width: "100vw",
  marginLeft: "calc(50% - 50vw)",
};

const HEX_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50V18L28 2l28 16v32z' fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='1.5'/%3E%3Cpath d='M28 100L0 84V52l28-16 28 16v32z' fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='1.5'/%3E%3C/svg%3E")`;

const FIELD_STRIPES = `repeating-linear-gradient(
  180deg,
  #1a4731 0px, #1a4731 64px,
  #1e5437 64px, #1e5437 128px
)`;

export default function Home() {
  const { user } = useAuth();

  return (
    <Stack gap={0}>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <Box
        px={{ base: 4, md: 8 }}
        py={{ base: 16, md: 24 }}
        position="relative"
        overflow="hidden"
        style={{ ...FULL_BLEED, background: "linear-gradient(160deg, #0d1b2e 0%, #0f2942 60%, #0d2318 100%)" }}
      >
        {/* hex texture */}
        <Box position="absolute" inset={0} style={{ backgroundImage: HEX_PATTERN }} opacity={1} />
        {/* green pitch glow */}
        <Box
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          h="40%"
          style={{
            background: "radial-gradient(ellipse at 50% 100%, rgba(26,71,49,0.8) 0%, transparent 70%)",
          }}
        />
        {/* top-right ball decoration */}
        <Box
          position="absolute"
          top={{ base: -8, md: -4 }}
          right={{ base: -8, md: 8 }}
          opacity={0.07}
          display={{ base: "none", md: "block" }}
        >
          <FootballSVG size={280} />
        </Box>

        <Stack gap={8} align="center" textAlign="center" position="relative" zIndex={1}>
          <Badge
            rounded="full"
            px={4}
            py={1.5}
            fontSize="xs"
            fontWeight="bold"
            letterSpacing="widest"
            textTransform="uppercase"
            style={{ background: "rgba(255,255,255,0.1)", color: "#90cdf4", border: "1px solid rgba(144,205,244,0.3)" }}
          >
            <HStack gap={1.5}>
              <span>⚽</span>
              <span>Bolão da Copa</span>
            </HStack>
          </Badge>

          <Heading
            as="h1"
            fontSize={{ base: "5xl", md: "7xl", lg: "8xl" }}
            lineHeight="1"
            fontWeight="black"
            letterSpacing="-0.03em"
            color="white"
            maxW="4xl"
          >
            Seu bolão,{" "}
            <Box
              as="span"
              style={{
                background: "linear-gradient(135deg, #48bb78 0%, #38a169 40%, #68d391 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              do seu jeito.
            </Box>
          </Heading>

          <Text
            fontSize={{ base: "lg", md: "xl" }}
            maxW="xl"
            lineHeight="relaxed"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            Crie bolões com regras personalizadas, convide amigos por link e acompanhe
            quem vai virar o jogo até o último apito.
          </Text>

          <HStack gap={3} flexWrap="wrap" justify="center">
            <Button
              asChild
              size="lg"
              color="white"
              rounded="xl"
              px={8}
              fontWeight="bold"
              style={{ background: "linear-gradient(135deg, #276749, #38a169)", boxShadow: "0 4px 24px rgba(56,161,105,0.4)" }}
            >
              <Link href="/pools/new">
                <HStack gap={2}><Zap size={16} /><span>Criar um bolão</span></HStack>
              </Link>
            </Button>
            {!user && (
              <Button
                asChild
                size="lg"
                rounded="xl"
                px={8}
                fontWeight="semibold"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <Link href="/login">
                  <HStack gap={2}><LogIn size={16} /><span>Entrar com Google</span></HStack>
                </Link>
              </Button>
            )}
          </HStack>

          {/* ── Scoreboard mock ─────────────────────────────────────────────── */}
          <Box
            w="full"
            maxW="lg"
            rounded="2xl"
            overflow="hidden"
            mt={4}
            style={{
              background: "#0a1628",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 0 0 1px rgba(56,161,105,0.2), 0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            {/* board header */}
            <Box
              px={5}
              py={3}
              style={{ background: "linear-gradient(90deg, #1a4731, #276749)" }}
            >
              <HStack justify="space-between">
                <HStack gap={2}>
                  <Trophy size={14} color="#68d391" />
                  <Text color="white" fontWeight="bold" fontSize="sm" letterSpacing="wide">
                    RANKING · SEMIFINAIS
                  </Text>
                </HStack>
                <HStack gap={1.5}>
                  <Box w={2} h={2} rounded="full" bg="green.400" style={{ animation: "pulse 1.5s infinite" }} />
                  <Text fontSize="xs" color="green.300" fontWeight="bold">AO VIVO</Text>
                </HStack>
              </HStack>
            </Box>

            {/* board rows */}
            {[
              { pos: 1, name: "Rodrigo A.", pts: 143, delta: "+8", medal: "🥇" },
              { pos: 2, name: "Camila R.",  pts: 138, delta: "+5", medal: "🥈" },
              { pos: 3, name: "Felipe M.",  pts: 131, delta: "+3", medal: "🥉" },
              { pos: 4, name: "Ana L.",     pts: 120, delta: "–",  medal: "" },
            ].map((row, i) => (
              <HStack
                key={row.pos}
                px={5}
                py={3.5}
                justify="space-between"
                style={{
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  background: i === 0 ? "rgba(56,161,105,0.12)" : "transparent",
                }}
              >
                <HStack gap={3}>
                  <Text w={4} textAlign="center" fontSize="sm">
                    {row.medal || (
                      <Text as="span" color="gray.600" fontWeight="bold">{row.pos}</Text>
                    )}
                  </Text>
                  <Box
                    w={7} h={7} rounded="full"
                    display="flex" alignItems="center" justifyContent="center"
                    fontSize="xs" fontWeight="black"
                    style={{
                      background: i === 0 ? "rgba(56,161,105,0.3)" : "rgba(255,255,255,0.08)",
                      color: i === 0 ? "#68d391" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {row.name.charAt(0)}
                  </Box>
                  <Text
                    fontSize="sm"
                    fontWeight={i === 0 ? "bold" : "medium"}
                    style={{ color: i === 0 ? "white" : "rgba(255,255,255,0.6)" }}
                  >
                    {row.name}
                  </Text>
                </HStack>
                <HStack gap={3}>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    style={{ color: row.delta !== "–" ? "#68d391" : "rgba(255,255,255,0.3)" }}
                  >
                    {row.delta !== "–" ? row.delta : ""}
                  </Text>
                  <Text
                    fontFamily="mono"
                    fontWeight="black"
                    fontSize="sm"
                    style={{ color: i === 0 ? "#68d391" : "rgba(255,255,255,0.7)" }}
                  >
                    {row.pts} <Text as="span" fontSize="xs" fontWeight="normal" style={{ color: "rgba(255,255,255,0.3)" }}>pts</Text>
                  </Text>
                </HStack>
              </HStack>
            ))}

            {/* board footer */}
            <Box
              px={5}
              py={2.5}
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
            >
              <Text fontSize="xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                Atualizado após Rodada 4 · 12 participantes
              </Text>
            </Box>
          </Box>
        </Stack>
      </Box>

      {/* ── Green pitch separator ─────────────────────────────────────────────── */}
      <Box h="6px" style={{ ...FULL_BLEED, background: "linear-gradient(90deg, #22543d, #38a169, #22543d)" }} />

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <Stack gap={10} py={{ base: 12, md: 20 }}>
        <Stack gap={2} textAlign="center">
          <Text fontSize="sm" fontWeight="bold" color="green.600" textTransform="uppercase" letterSpacing="widest">
            Por que usar
          </Text>
          <Heading as="h2" fontSize={{ base: "3xl", md: "4xl" }} fontWeight="black" letterSpacing="-0.02em">
            Feito pra quem leva o bolão a sério.
          </Heading>
        </Stack>

        <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} gap={5}>
          {FEATURES.map((feat) => (
            <Card.Root
              key={feat.title}
              rounded="2xl"
              border="1px solid"
              borderColor="gray.200"
              bg="white"
              shadow="sm"
              _hover={{ shadow: "lg", transform: "translateY(-3px)" }}
              transition="all 0.2s ease"
            >
              <Card.Body gap={4} p={6}>
                <Box
                  w={11}
                  h={11}
                  rounded="xl"
                  bg={feat.bg}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  style={{ border: `1px solid ${feat.borderColor}` }}
                >
                  <feat.icon size={20} color={feat.color} />
                </Box>
                <Stack gap={1.5}>
                  <Text fontWeight="bold" fontSize="md" color="gray.900">{feat.title}</Text>
                  <Text fontSize="sm" color="fg.muted" lineHeight="relaxed">{feat.description}</Text>
                </Stack>
              </Card.Body>
            </Card.Root>
          ))}
        </SimpleGrid>
      </Stack>

      {/* ── Field: Como funciona ──────────────────────────────────────────────── */}
      <Box
        px={{ base: 4, md: 14 }}
        py={{ base: 12, md: 16 }}
        position="relative"
        overflow="hidden"
        style={{ ...FULL_BLEED, background: FIELD_STRIPES }}
      >
        {/* touchline top */}
        <Box position="absolute" top={0} left={0} right={0} h="3px" bg="whiteAlpha.400" />
        {/* centre circle */}
        <Box
          position="absolute"
          top="50%"
          left="50%"
          w="320px"
          h="320px"
          rounded="full"
          style={{
            transform: "translate(-50%, -50%)",
            border: "2px solid rgba(255,255,255,0.12)",
            pointerEvents: "none",
          }}
        />
        {/* centre spot */}
        <Box
          position="absolute"
          top="50%"
          left="50%"
          w="8px"
          h="8px"
          rounded="full"
          bg="whiteAlpha.300"
          style={{ transform: "translate(-50%, -50%)" }}
        />
        {/* touchline bottom */}
        <Box position="absolute" bottom={0} left={0} right={0} h="3px" bg="whiteAlpha.400" />

        <Stack gap={10} position="relative" zIndex={1}>
          <Stack gap={1} textAlign="center">
            <Text fontSize="sm" fontWeight="bold" color="green.200" textTransform="uppercase" letterSpacing="widest">
              Como funciona
            </Text>
            <Heading as="h2" fontSize={{ base: "3xl", md: "4xl" }} fontWeight="black" color="white" letterSpacing="-0.02em">
              Três passos e o bolão tá feito.
            </Heading>
          </Stack>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={8}>
            {STEPS.map((step, i) => (
              <Stack key={step.number} gap={4} align={{ base: "center", md: "flex-start" }} textAlign={{ base: "center", md: "left" }}>
                <HStack gap={3}>
                  <Text fontSize="3xl">{step.emoji}</Text>
                  <Text
                    fontSize="4xl"
                    fontWeight="black"
                    fontFamily="mono"
                    lineHeight="1"
                    style={{ color: "rgba(255,255,255,0.15)" }}
                  >
                    {step.number}
                  </Text>
                </HStack>
                {i < STEPS.length - 1 && (
                  <Box
                    display={{ base: "none", md: "block" }}
                    position="absolute"
                    /* step connector line — purely decorative, skip */
                  />
                )}
                <Stack gap={1}>
                  <Text fontWeight="bold" fontSize="lg" color="white">{step.title}</Text>
                  <Text fontSize="sm" lineHeight="relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {step.description}
                  </Text>
                </Stack>
              </Stack>
            ))}
          </SimpleGrid>
        </Stack>
      </Box>

      {/* ── Green pitch separator ─────────────────────────────────────────────── */}
      <Box h="6px" style={{ ...FULL_BLEED, background: "linear-gradient(90deg, #22543d, #38a169, #22543d)" }} />

      {/* ── Bottom CTA ───────────────────────────────────────────────────────── */}
      <Stack gap={6} py={{ base: 14, md: 20 }} align="center" textAlign="center">
        <Text fontSize="5xl">⚽</Text>

        <HStack gap={2} flexWrap="wrap" justify="center">
          {[
            { icon: Globe, text: "Link público" },
            { icon: Users, text: "Sem limite de participantes" },
            { icon: CheckCircle, text: "Login com Google" },
            { icon: Share2, text: "Compartilhe fácil" },
          ].map((item) => (
            <Badge
              key={item.text}
              variant="outline"
              colorPalette="green"
              rounded="full"
              px={3}
              py={1.5}
              fontSize="sm"
            >
              <HStack gap={1.5}>
                <item.icon size={12} />
                <span>{item.text}</span>
              </HStack>
            </Badge>
          ))}
        </HStack>

        <Heading
          as="h2"
          fontSize={{ base: "4xl", md: "6xl" }}
          fontWeight="black"
          letterSpacing="-0.03em"
          maxW="lg"
          lineHeight="1.05"
        >
          Quem vai{" "}
          <Box
            as="span"
            style={{
              background: "linear-gradient(135deg, #276749, #48bb78)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            cravar o placar?
          </Box>
        </Heading>

        <Text color="fg.muted" fontSize="lg" maxW="md" lineHeight="relaxed">
          Crie seu bolão agora e descubra quem manja mais de futebol no seu grupo.
        </Text>

        <Button
          asChild
          size="lg"
          color="white"
          rounded="xl"
          px={10}
          fontWeight="bold"
          style={{
            background: "linear-gradient(135deg, #276749, #38a169)",
            boxShadow: "0 4px 24px rgba(56,161,105,0.35)",
          }}
        >
          <Link href="/pools/new">
            <HStack gap={2}><Trophy size={16} /><span>Criar meu bolão</span></HStack>
          </Link>
        </Button>
      </Stack>
    </Stack>
  );
}
