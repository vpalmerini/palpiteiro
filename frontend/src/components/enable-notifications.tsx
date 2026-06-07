"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Text } from "@chakra-ui/react";
import { Bell } from "lucide-react";

import { subscribePush, unsubscribePush } from "@/lib/api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function ensureSubscription(): Promise<PushSubscription> {
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription inválida.");
  }
  await subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return sub;
}

async function showWelcomeNotification() {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification("Palpiteiro ativado!", {
    body: "Você receberá lembretes quando tiver palpites pendentes.",
    icon: "/icon.svg",
    badge: "/icon.svg",
  });
}

export function EnableNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(isSupported);
    if (!isSupported) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(Notification.permission);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsStandalone(standalone);

    // If already granted, silently make sure the device is registered on the server.
    if (Notification.permission === "granted" && VAPID_PUBLIC_KEY) {
      ensureSubscription()
        .then((sub) => {
          setEnabled(true);
          setSubscription(sub);
        })
        .catch(() => {
          /* non-blocking: user can retry via the button */
        });
    }
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return;
      const sub = await ensureSubscription();
      await showWelcomeNotification();
      setEnabled(true);
      setSubscription(sub);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ativar as notificações.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setSubscription(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desativar as notificações.");
    } finally {
      setBusy(false);
    }
  }, [subscription]);

  if (!supported || !VAPID_PUBLIC_KEY) return null;

  // On iOS, Web Push only works when the app is installed to the home screen.
  if (isIOS && !isStandalone) {
    return (
      <Alert.Root status="info" rounded="lg" size="sm">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description fontSize="sm">
            Para receber lembretes no iPhone, toque em Compartilhar e depois em
            {" "}&quot;Adicionar à Tela de Início&quot;. Depois abra o app pela tela inicial.
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  if (permission === "denied") {
    return (
      <Text color="fg.muted" fontSize="sm">
        Notificações bloqueadas no navegador. Habilite nas configurações do site para receber lembretes.
      </Text>
    );
  }

  return (
    <Box>
      {enabled ? (
        <Button
          onClick={disable}
          loading={busy}
          size="sm"
          variant="ghost"
          rounded="lg"
          alignSelf="flex-start"
          color="fg.muted"
        >
          <Bell size={15} />
          Desativar lembretes
        </Button>
      ) : (
        <Button
          onClick={enable}
          loading={busy}
          size="sm"
          variant="outline"
          rounded="lg"
          alignSelf="flex-start"
        >
          <Bell size={15} />
          Ativar lembretes de palpites
        </Button>
      )}
      {error ? <Text color="red.600" fontSize="sm" mt={2}>{error}</Text> : null}
    </Box>
  );
}
