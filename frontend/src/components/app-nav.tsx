"use client";

import { Button, Flex } from "@chakra-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNav() {
  const pathname = usePathname();
  const showCreateButton = pathname !== "/pools/new";

  return (
    <Flex as="nav" align="center" justify="space-between" mb={8}>
      <Link href="/" style={{ fontWeight: 800 }}>
        Bolão da Copa
      </Link>
      <Flex align="center" gap={2}>
        <Button asChild colorPalette="gray" variant="ghost" rounded="full" size="sm">
          <Link href="/meus-boloes">Meus Bolões</Link>
        </Button>
        <Button asChild colorPalette="gray" variant="ghost" rounded="full" size="sm">
          <Link href="/admin">Admin</Link>
        </Button>
        {showCreateButton ? (
          <Button asChild colorPalette="blue" variant="subtle" rounded="full">
            <Link href="/pools/new">Criar bolão</Link>
          </Button>
        ) : null}
      </Flex>
    </Flex>
  );
}
