const express = require('express');
const cors = require('cors');
const { solveTimetable } = require('./solver');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'static')));

app.post('/api/generate_schedule', (req, res) => {
  const data = req.body;
  if (!data) {
    return res.status(400).json({ success: false, error: 'Invalid input data.' });
  }
  const { subjects = [], free_time = {}, allowed_days = null, blocked_slots = null, peak_hours = null } = data;
  const result = solveTimetable(subjects, free_time, allowed_days, blocked_slots, peak_hours);
  res.json(result);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
