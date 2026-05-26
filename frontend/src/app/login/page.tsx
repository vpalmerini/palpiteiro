"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { Box, Card, Text, VStack } from "@chakra-ui/react";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/contexts/auth";

function LoginContent() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace(next);
    }
  }, [user, loading, next, router]);

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    if (!credentialResponse.credential) return;
    setError(null);
    try {
      await signInWithGoogle(credentialResponse.credential);
      router.replace(next);
    } catch {
      setError("Não foi possível entrar com Google. Tente novamente.");
    }
  }

  if (loading) return null;

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="60vh">
      <Card.Root maxW="sm" w="full" shadow="md">
        <Card.Body py={10} px={8}>
          <VStack gap={6} align="center">
            <VStack gap={2} align="center">
              <BrandLogo size="lg" />
              <Text color="fg.muted" textAlign="center" fontSize="sm">
                Entre com Google para criar bolões e registrar seus palpites.
              </Text>
            </VStack>

            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Não foi possível entrar com Google. Tente novamente.")}
              text="signin_with"
              shape="rectangular"
            />

            {error && <Text color="red.500" fontSize="sm">{error}</Text>}
          </VStack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
