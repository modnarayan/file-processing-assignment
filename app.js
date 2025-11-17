import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import busboy from "busboy";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import Job from "./models/Job.js";
import { startWorkers } from "./worker.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

export const s3Client = new S3Client({ region: process.env.AWS_REGION });
export const bucketName = process.env.S3_BUCKET;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

// Start background workers once DB is ready
mongoose.connection.once("open", () => {
  startWorkers(3);
});

// POST /upload - streaming upload to S3 (no memory buffering)
app.post("/upload", (req, res) => {
  const bb = busboy({ headers: req.headers });
  let uploader = null;
  let fileKey = null;
  let hasFile = false;
  let error = null;

  bb.on("file", (fieldname, file, info) => {
    console.log("=== FILE RECEIVED ===", {
      fieldname,
      filename: info.filename,
    });

    if (!info.filename || !info.filename.toLowerCase().endsWith(".txt")) {
      error = "Only .txt files allowed";
      file.resume();
      return;
    }

    hasFile = true;
    fileKey = `${uuidv4()}.txt`;

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: fileKey,
        Body: file,
        ContentType: "text/plain",
      },
      queueSize: 5,
      partSize: 10 * 1024 * 1024,
    });

    uploader = upload;

    // Start upload immediately
    upload.done().catch((err) => {
      console.error("S3 upload failed:", err);
      if (!res.headersSent) res.status(500).json({ error: "Upload failed" });
    });
  });

  bb.on("finish", () => {
    if (error) return res.status(400).json({ error });
    if (!hasFile) return res.status(400).json({ error: "No valid file" });

    res.json({
      message: "File uploaded successfully",
      fileKey,
      s3Location: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`,
    });
  });

  req.pipe(bb);
});

// POST /process/:fileKey - enqueue processing job
app.post("/process/:fileKey", async (req, res) => {
  const { fileKey } = req.params;

  try {
    // Verify file exists in S3
    await s3Client.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: fileKey })
    );

    const existing = await Job.findOne({ fileKey });
    if (existing) {
      return res.json({
        jobId: existing._id,
        status: existing.status,
        insertedCount: existing.insertedCount || 0,
        error: existing.error,
      });
    }

    const job = await Job.create({ fileKey });
    res.json({ message: "Job enqueued", jobId: job._id, status: "pending" });
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: "File not found in S3" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
