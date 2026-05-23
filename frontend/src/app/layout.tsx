import type { Metadata } from "next";
import Link from "next/link";
import { Box, Button, Container, Flex } from "@chakra-ui/react";

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
              <Flex as="nav" align="center" justify="space-between" mb={8}>
                <Link href="/" style={{ fontWeight: 800 }}>
                  Bolão da Copa
                </Link>
                <Button asChild colorPalette="blue" variant="subtle" rounded="full">
                  <Link href="/pools/new">Criar bolão</Link>
                </Button>
              </Flex>
              {children}
            </Container>
          </Box>
        </Provider>
      </body>
    </html>
  );
}
