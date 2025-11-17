import mongoose from "mongoose";

const jobSchema = new mongoose.Schema({
  fileKey: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date,
  error: String,
  insertedCount: { type: Number, default: 0 },
});

export default mongoose.model("Job", jobSchema);
