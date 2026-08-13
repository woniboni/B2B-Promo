require('dotenv').config();

const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN }));

// ponytail: temporary placeholder, real routes land in BE-2+
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ponytail: temporary placeholder, exists only to prove errorHandler wiring, remove once real routes exist
app.get('/__throw', (req, res, next) => {
  try {
    throw new Error('test error');
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

module.exports = app;
