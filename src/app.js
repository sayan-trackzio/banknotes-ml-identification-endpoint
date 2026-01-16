import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import morgan from 'morgan';
import * as searchController from './controllers/searchController.js';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());

app.use(morgan(process.env.MORGAN_FORMAT || 'dev'));

// Health check endpoint
app.all('/health', (req, res) => {
  return res.status(200).json({ status: 'ok' });
});

// Multer in-memory upload
const upload = multer({ storage: multer.memoryStorage() });

// Mount controller directly (expects two files in field 'files')
app.post('/search', upload.array('files', 2), searchController.post);

// Start server when run directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, (err) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    console.info(`Query API listening on port ${PORT}`);
  });
}

export default app;
