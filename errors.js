class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

function validate(schema, value) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new HttpError(400, 'Request validation failed.', result.error.flatten());
  }

  return result.data;
}

function notFound(_req, _res, next) {
  next(new HttpError(404, 'The requested resource was not found.'));
}

function errorHandler(error, req, res, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500;

  if (status >= 500) {
    const driverCode = typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'UNKNOWN';
    console.error(JSON.stringify({
      event: 'request_error',
      requestId: req.id || 'unknown',
      method: req.method,
      path: req.path,
      status,
      errorCode: driverCode,
    }));
  }

  res.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : error.message,
    ...(error.details ? { details: error.details } : {}),
    ...(status >= 500 && req.id ? { requestId: req.id } : {}),
  });
}

module.exports = { HttpError, validate, notFound, errorHandler };
