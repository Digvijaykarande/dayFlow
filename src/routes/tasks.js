const express = require("express");
const Task = require("../models/Task");
const auth = require("../middleware/auth");

const router = express.Router();
router.use(auth);

const allowedCategories = ["Work", "Study", "Health", "Personal", "Other"];
const allowedPriorities = ["Low", "Medium", "High"];

router.get("/", async (req, res, next) => {
  try {
    const query = { user: req.userId };
    if (req.query.date) query.dueDate = req.query.date;
    if (req.query.from || req.query.to) {
      query.dueDate = {};
      if (req.query.from) query.dueDate.$gte = req.query.from;
      if (req.query.to) query.dueDate.$lte = req.query.to;
    }
    if (req.query.completed === "true") query.completed = true;
    if (req.query.completed === "false") query.completed = false;
    const tasks = await Task.find(query).sort({ completed: 1, priority: -1, createdAt: -1 }).lean();
    res.json({ tasks });
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const { title, notes = "", category = "Personal", priority = "Medium", dueDate } = req.body;
    if (!String(title || "").trim()) return res.status(400).json({ message: "Give your task a title." });
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ message: "Choose a valid date." });
    if (!allowedCategories.includes(category)) return res.status(400).json({ message: "Choose a valid category." });
    if (!allowedPriorities.includes(priority)) return res.status(400).json({ message: "Choose a valid priority." });
    const task = await Task.create({ user: req.userId, title: String(title).trim(), notes, category, priority, dueDate });
    res.status(201).json({ task });
  } catch (err) { next(err); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const updates = {};
    for (const key of ["title", "notes", "category", "priority", "dueDate", "completed"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.title !== undefined && !String(updates.title).trim()) return res.status(400).json({ message: "Task title cannot be empty." });
    if (updates.category && !allowedCategories.includes(updates.category)) return res.status(400).json({ message: "Invalid category." });
    if (updates.priority && !allowedPriorities.includes(updates.priority)) return res.status(400).json({ message: "Invalid priority." });
    if (updates.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(updates.dueDate)) return res.status(400).json({ message: "Invalid date." });
    if (typeof updates.completed === "boolean") updates.completedAt = updates.completed ? new Date() : null;
    const task = await Task.findOneAndUpdate({ _id: req.params.id, user: req.userId }, updates, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ message: "Task not found." });
    res.json({ task });
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!task) return res.status(404).json({ message: "Task not found." });
    res.json({ message: "Task deleted." });
  } catch (err) { next(err); }
});

router.get("/stats/summary", async (req, res, next) => {
  try {
    const today = req.query.date || new Date().toISOString().slice(0, 10);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const weekStart = new Date(start); weekStart.setDate(start.getDate() - 6);
    const weekFrom = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,"0")}-${String(weekStart.getDate()).padStart(2,"0")}`;
    const weekTo = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;

    const [todayTasks, weekTasks, allTasks] = await Promise.all([
      Task.find({ user: req.userId, dueDate: today }).lean(),
      Task.find({ user: req.userId, dueDate: { $gte: weekFrom, $lte: weekTo } }).lean(),
      Task.find({ user: req.userId }).select("dueDate completed completedAt").lean()
    ]);

    const completedToday = todayTasks.filter(t => t.completed).length;
    const doneWeek = weekTasks.filter(t => t.completed).length;
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(start); d.setDate(start.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const items = allTasks.filter(t => t.dueDate === key);
      daily.push({ date: key, label: d.toLocaleDateString("en-US", { weekday: "short" }), total: items.length, completed: items.filter(t => t.completed).length });
    }
    const totalCompleted = allTasks.filter(t => t.completed).length;
    const totalTasks = allTasks.length;
    res.json({
      date: today,
      today: { total: todayTasks.length, completed: completedToday, remaining: todayTasks.length - completedToday, rate: todayTasks.length ? Math.round(completedToday / todayTasks.length * 100) : 0 },
      week: { total: weekTasks.length, completed: doneWeek, rate: weekTasks.length ? Math.round(doneWeek / weekTasks.length * 100) : 0, daily },
      overall: { total: totalTasks, completed: totalCompleted, rate: totalTasks ? Math.round(totalCompleted / totalTasks * 100) : 0 }
    });
  } catch (err) { next(err); }
});

module.exports = router;
