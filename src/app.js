import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import morgan from 'morgan';
import * as matchController from './controllers/matchController.js';
import * as searchController from './controllers/searchController.js';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());

app.use(morgan(process.env.MORGAN_FORMAT || 'dev'));

// Health check endpoint
app.all('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Multer in-memory upload
const upload = multer({ storage: multer.memoryStorage() });

// Mount controller directly (expects two files in field 'images')
app.post('/match', upload.array('images', 2), matchController.match);
app.post('/search', upload.array('images', 2), searchController.match);

// Start server when run directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, (err) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    console.log(`Query API listening on port ${PORT}`);
  });
}

export default app;
