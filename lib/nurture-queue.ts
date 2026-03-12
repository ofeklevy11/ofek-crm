import { redis } from "@/lib/redis";

const BATCH_TTL = 300; // 5 minutes

type QueueItemStatus = "pending" | "sending" | "sent" | "failed";

interface QueueItem {
  name: string;
  channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean };
  templateName: string;
  status: QueueItemStatus;
}

interface BatchMeta {
  slug: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  startedAt: string;
  userId: number;
}

export interface BatchQueueStatus {
  meta: BatchMeta;
  items: Array<{ phone: string } & QueueItem>;
}

function batchKey(batchId: string) {
  return `nq:batch:${batchId}`;
}

function metaKey(batchId: string) {
  return `nq:meta:${batchId}`;
}

export async function initBatchQueue(
  batchId: string,
  userId: number,
  slug: string,
  subscribers: Array<{ phone: string; name: string }>,
  channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean },
  templateName: string
): Promise<void> {
  const pipeline = redis.pipeline();
  const bk = batchKey(batchId);
  const mk = metaKey(batchId);

  for (const sub of subscribers) {
    const item: QueueItem = {
      name: sub.name,
      channels,
      templateName,
      status: "pending",
    };
    pipeline.hset(bk, sub.phone, JSON.stringify(item));
  }
  pipeline.expire(bk, BATCH_TTL);

  const meta: BatchMeta = {
    slug,
    totalCount: subscribers.length,
    completedCount: 0,
    failedCount: 0,
    startedAt: new Date().toISOString(),
    userId,
  };
  pipeline.hset(mk, meta as any);
  pipeline.expire(mk, BATCH_TTL);

  await pipeline.exec();
}

export async function updateQueueItemStatus(
  batchId: string,
  phone: string,
  status: QueueItemStatus
): Promise<void> {
  const bk = batchKey(batchId);
  const mk = metaKey(batchId);

  const raw = await redis.hget(bk, phone);
  if (!raw) return;

  const item: QueueItem = JSON.parse(raw);
  const prevStatus = item.status;
  item.status = status;

  const pipeline = redis.pipeline();
  pipeline.hset(bk, phone, JSON.stringify(item));

  // Update counters only on terminal transitions
  if (status === "sent" && prevStatus !== "sent") {
    pipeline.hincrby(mk, "completedCount", 1);
  } else if (status === "failed" && prevStatus !== "failed") {
    pipeline.hincrby(mk, "failedCount", 1);
  }

  // Refresh TTL
  pipeline.expire(bk, BATCH_TTL);
  pipeline.expire(mk, BATCH_TTL);

  await pipeline.exec();
}

export async function getBatchQueueStatus(
  batchId: string
): Promise<BatchQueueStatus | null> {
  const [metaRaw, itemsRaw] = await Promise.all([
    redis.hgetall(metaKey(batchId)),
    redis.hgetall(batchKey(batchId)),
  ]);

  if (!metaRaw || !metaRaw.slug) return null;

  const meta: BatchMeta = {
    slug: metaRaw.slug,
    totalCount: parseInt(metaRaw.totalCount, 10) || 0,
    completedCount: parseInt(metaRaw.completedCount, 10) || 0,
    failedCount: parseInt(metaRaw.failedCount, 10) || 0,
    startedAt: metaRaw.startedAt,
    userId: parseInt(metaRaw.userId, 10) || 0,
  };

  const items: Array<{ phone: string } & QueueItem> = [];
  for (const [phone, raw] of Object.entries(itemsRaw)) {
    try {
      const item: QueueItem = JSON.parse(raw);
      items.push({ phone, ...item });
    } catch {
      // skip malformed entries
    }
  }

  return { meta, items };
}
