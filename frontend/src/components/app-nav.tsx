"use client";

import {
  Avatar,
  Button,
  Drawer,
  Flex,
  HStack,
  IconButton,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  Sun,
  Tv2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/auth";
import { ColorModeButton, useColorMode } from "@/components/color-mode";
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

function DrawerNavLink({
  href,
  icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Button
      asChild
      variant={active ? "subtle" : "ghost"}
      colorPalette={active ? "green" : "gray"}
      justifyContent="flex-start"
      w="full"
      size="lg"
      rounded="lg"
      onClick={onNavigate}
    >
      <Link href={href}>
        <HStack gap={3} w="full">
          {icon}
          <span>{label}</span>
        </HStack>
      </Link>
    </Button>
  );
}

function MobileNavDrawer({
  user,
  loading,
  showCreateButton,
  onSignOut,
}: {
  user: User | null;
  loading: boolean;
  showCreateButton: boolean;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { colorMode, toggleColorMode } = useColorMode();

  function close() {
    setOpen(false);
  }

  async function handleSignOut() {
    close();
    await onSignOut();
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <Drawer.Root open={open} onOpenChange={(details) => setOpen(details.open)} placement="end" size="sm">
      <Drawer.Trigger asChild>
        <IconButton variant="ghost" size="sm" rounded="lg" aria-label="Abrir menu">
          <Menu size={20} />
        </IconButton>
      </Drawer.Trigger>

      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content>
          <Drawer.Header borderBottomWidth="1px">
            <Drawer.Title>Menu</Drawer.Title>
            <Drawer.CloseTrigger asChild position="absolute" top={3} right={3}>
              <IconButton variant="ghost" size="sm" rounded="lg" aria-label="Fechar menu">
                <X size={18} />
              </IconButton>
            </Drawer.CloseTrigger>
          </Drawer.Header>

          <Drawer.Body py={4}>
            <Stack gap={2}>
              {!loading && user && (
                <HStack gap={3} px={2} py={3} mb={2} rounded="lg" bg="bg.muted">
                  <Avatar.Root size="md">
                    {user.pictureUrl ? (
                      <Avatar.Image src={user.pictureUrl} alt={user.name} />
                    ) : (
                      <Avatar.Fallback>{user.name?.charAt(0)?.toUpperCase() ?? "?"}</Avatar.Fallback>
                    )}
                  </Avatar.Root>
                  <Stack gap={0} minW={0}>
                    <Text fontWeight="semibold" fontSize="sm" truncate>
                      {user.name}
                    </Text>
                    <Text color="fg.muted" fontSize="xs" truncate>
                      {user.email}
                    </Text>
                  </Stack>
                </HStack>
              )}

              <DrawerNavLink
                href="/"
                icon={<Home size={18} />}
                label="Início"
                active={isActive("/")}
                onNavigate={close}
              />

              {!loading && user && (
                <>
                  <DrawerNavLink
                    href="/meus-boloes"
                    icon={<Tv2 size={18} />}
                    label="Meus Bolões"
                    active={isActive("/meus-boloes")}
                    onNavigate={close}
                  />
                  {user.isAdmin && (
                    <DrawerNavLink
                      href="/admin"
                      icon={<LayoutDashboard size={18} />}
                      label="Admin"
                      active={isActive("/admin")}
                      onNavigate={close}
                    />
                  )}
                  {showCreateButton && (
                    <DrawerNavLink
                      href="/pools/new"
                      icon={<Plus size={18} />}
                      label="Criar bolão"
                      active={isActive("/pools/new")}
                      onNavigate={close}
                    />
                  )}
                </>
              )}

              <Separator my={2} />

              <Button
                variant="ghost"
                colorPalette="gray"
                justifyContent="flex-start"
                w="full"
                size="lg"
                rounded="lg"
                onClick={toggleColorMode}
              >
                <HStack gap={3}>
                  {colorMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                  <span>{colorMode === "dark" ? "Modo claro" : "Modo escuro"}</span>
                </HStack>
              </Button>

              {!loading && !user && (
                <DrawerNavLink
                  href="/login"
                  icon={<LogIn size={18} />}
                  label="Entrar"
                  active={isActive("/login")}
                  onNavigate={close}
                />
              )}
            </Stack>
          </Drawer.Body>

          {!loading && user && (
            <Drawer.Footer borderTopWidth="1px">
              <Button
                variant="outline"
                colorPalette="red"
                w="full"
                size="lg"
                rounded="lg"
                onClick={handleSignOut}
              >
                <HStack gap={2}>
                  <LogOut size={16} />
                  <span>Sair</span>
                </HStack>
              </Button>
            </Drawer.Footer>
          )}
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
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
        {!loading &&
          (user ? (
            <UserAccountMenu user={user} onSignOut={handleSignOut} />
          ) : (
            <Button asChild colorPalette="green" variant="subtle" rounded="lg" size="sm">
              <Link href="/login">
                <HStack gap={1}>
                  <LogIn size={14} />
                  <span>Entrar</span>
                </HStack>
              </Link>
            </Button>
          ))}
      </Flex>

      {/* Mobile nav */}
      <Flex align="center" display={{ base: "flex", sm: "none" }}>
        <MobileNavDrawer
          user={user}
          loading={loading}
          showCreateButton={showCreateButton}
          onSignOut={handleSignOut}
        />
      </Flex>
    </Flex>
  );
}
