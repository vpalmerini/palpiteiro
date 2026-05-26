import { Box, HStack, Text } from "@chakra-ui/react";
import { Target } from "lucide-react";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  /** Esconde o texto em telas pequenas (mostra só o ícone). */
  responsiveText?: boolean;
};

const SIZES = {
  sm: { icon: 14, box: 28, fontSize: "md" },
  md: { icon: 18, box: 32, fontSize: "lg" },
  lg: { icon: 26, box: 52, fontSize: "2xl" },
};

export function BrandLogo({ size = "md", showText = true, responsiveText = false }: BrandLogoProps) {
  const s = SIZES[size];

  return (
    <HStack gap={2.5} align="center">
      <Box
        w={`${s.box}px`}
        h={`${s.box}px`}
        rounded="lg"
        bg="green.600"
        _dark={{ bg: "green.500" }}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <Target size={s.icon} color="white" strokeWidth={2.5} />
      </Box>
      {showText && (
        <Text
          fontWeight={800}
          fontSize={s.fontSize}
          letterSpacing="-0.03em"
          color="fg"
          lineHeight="1"
          display={responsiveText ? { base: "none", sm: "block" } : undefined}
        >
          Palpiteiro
        </Text>
      )}
    </HStack>
  );
}
