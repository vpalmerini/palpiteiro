import type { Metadata } from "next";
import { Box, Container } from "@chakra-ui/react";

import { AppNav } from "@/components/app-nav";
import { Provider } from "@/components/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bolão da Copa",
  description: "MVP para criar e participar de bolões de futebol.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <Provider>
          <Box as="main" bg="gray.50" color="gray.900" minH="100vh">
            <Container maxW="6xl" px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
              <AppNav />
              {children}
            </Container>
          </Box>
        </Provider>
      </body>
    </html>
  );
}
