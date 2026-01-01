// Controller placeholder for /match
// The handler accepts files from req.files (array of uploaded files via multer)

export async function match(req, res, next) {
  // TODO: implement matching logic
  // Access uploaded files as `req.files` (each has buffer, mimetype, originalname, etc.)

  // For now, respond with 501 Not Implemented
  res.status(501).json({ message: 'Not implemented' });
}
