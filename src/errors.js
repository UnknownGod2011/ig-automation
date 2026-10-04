export class AppError extends Error {
  constructor(message, stage = 'validation', status = 400) {
    super(message); this.stage = stage; this.status = status;
  }
}
export function safeError(error) {
  return error instanceof AppError ? error.message : 'This step could not complete. Please try again.';
}
