const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  notes: { type: String, default: "", maxlength: 1000 },
  category: { type: String, default: "Personal", enum: ["Work", "Study", "Health", "Personal", "Other"] },
  priority: { type: String, default: "Medium", enum: ["Low", "Medium", "High"] },
  dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

taskSchema.index({ user: 1, dueDate: 1, completed: 1 });
module.exports = mongoose.model("Task", taskSchema);
