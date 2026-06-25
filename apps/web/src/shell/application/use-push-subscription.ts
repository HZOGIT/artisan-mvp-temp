import { useEffect } from "react";
import { trpc } from "@/shared/trpc";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/*
 * Souscrit aux notifications web-push si VAPID configuré côté serveur + permission accordée.
 * Exécuté une fois au montage du shell authentifié. Silencieux en cas d'erreur ou d'absence
 * de support navigateur.
 */
export function usePushSubscription() {
  const { data } = trpc.notifications.getVapidPublicKey.useQuery(undefined, { staleTime: Infinity });
  const subscribe = trpc.notifications.subscribe.useMutation();

  const { mutate } = subscribe;

  useEffect(() => {
    const vapidKey = data?.key;
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) return;

        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted") return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });
        const json = sub.toJSON();
        const p256dh = (json.keys as Record<string, string>)?.["p256dh"];
        const auth = (json.keys as Record<string, string>)?.["auth"];
        if (!sub.endpoint || !p256dh || !auth) return;
        mutate({ endpoint: sub.endpoint, keys: { p256dh, auth } });
      } catch {
        /* best-effort, on ne remonte pas les erreurs de souscription */
      }
    })();
  }, [data?.key, mutate]);
}
