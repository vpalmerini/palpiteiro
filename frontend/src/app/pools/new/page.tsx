"use client";

import { Badge, Button, Card, Field, Heading, Input, SimpleGrid, Stack, Text, Textarea } from "@chakra-ui/react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createPool } from "@/lib/api";

export default function NewPoolPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    try {
      const pool = await createPool({
        name: String(form.get("name")),
        description: String(form.get("description")),
        creatorName: String(form.get("creatorName")),
        creatorEmail: String(form.get("creatorEmail")),
        creatorNickname: String(form.get("creatorNickname") || ""),
        prizes: [1, 2, 3].map((position) => ({
          position,
          description: String(form.get(`prize${position}`)),
        })),
      });
      window.localStorage.setItem(`bolao:${pool.slug}:participantId`, pool.creatorParticipantId);
      router.push(`/pools/${pool.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o bolão.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card.Root as="section" maxW="3xl" mx="auto" rounded="2xl" shadow="lg">
      <Card.Body gap={6}>
        <Stack gap={3}>
          <Badge alignSelf="flex-start" colorPalette="blue" rounded="full" px={3} py={1}>
            Novo bolão
          </Badge>
          <Heading as="h1" fontSize={{ base: "3xl", md: "5xl" }}>
            Configure a experiência
          </Heading>
          <Text color="gray.600">Defina o nome, os prêmios e compartilhe o link público com os participantes.</Text>
        </Stack>

        <form onSubmit={onSubmit}>
          <Stack gap={4}>
            <Field.Root required>
              <Field.Label>Nome do bolão</Field.Label>
              <Input name="name" placeholder="Bolão da firma" />
            </Field.Root>
            <Field.Root required>
              <Field.Label>Nome</Field.Label>
              <Input name="creatorName" placeholder="Victor" />
            </Field.Root>
            <Field.Root required>
              <Field.Label>E-mail</Field.Label>
              <Input name="creatorEmail" placeholder="seu-email@exemplo.com" type="email" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Nickname</Field.Label>
              <Input name="creatorNickname" placeholder="Como você quer aparecer no ranking" />
              <Field.HelperText>Opcional. Se não preencher, o nome do criador será usado.</Field.HelperText>
            </Field.Root>
            <Field.Root>
              <Field.Label>Descrição</Field.Label>
              <Textarea name="description" placeholder="Regras combinadas, valor de entrada, observações..." rows={4} />
            </Field.Root>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              <Field.Root required>
                <Field.Label>Prêmio 1º lugar</Field.Label>
                <Input name="prize1" placeholder="R$ 500" />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Prêmio 2º lugar</Field.Label>
                <Input name="prize2" placeholder="R$ 250" />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Prêmio 3º lugar</Field.Label>
                <Input name="prize3" placeholder="R$ 100" />
              </Field.Root>
            </SimpleGrid>
            {error ? <Text color="red.600">{error}</Text> : null}
            <Button colorPalette="blue" disabled={isSubmitting} rounded="full" type="submit">
              {isSubmitting ? "Criando..." : "Criar bolão"}
            </Button>
          </Stack>
        </form>
      </Card.Body>
    </Card.Root>
  );
}
