import { devMockArgs } from './dev-mock';

describe('devMockArgs', () => {
  test('serves on port 3000 when no port is asked for', () => {
    expect(devMockArgs([])).toEqual(['dev', '--port', '3000']);
  });

  test('takes the port after the `--` that `pnpm run dev:mock -- --port 3200` hands on', () => {
    const args = devMockArgs(['--', '--port', '3200']);

    expect(args).toEqual(['dev', '--port', '3200']);
    expect(args).not.toContain('--');
    expect(args).not.toContain('3000');
  });

  test('takes the port when it comes without the separator, or as --port=n', () => {
    expect(devMockArgs(['--port', '3201'])).toEqual(['dev', '--port', '3201']);
    expect(devMockArgs(['--port=3202'])).toEqual(['dev', '--port=3202']);
  });

  test('keeps the other flags, in order, next to the default port', () => {
    expect(devMockArgs(['--host', '127.0.0.1', '--strictPort'])).toEqual([
      'dev',
      '--port',
      '3000',
      '--host',
      '127.0.0.1',
      '--strictPort',
    ]);
    expect(
      devMockArgs(['--host', '127.0.0.1', '--port', '3102', '--strictPort']),
    ).toEqual([
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      '3102',
      '--strictPort',
    ]);
  });
});
