import Link from "next/link";
import { Badge, Button, Card, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";

export default function Home() {
  return (
    <SimpleGrid as="section" columns={{ base: 1, md: 2 }} gap={6} alignItems="center">
      <Stack gap={6}>
        <Badge alignSelf="flex-start" colorPalette="blue" rounded="full" px={3} py={1}>
          MVP Copa do Mundo
        </Badge>
        <Heading as="h1" fontSize={{ base: "4xl", md: "7xl" }} lineHeight="0.95">
          Crie seu bolão e acompanhe cada palpite.
        </Heading>
        <Text color="gray.600" fontSize="lg">
          Convide participantes por link público, colete palpites por fase, acompanhe o ranking e deixe
          claros os prêmios dos três primeiros colocados.
        </Text>
        <Button asChild alignSelf="flex-start" colorPalette="blue" rounded="full" size="lg">
          <Link href="/pools/new">Criar um bolão</Link>
        </Button>
      </Stack>
      <Card.Root as="aside" shadow="lg" rounded="2xl">
        <Card.Body gap={4}>
          <Card.Title>Fluxo do MVP</Card.Title>
          <Stack color="gray.600" gap={3}>
            <Text>1. Cadastre torneio e jogos via admin da API.</Text>
            <Text>2. Crie o bolão com prêmios e regras.</Text>
            <Text>3. Compartilhe o link e receba palpites.</Text>
            <Text>4. Registre resultados e veja o ranking.</Text>
          </Stack>
        </Card.Body>
      </Card.Root>
    </SimpleGrid>
  );
}
