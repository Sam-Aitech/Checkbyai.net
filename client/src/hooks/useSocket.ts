import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useToast } from "./use-toast";
import { useAuth } from "./useAuth";

let globalSocket: Socket | null = null;

export function useSocket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!user || connectedRef.current) return;

    const socket = io({
      withCredentials: true,
    });

    socket.on("connect", () => {
      connectedRef.current = true;
    });

    socket.on("notification", (data: any) => {
      const changeType = data.changeType ?? "";
      const companyName = data.companyName ?? "Unknown";

      const titles: Record<string, string> = {
        REMOVED: "Sponsor Licence Removed",
        DOWNGRADED: "Rating Downgraded",
        UPGRADED: "Rating Upgraded",
        ADDED: "New Sponsor Added",
        ROUTE_CHANGE: "Route Changed",
        REVOKED: "Licence Revoked",
        SUSPENDED: "Licence Suspended",
        REINSTATED: "Licence Reinstated",
      };

      toast({
        title: titles[changeType] ?? "Sponsor Update",
        description: `${companyName} — ${changeType.replace(/_/g, " ").toLowerCase()}`,
        duration: 8000,
      });
    });

    socket.on("disconnect", () => {
      connectedRef.current = false;
    });

    globalSocket = socket;

    return () => {
      socket.disconnect();
      globalSocket = null;
      connectedRef.current = false;
    };
  }, [user?.id, toast]);
}

export function SocketNotificationListener() {
  useSocket();
  return null;
}

export function getSocket(): Socket | null {
  return globalSocket;
}
