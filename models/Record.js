import mongoose from "mongoose";

// Flexible schema — accepts any fields from NDJSON lines
const recordSchema = new mongoose.Schema(
  {
    fileKey: { type: String, required: true },
  },
  { strict: false, timestamps: true }
);

export default mongoose.model("Record", recordSchema);
