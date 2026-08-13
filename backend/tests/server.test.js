jest.mock('../src/app', () => ({
  listen: jest.fn((port, cb) => cb()),
}));

describe('server entrypoint', () => {
  test('starts the app on the configured PORT and logs it', () => {
    process.env.PORT = '4321';
    const app = require('../src/app');
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    require('../src/server');

    expect(app.listen).toHaveBeenCalledWith('4321', expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith('Server running on port 4321');

    logSpy.mockRestore();
  });

  test('falls back to port 4000 when PORT is not set', () => {
    delete process.env.PORT;
    jest.resetModules();
    const app = require('../src/app');
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    require('../src/server');

    expect(app.listen).toHaveBeenCalledWith(4000, expect.any(Function));

    logSpy.mockRestore();
  });
});
