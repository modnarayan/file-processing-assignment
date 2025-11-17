import { GetObjectCommand } from "@aws-sdk/client-s3";
import readline from "readline";
import Record from "./models/Record.js";
import Job from "./models/Job.js";
import { s3Client, bucketName } from "./app.js";

async function processFile(fileKey) {
  const cmd = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
  const response = await s3Client.send(cmd);
  const stream = response.Body;

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let batch = [];
  let totalInserted = 0;
  const BATCH_SIZE = 1000;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") {
        obj.fileKey = fileKey;
        batch.push(obj);

        if (batch.length >= BATCH_SIZE) {
          await Record.insertMany(batch, { ordered: false });
          totalInserted += batch.length;
          batch = [];
        }
      }
    } catch (e) {
      // Silently skip malformed lines — resilience requirement
    }
  }

  // Flush remaining batch
  if (batch.length > 0) {
    await Record.insertMany(batch, { ordered: false });
    totalInserted += batch.length;
  }

  return totalInserted;
}

export async function startWorkers(concurrency = 3) {
  // On server restart, reset any stuck "processing" jobs
  await Job.updateMany(
    { status: "processing" },
    { $set: { status: "pending" }, $unset: { startedAt: 1 } }
  );

  const worker = async () => {
    while (true) {
      const job = await Job.findOneAndUpdate(
        { status: "pending" },
        { $set: { status: "processing", startedAt: new Date() } },
        { sort: { createdAt: 1 } } // FIFO fairness
      );

      if (!job) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }

      try {
        const inserted = await processFile(job.fileKey);
        await Job.findByIdAndUpdate(job._id, {
          status: "completed",
          completedAt: new Date(),
          insertedCount: inserted,
        });
      } catch (err) {
        await Job.findByIdAndUpdate(job._id, {
          status: "failed",
          error: err.message || "Unknown error",
        });
      }
    }
  };

  // Start N concurrent workers
  for (let i = 0; i < concurrency; i++) {
    worker().catch(console.error);
  }
}
