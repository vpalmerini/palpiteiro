import {
  Card,
  HStack,
  SimpleGrid,
  Skeleton,
  SkeletonCircle,
  SkeletonText,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";

import { BrandLogo } from "@/components/brand-logo";

export function LoginPageSkeleton() {
  return (
    <Stack align="center" justify="center" minH="60vh">
      <Card.Root maxW="sm" w="full" rounded="2xl" shadow="md">
        <Card.Body py={10} px={8}>
          <Stack gap={6} align="center">
            <Stack gap={3} align="center" w="full">
              <SkeletonCircle size="14" />
              <Skeleton height="7" width="40%" rounded="lg" />
              <SkeletonText noOfLines={2} gap={2} w="full" />
            </Stack>
            <Skeleton height="10" width="full" rounded="md" />
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}

export function LoginRedirecting() {
  return (
    <Stack align="center" justify="center" minH="60vh">
      <Card.Root maxW="sm" w="full" rounded="2xl" shadow="md">
        <Card.Body py={10} px={8}>
          <Stack gap={6} align="center">
            <BrandLogo size="lg" />
            <HStack gap={3} color="fg.muted">
              <Spinner size="sm" color="green.500" />
              <Text fontSize="sm">Entrando…</Text>
            </HStack>
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}

export function MeusBoloesPageSkeleton() {
  return (
    <Stack gap={8} maxW="3xl" mx="auto">
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <Skeleton height="9" width={{ base: "56", md: "48" }} rounded="lg" />
        <Skeleton height="10" width="32" rounded="lg" />
      </HStack>

      <Stack gap={3}>
        <HStack gap={2}>
          <Skeleton height="6" width="40" rounded="md" />
          <Skeleton height="5" width="10" rounded="full" />
          <Skeleton height="5" width="24" rounded="full" />
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
          {[0, 1, 2].map((i) => (
            <Card.Root key={i} rounded="xl">
              <Card.Body gap={3}>
                <Skeleton height="6" width="75%" rounded="md" />
                <Skeleton height="4" width="55%" rounded="md" />
                <HStack gap={4} pt={1}>
                  <Stack gap={1} align="center">
                    <Skeleton height="8" width="8" rounded="md" />
                    <Skeleton height="3" width="10" rounded="md" />
                  </Stack>
                  <Stack gap={1} align="center">
                    <Skeleton height="8" width="8" rounded="md" />
                    <Skeleton height="3" width="10" rounded="md" />
                  </Stack>
                </HStack>
              </Card.Body>
            </Card.Root>
          ))}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}

export function PoolDetailPageSkeleton() {
  return (
    <Stack gap={6}>
      <Card.Root rounded="2xl" shadow="lg">
        <Card.Body gap={4}>
          <Skeleton height="6" width="28" rounded="full" />
          <Skeleton height="12" width={{ base: "full", md: "70%" }} rounded="lg" />
          <SkeletonText noOfLines={2} gap={2} />
          <Skeleton height="10" width="full" rounded="lg" />
          <Skeleton height="10" width="32" rounded="lg" />
        </Card.Body>
      </Card.Root>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        {[0, 1].map((i) => (
          <Card.Root key={i} rounded="2xl">
            <Card.Body gap={4}>
              <Skeleton height="6" width="48" rounded="md" />
              <SkeletonText noOfLines={i === 0 ? 3 : 4} gap={2} />
              <Skeleton height="10" width="36" rounded="lg" />
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>

      <Card.Root rounded="2xl">
        <Card.Body gap={4}>
          <Skeleton height="6" width="40" rounded="md" />
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
            {[0, 1, 2, 3].map((i) => (
              <Stack key={i} gap={1}>
                <Skeleton height="8" width="12" rounded="md" />
                <Skeleton height="4" width="20" rounded="md" />
              </Stack>
            ))}
          </SimpleGrid>
        </Card.Body>
      </Card.Root>

      <Card.Root rounded="2xl">
        <Card.Body gap={4}>
          <Skeleton height="6" width="24" rounded="md" />
          <Stack gap={2}>
            {[0, 1, 2, 4, 5].map((i) => (
              <HStack key={i} gap={3}>
                <Skeleton height="4" width="6" rounded="md" />
                <Skeleton height="4" flex={1} rounded="md" />
                <Skeleton height="4" width="10" rounded="md" />
                <Skeleton height="4" width="10" rounded="md" />
                <Skeleton height="4" width="10" rounded="md" />
              </HStack>
            ))}
          </Stack>
        </Card.Body>
      </Card.Root>

      <Card.Root rounded="2xl">
        <Card.Body gap={4}>
          <Skeleton height="6" width="36" rounded="md" />
          <Skeleton height={{ base: "280px", md: "360px" }} width="full" rounded="xl" />
        </Card.Body>
      </Card.Root>

      <Card.Root rounded="2xl">
        <Card.Body gap={4}>
          <Skeleton height="6" width="32" rounded="md" />
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Card.Root key={i} rounded="xl" variant="outline">
                <Card.Body gap={3}>
                  <HStack justify="space-between">
                    <Skeleton height="5" width="24" rounded="full" />
                    <Skeleton height="4" width="16" rounded="md" />
                  </HStack>
                  <Skeleton height="6" width="full" rounded="md" />
                  <Skeleton height="8" width="full" rounded="lg" />
                </Card.Body>
              </Card.Root>
            ))}
          </SimpleGrid>
        </Card.Body>
      </Card.Root>
    </Stack>
  );
}

export function PredictionsPageSkeleton() {
  return (
    <Stack gap={6}>
      <Card.Root rounded="2xl" shadow="lg">
        <Card.Body gap={3} p={{ base: 4, md: 6 }}>
          <Skeleton height="6" width="24" rounded="full" />
          <Skeleton height="10" width={{ base: "full", md: "60%" }} rounded="lg" />
          <SkeletonText noOfLines={2} gap={2} />
          <Skeleton height="8" width="36" rounded="lg" />
        </Card.Body>
      </Card.Root>

      <Card.Root rounded="2xl">
        <Card.Body gap={4}>
          <Skeleton height="6" width="40" rounded="full" />
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            {[0, 1, 2, 3].map((i) => (
              <Stack key={i} gap={2}>
                <Skeleton height="4" width="32" rounded="md" />
                <Skeleton height="10" width="full" rounded="lg" />
              </Stack>
            ))}
          </SimpleGrid>
          <Skeleton height="10" width="44" rounded="lg" />
        </Card.Body>
      </Card.Root>

      {[0, 1, 2].map((group) => (
        <Card.Root key={group} rounded="2xl">
          <Card.Body gap={4}>
            <Skeleton height="8" width="full" rounded="lg" />
            <Stack gap={3}>
              {[0, 1].map((i) => (
                <Card.Root key={i} rounded="xl" variant="outline">
                  <Card.Body gap={4}>
                    <HStack justify="center" gap={3}>
                      <SkeletonCircle size="6" />
                      <Skeleton height="6" width="40" rounded="md" />
                      <SkeletonCircle size="6" />
                    </HStack>
                    <HStack justify="center" gap={4}>
                      <Skeleton height="10" width="24" rounded="lg" />
                      <Skeleton height="8" width="6" rounded="md" />
                      <Skeleton height="10" width="24" rounded="lg" />
                    </HStack>
                    <Skeleton height="10" width="32" rounded="lg" alignSelf="center" />
                  </Card.Body>
                </Card.Root>
              ))}
            </Stack>
          </Card.Body>
        </Card.Root>
      ))}
    </Stack>
  );
}

export function NewPoolPageSkeleton() {
  return (
    <Card.Root as="section" maxW="3xl" mx="auto" rounded="2xl" shadow="lg">
      <Card.Body gap={6}>
        <Stack gap={3}>
          <Skeleton height="6" width="24" rounded="full" />
          <Skeleton height="12" width={{ base: "full", md: "70%" }} rounded="lg" />
          <SkeletonText noOfLines={2} gap={2} />
        </Stack>

        <Stack gap={4}>
          {[0, 1, 2, 3].map((i) => (
            <Stack key={i} gap={2}>
              <Skeleton height="4" width="24" rounded="md" />
              <Skeleton height="10" width="full" rounded="lg" />
            </Stack>
          ))}

          <Skeleton height="px" width="full" />

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            {[0, 1, 2, 3].map((i) => (
              <Stack key={i} gap={2}>
                <Skeleton height="4" width="28" rounded="md" />
                <Skeleton height="10" width="full" rounded="lg" />
              </Stack>
            ))}
          </SimpleGrid>

          <Skeleton height="10" width="36" rounded="lg" />
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
