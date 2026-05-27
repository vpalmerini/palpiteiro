"use client";

import {
  Avatar,
  Button,
  Flex,
  HStack,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
  Text,
} from "@chakra-ui/react";
import { LayoutDashboard, LogIn, LogOut, Plus, Tv2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";
import { ColorModeButton } from "@/components/color-mode";
import { BrandLogo } from "@/components/brand-logo";
import type { User } from "@/types";

function UserAccountMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <MenuRoot positioning={{ placement: "bottom-end" }}>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          p={0}
          minW="auto"
          h="auto"
          rounded="full"
          aria-label="Abrir menu da conta"
        >
          <Avatar.Root size="sm">
            {user.pictureUrl ? (
              <Avatar.Image src={user.pictureUrl} alt={user.name} />
            ) : (
              <Avatar.Fallback>{user.name?.charAt(0)?.toUpperCase() ?? "?"}</Avatar.Fallback>
            )}
          </Avatar.Root>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <Flex direction="column" gap={0} px={3} py={2}>
          <Text fontWeight="semibold" fontSize="sm">
            {user.name}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {user.email}
          </Text>
        </Flex>
        <MenuItem value="logout" onClick={onSignOut} color="red.500">
          <HStack gap={2}>
            <LogOut size={14} />
            <span>Sair</span>
          </HStack>
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const showCreateButton = pathname !== "/pools/new";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const authControl = !loading && (
    user ? (
      <UserAccountMenu user={user} onSignOut={handleSignOut} />
    ) : (
      <Button asChild colorPalette="green" variant="subtle" rounded="lg" size="sm">
        <Link href="/login">
          <HStack gap={1}>
            <LogIn size={14} />
            <Text display={{ base: "none", sm: "inline" }}>Entrar</Text>
          </HStack>
        </Link>
      </Button>
    )
  );

  return (
    <Flex as="nav" align="center" justify="space-between" mb={6}>
      <Link href="/" style={{ flexShrink: 0 }}>
        <BrandLogo size="sm" responsiveText />
      </Link>

      {/* Desktop nav */}
      <Flex align="center" gap={2} display={{ base: "none", sm: "flex" }}>
        <ColorModeButton />
        {user && (
          <>
            <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm">
              <Link href="/meus-boloes">
                <HStack gap={1}>
                  <Tv2 size={14} />
                  <span>Meus Bolões</span>
                </HStack>
              </Link>
            </Button>
            {user.isAdmin && (
              <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm">
                <Link href="/admin">
                  <HStack gap={1}>
                    <LayoutDashboard size={14} />
                    <span>Admin</span>
                  </HStack>
                </Link>
              </Button>
            )}
            {showCreateButton && (
              <Button asChild colorPalette="green" variant="subtle" rounded="lg">
                <Link href="/pools/new">
                  <HStack gap={1}>
                    <Plus size={14} />
                    <span>Criar bolão</span>
                  </HStack>
                </Link>
              </Button>
            )}
          </>
        )}
        {authControl}
      </Flex>

      {/* Mobile nav */}
      <Flex align="center" gap={1} display={{ base: "flex", sm: "none" }}>
        <ColorModeButton />
        {user && (
          <>
            <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm" aria-label="Meus Bolões">
              <Link href="/meus-boloes">
                <Tv2 size={18} />
              </Link>
            </Button>
            {user.isAdmin && (
              <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm" aria-label="Admin">
                <Link href="/admin">
                  <LayoutDashboard size={18} />
                </Link>
              </Button>
            )}
            {showCreateButton && (
              <Button asChild colorPalette="green" variant="subtle" rounded="lg" size="sm" aria-label="Criar bolão">
                <Link href="/pools/new">
                  <Plus size={18} />
                </Link>
              </Button>
            )}
          </>
        )}
        {authControl}
      </Flex>
    </Flex>
  );
}
