import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import cookie from "cookie";
import cookieSignature from "cookie-signature";
import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { storage } from "../storage";
import { logger as rootLogger } from "../utils/logger";

const log = rootLogger.child({ module: "SocketGateway" });

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return io;
}

function getSessionMiddleware() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const PgStore = connectPgSimple(session);
  const sessionStore = new PgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET is required for Socket.IO");
  return { store: sessionStore, secret: sessionSecret };
}

export function initSocketGateway(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production"
        ? (process.env.APP_URL ?? "https://checkbyai.net")
        : "http://localhost:5000",
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  const { store, secret } = getSessionMiddleware();

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.cookie;
      if (!header) return next(new Error("No session cookie"));

      const cookies = cookie.parse(header);
      const signedSid = cookies["connect.sid"];
      if (!signedSid?.startsWith("s:")) return next(new Error("Invalid session cookie"));

      const sid = cookieSignature.unsign(signedSid.slice(2), secret);
      if (!sid) return next(new Error("Invalid session signature"));

      const sess = await new Promise<any>((resolve, reject) => {
        store.get(sid, (err: any, session: any) => {
          if (err) reject(err);
          else resolve(session);
        });
      });

      if (!sess?.passport?.user) return next(new Error("Not authenticated"));

      const user = await storage.getUser(sess.passport.user);
      if (!user) return next(new Error("User not found"));

      (socket as any).user = user;
      next();
    } catch (err) {
      log.error({ err }, "Socket.IO auth error");
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    const userId = user.id;

    socket.join(`user:${userId}`);
    log.info({ userId }, "Socket.IO client connected");

    socket.on("disconnect", () => {
      log.info({ userId }, "Socket.IO client disconnected");
    });
  });

  log.info("Socket.IO gateway initialized");
  return io;
}

export function emitToUser(userId: string, event: string, data: any): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}
