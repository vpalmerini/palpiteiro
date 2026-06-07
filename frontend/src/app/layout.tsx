import type { Metadata, Viewport } from "next";
import { Box, Container } from "@chakra-ui/react";
import { Analytics } from "@vercel/analytics/next";

import { AppNav } from "@/components/app-nav";
import { ClientProviders } from "@/components/client-providers";
import { Provider } from "@/components/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Palpiteiro",
  description: "Crie bolões, faça seus palpites e dispute o ranking com amigos.",
  applicationName: "Palpiteiro",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-512.png" },
  appleWebApp: { capable: true, title: "Palpiteiro", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <Provider>
          <ClientProviders>
            <Box as="main" bg="bg.subtle" color="fg" minH="100vh" overflowX="hidden">
              <Container maxW="6xl" px={{ base: 4, md: 8 }} py={{ base: 6, md: 8 }}>
                <AppNav />
                {children}
              </Container>
            </Box>
          </ClientProviders>
        </Provider>
        <Analytics />
      </body>
    </html>
  );
}
