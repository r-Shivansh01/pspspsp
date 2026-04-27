const express = require('express');
const booksRouter = require('./routes/books');

const app = express();

app.use(express.json());

// Welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the Books API',
    endpoints: {
      health: '/health',
      books: '/books'
    }
  });
});

// Health check endpoint — used by Docker, Kubernetes, and Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/books', booksRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
