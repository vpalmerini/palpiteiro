"use client";

import { Avatar, Box, Button, Flex, HStack, MenuContent, MenuItem, MenuRoot, MenuTrigger, Text } from "@chakra-ui/react";
import { LayoutDashboard, LogIn, LogOut, Plus, Tv2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";
import { ColorModeButton } from "@/components/color-mode";
import { BrandLogo } from "@/components/brand-logo";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const showCreateButton = pathname !== "/pools/new";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <Flex as="nav" align="center" justify="space-between" mb={6}>
      {/* Logo */}
      <Link href="/" style={{ flexShrink: 0 }}>
        <BrandLogo size="sm" responsiveText />
      </Link>

      {/* Desktop nav */}
      <Flex align="center" gap={2} display={{ base: "none", sm: "flex" }}>
        <ColorModeButton />
        {user && (
          <>
            <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm">
              <Link href="/meus-boloes"><HStack gap={1}><Tv2 size={14} /><span>Meus Bolões</span></HStack></Link>
            </Button>
            {user.isAdmin && (
              <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm">
                <Link href="/admin"><HStack gap={1}><LayoutDashboard size={14} /><span>Admin</span></HStack></Link>
              </Button>
            )}
            {showCreateButton && (
              <Button asChild colorPalette="green" variant="subtle" rounded="lg">
                <Link href="/pools/new"><HStack gap={1}><Plus size={14} /><span>Criar bolão</span></HStack></Link>
              </Button>
            )}
          </>
        )}

        {!loading && (
          user ? (
            <MenuRoot>
              <MenuTrigger asChild>
                <Box cursor="pointer">
                  <Avatar.Root size="sm">
                    {user.pictureUrl ? (
                      <Avatar.Image src={user.pictureUrl} alt={user.name} />
                    ) : (
                      <Avatar.Fallback>{user.name?.charAt(0)?.toUpperCase() ?? "?"}</Avatar.Fallback>
                    )}
                  </Avatar.Root>
                </Box>
              </MenuTrigger>
              <MenuContent>
                <Box px={3} py={2}>
                  <Text fontWeight="semibold" fontSize="sm">{user.name}</Text>
                  <Text color="gray.500" fontSize="xs">{user.email}</Text>
                </Box>
                <MenuItem value="logout" onClick={handleSignOut} color="red.500">
                  <HStack gap={2}><LogOut size={14} /><span>Sair</span></HStack>
                </MenuItem>
              </MenuContent>
            </MenuRoot>
          ) : (
            <Button asChild colorPalette="green" variant="subtle" rounded="lg" size="sm">
              <Link href="/login"><HStack gap={1}><LogIn size={14} /><span>Entrar</span></HStack></Link>
            </Button>
          )
        )}
      </Flex>

      {/* Mobile nav */}
      <Flex align="center" gap={1} display={{ base: "flex", sm: "none" }}>
        <ColorModeButton />
        {user && (
          <>
            <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm" aria-label="Meus Bolões">
              <Link href="/meus-boloes"><Tv2 size={18} /></Link>
            </Button>
            {user.isAdmin && (
              <Button asChild colorPalette="gray" variant="ghost" rounded="lg" size="sm" aria-label="Admin">
                <Link href="/admin"><LayoutDashboard size={18} /></Link>
              </Button>
            )}
            {showCreateButton && (
              <Button asChild colorPalette="green" variant="subtle" rounded="lg" size="sm" aria-label="Criar bolão">
                <Link href="/pools/new"><Plus size={18} /></Link>
              </Button>
            )}
          </>
        )}

        {!loading && (
          user ? (
            <Box cursor="pointer" onClick={handleSignOut}>
              <Avatar.Root size="sm">
                {user.pictureUrl ? (
                  <Avatar.Image src={user.pictureUrl} alt={user.name} />
                ) : (
                  <Avatar.Fallback>{user.name?.charAt(0)?.toUpperCase() ?? "?"}</Avatar.Fallback>
                )}
              </Avatar.Root>
            </Box>
          ) : (
            <Button asChild colorPalette="green" variant="subtle" rounded="lg" size="sm" aria-label="Entrar">
              <Link href="/login"><LogIn size={18} /></Link>
            </Button>
          )
        )}
      </Flex>
    </Flex>
  );
}
