Query API
=========

This is a minimal Express API that exposes a single endpoint mounted directly in `src/app.js`:

POST /match
- Accepts two image files in a multipart form field named `images` (as a list)
- Uses `multer` with memory storage to handle uploads

Setup
------

1. Install dependencies:

   npm install

2. Run in development mode:

   npm run dev

3. Example (curl):

   curl -X POST -F "images=@a.jpg" -F "images=@b.jpg" http://localhost:3000/match

Controller
----------

The controller is a placeholder and returns 501 Not Implemented. Fill in matching logic in `src/controllers/matchController.js`.

Notes
-----
- The previous `routes/match.js` file has been deprecated; the route is now mounted directly in `src/app.js`.
