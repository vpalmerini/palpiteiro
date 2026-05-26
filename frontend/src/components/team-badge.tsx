import { Box, HStack, Text } from "@chakra-ui/react";
import type { Team } from "@/types";

// Convert ISO 3166-1 alpha-2 code to flag emoji (e.g. "BR" → "🇧🇷")
function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

// Initials fallback: up to 2 chars from shortName or name
function initials(team: Team): string {
  const src = team.shortName ?? team.name;
  return src.slice(0, 2).toUpperCase();
}

type BadgeSize = "xs" | "sm" | "md";

const SIZE_MAP: Record<BadgeSize, { box: number; font: string; emoji: string }> = {
  xs: { box: 18, font: "9px",  emoji: "0.85rem" },
  sm: { box: 22, font: "10px", emoji: "1rem"    },
  md: { box: 28, font: "11px", emoji: "1.25rem" },
};

interface TeamLogoProps {
  team: Team;
  size?: BadgeSize;
}

/**
 * Renders the team visual identity:
 * 1. logo_url  → <img> with object-fit contain
 * 2. flag_code → flag emoji (national teams)
 * 3. fallback  → initials in a colored circle
 */
export function TeamLogo({ team, size = "sm" }: TeamLogoProps) {
  const { box, font, emoji } = SIZE_MAP[size];

  if (team.logoUrl) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
        width={box}
        height={box}
        style={{ objectFit: "contain", flexShrink: 0 }}
      />
    );
  }

  if (team.flagCode) {
    return (
      <Box
        as="span"
        aria-label={team.name}
        style={{ fontSize: emoji, lineHeight: 1 }}
        flexShrink={0}
      >
        {flagEmoji(team.flagCode)}
      </Box>
    );
  }

  // Initials fallback
  return (
    <Box
      w={`${box}px`}
      h={`${box}px`}
      rounded="sm"
      bg="gray.200"
      _dark={{ bg: "gray.700" }}
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <Text style={{ fontSize: font }} fontWeight="bold" color="gray.600" _dark={{ color: "gray.300" }}>
        {initials(team)}
      </Text>
    </Box>
  );
}

interface TeamNameProps {
  team: Team;
  size?: BadgeSize;
  /** Display short name when available (default: false) */
  short?: boolean;
}

/**
 * Logo + name in a horizontal stack — drop-in replacement for raw team name text.
 */
export function TeamName({ team, size = "sm", short = false }: TeamNameProps) {
  const label = short && team.shortName ? team.shortName : team.name;
  return (
    <HStack gap={1.5} align="center" display="inline-flex">
      <TeamLogo team={team} size={size} />
      <span>{label}</span>
    </HStack>
  );
}
