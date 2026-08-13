const errorHandler = require('../src/middlewares/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('defaults to 500 with error message', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    const err = new Error('boom');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'boom' });
  });

  test('uses err.status when present', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    const err = Object.assign(new Error('nope'), { status: 404 });

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'nope' });
  });

  test('falls back to a generic message when err.message is empty', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    const err = { status: undefined, message: '' };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });

  test('logs the error via console.error', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    const err = new Error('logged');

    errorHandler(err, req, res, next);

    expect(consoleErrorSpy).toHaveBeenCalledWith(err);
  });
});
