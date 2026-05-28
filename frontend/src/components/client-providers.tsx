"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/auth";
import { ColorModeProvider } from "@/components/color-mode";
import { QueryProvider } from "@/components/query-provider";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ColorModeProvider>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID} locale="pt-BR">
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ColorModeProvider>
  );
}
