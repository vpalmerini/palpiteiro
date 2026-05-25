"use client";

import { type ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { IconButton, ClientOnly, Skeleton } from "@chakra-ui/react";
import { Moon, Sun } from "lucide-react";

export function ColorModeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" disableTransitionOnChange defaultTheme="light">
      {children}
    </ThemeProvider>
  );
}

export function useColorMode() {
  const { resolvedTheme, setTheme } = useTheme();
  return {
    colorMode: resolvedTheme as "light" | "dark",
    toggleColorMode: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  };
}

export function useColorModeValue<T>(light: T, dark: T): T {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? dark : light;
}

export function ColorModeButton() {
  const { colorMode, toggleColorMode } = useColorMode();
  return (
    <ClientOnly fallback={<Skeleton boxSize="8" rounded="lg" />}>
      <IconButton
        aria-label={colorMode === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
        variant="ghost"
        size="sm"
        rounded="lg"
        onClick={toggleColorMode}
      >
        {colorMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </IconButton>
    </ClientOnly>
  );
}
