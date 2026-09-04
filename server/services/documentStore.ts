import * as fs from "fs";
import * as path from "path";
import { createHash, randomBytes } from "crypto";
import { UPLOADS_DIR } from "../utils/uploadGuard";
import { logger } from "../utils/logger";

export interface DocumentStore {
  put(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  purgeStale(olderThanMs: number): Promise<number>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,180}\.pdf$/;

function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..")) {
    throw new Error(`Unsafe document key: ${key}`);
  }
}

export function buildDocumentKey(receiptId: string, sha256Hex: string): string {
  const safeReceipt = receiptId.replace(/[^A-Za-z0-9-]/g, "");
  const safeSha = sha256Hex.replace(/[^a-f0-9]/g, "").slice(0, 64);
  return `verify/${safeReceipt}/${safeSha}.pdf`;
}

class LocalDocumentStore implements DocumentStore {
  private readonly root: string;

  constructor() {
    this.root = path.join(UPLOADS_DIR, "documents");
    fs.mkdirSync(this.root, { recursive: true });
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const abs = path.resolve(this.root, key);
    const rel = path.relative(this.root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Document key escapes store root: ${key}`);
    }
    return abs;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const dest = this.resolve(key);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomBytes(6).toString("hex")}.part`;
    await fs.promises.writeFile(tmp, bytes);
    await fs.promises.rename(tmp, dest);
  }

  async get(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.promises.unlink(this.resolve(key)).catch(() => {});
  }

  async purgeStale(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && (entry.name.endsWith(".pdf") || entry.name.endsWith(".part"))) {
          const stat = await fs.promises.stat(full).catch(() => null);
          if (stat && stat.mtimeMs < cutoff) {
            await fs.promises.unlink(full).catch(() => {});
            removed += 1;
          }
        }
      }
    };
    await walk(this.root);
    return removed;
  }
}

class S3DocumentStore implements DocumentStore {
  private client: Promise<any> | null = null;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required when DOCUMENT_STORE_DRIVER=s3");
    this.bucket = bucket;
    this.prefix = process.env.S3_PREFIX ?? "checkbyai-documents";
  }

  private async getClient(): Promise<any> {
    if (!this.client) {
      this.client = (async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        return new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "false").toLowerCase() === "true",
          credentials: process.env.S3_ACCESS_KEY_ID
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
              }
            : undefined,
        });
      })();
    }
    return this.client;
  }

  private objectKey(key: string): string {
    assertSafeKey(key);
    return `${this.prefix}/${key}`;
  }

  async put(key: string, bytes: Buffer, contentType = "application/pdf"): Promise<void> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey(key),
      Body: bytes,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<Buffer> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey(key),
    }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey(key),
    })).catch((err: unknown) => {
      logger.warn({ err, key }, "[DocumentStore] S3 delete failed (non-fatal)");
    });
  }

  async purgeStale(olderThanMs: number): Promise<number> {
    const client = await this.getClient();
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const cutoff = new Date(Date.now() - olderThanMs);
    let removed = 0;
    let token: string | undefined;
    do {
      const page: any = await client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${this.prefix}/verify/`,
        ContinuationToken: token,
      }));
      for (const obj of page.Contents ?? []) {
        if (obj.LastModified && obj.LastModified < cutoff && obj.Key) {
          await this.delete(obj.Key.slice(this.prefix.length + 1)).catch(() => {});
          removed += 1;
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return removed;
  }
}

let store: DocumentStore | null = null;

export function getDocumentStore(): DocumentStore {
  if (!store) {
    const driver = (process.env.DOCUMENT_STORE_DRIVER || "local").toLowerCase();
    store = driver === "s3" ? new S3DocumentStore() : new LocalDocumentStore();
    logger.info({ driver }, "[DocumentStore] Initialized document store");
  }
  return store;
}

export function documentKeyChecksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
