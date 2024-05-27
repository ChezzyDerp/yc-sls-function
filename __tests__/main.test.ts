import * as cp from 'child_process';
import * as path from 'path';
import * as process from 'process';
import {expect, test} from '@jest/globals';
import {parseLockboxVariables, Secret, ZipInputs, zipSources} from '../src/main';
import archiver from 'archiver';

// This test will run only in fully configured env and creates real VM
// in the Yandex Cloud, so it will be disabled in CI/CD. You can enable it to test locally.
test.skip('test runs', () => {
  process.env['INPUT_INCLUDE'] = '.\n./package.json';
  process.env['INPUT_EXCLUDE'] = '**/*.txt\n**/*.yaml\n**/*.ts';
  process.env['INPUT_TAGS'] = 'foo\nbar';

  const np = process.execPath;
  const ip = path.join(__dirname, '..', 'lib', 'main.js');
  const options: cp.ExecFileSyncOptions = {
    env: process.env,
    cwd: __dirname,
  };
  let res;
  try {
    res = cp.execFileSync(np, [ip], options);
  } catch (e) {
    console.log((e as any).stdout.toString());
    console.log((e as any).stderr.toString());
  }
  console.log(res?.toString());
});

describe('zipSources', function () {
  test('it should add files from include', async () => {
    const archive = archiver('zip', {zlib: {level: 9}});
    const inputs: ZipInputs = {
      include: ['./src'],
      excludePattern: [],
      sourceRoot: '.',
    };

    const entries: archiver.EntryData[] = [];
    archive.on('entry', e => entries.push(e));
    await zipSources(inputs, archive);

    const allStartWithSrc = entries.every(e => e.name.includes('src'));
    expect(allStartWithSrc).toBeTruthy();
  });

  test('it should drop files from if they do not match include patterns', async () => {
    const archive = archiver('zip', {zlib: {level: 9}});
    const inputs: ZipInputs = {
      include: ['./src/*.js'],
      excludePattern: [],
      sourceRoot: '.',
    };

    const entries: archiver.EntryData[] = [];
    archive.on('entry', e => entries.push(e));
    await zipSources(inputs, archive);

    const allStartWithSrc = entries.every(e => e.name.includes('src'));
    expect(allStartWithSrc).toBeTruthy();
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe('src/func.js');
  });

  test('it should drop files from if they match exclude patterns', async () => {
    const archive = archiver('zip', {zlib: {level: 9}});
    const inputs: ZipInputs = {
      include: ['./src'],
      excludePattern: ['*.txt'],
      sourceRoot: '.',
    };

    const entries: archiver.EntryData[] = [];
    archive.on('entry', e => entries.push(e));
    await zipSources(inputs, archive);

    const allStartWithSrc = entries.every(e => e.name.includes('src'));
    expect(allStartWithSrc).toBeTruthy();
    expect(entries.length).toBe(8);
  });

  test('it should drop folder prefix if sourceRoot provided', async () => {
    const archive = archiver('zip', {zlib: {level: 9}});
    const inputs: ZipInputs = {
      include: ['.'],
      excludePattern: [],
      sourceRoot: './src',
    };

    const entries: archiver.EntryData[] = [];
    archive.on('entry', e => entries.push(e));
    await zipSources(inputs, archive);

    const noneStartWithSrc = entries.every(e => !e.name.includes('src'));

    expect(noneStartWithSrc).toBeTruthy();
    expect(entries.length).toEqual(9);
  });

  test.each([['./src'], ['./src/'], ['src']])(
    'it should respect source root and include only needed files with root %s',
    async sourceRoot => {
      const archive = archiver('zip', {zlib: {level: 9}});
      const inputs: ZipInputs = {
        include: ['./*.js', 'foo/1.txt'],
        excludePattern: [],
        sourceRoot,
      };

      const entries: archiver.EntryData[] = [];
      archive.on('entry', e => entries.push(e));
      await zipSources(inputs, archive);

      const noneStartWithSrc = entries.every(e => !e.name.includes('src'));
      expect(noneStartWithSrc).toBeTruthy();
      expect(entries.length).toBe(2);
      entries.sort((a, b) => a.name.localeCompare(b.name));
      expect(entries[0].name).toBe('foo/1.txt');
      expect(entries[1].name).toBe('func.js');
    },
  );

  test('it should add folders', async () => {
    const archive = archiver('zip', {zlib: {level: 9}});
    const inputs: ZipInputs = {
      include: ['./src/foo', './src/bar/*'],
      excludePattern: [],
      sourceRoot: '.',
    };

    const entries: archiver.EntryData[] = [];
    archive.on('entry', e => entries.push(e));
    await zipSources(inputs, archive);

    const allStartWithSrc = entries.every(e => e.name.includes('src'));
    expect(allStartWithSrc).toBeTruthy();
    expect(entries.length).toBe(4);
    expect(entries.map(x => x.name).sort()).toMatchSnapshot();
  });

  test('it should ignore empty lines in include', async () => {
    const archive = archiver('zip', {zlib: {level: 9}});
    const inputs: ZipInputs = {
      include: ['func.js', 'foo/1.txt', ''],
      excludePattern: [],
      sourceRoot: './src/',
    };

    const entries: archiver.EntryData[] = [];
    archive.on('entry', e => entries.push(e));
    await zipSources(inputs, archive);

    const noneStartWithSrc = entries.every(e => !e.name.includes('src'));
    expect(noneStartWithSrc).toBeTruthy();
    expect(entries.length).toEqual(2);
    expect(entries.map(x => x.name).sort()).toMatchSnapshot();
  });
});

describe('lockbox', () => {
  test('it should return right lockbox secrets', () => {
    const input = ['ENV_VAR_1=id/verId/VAR_1', 'ENV_VAR_2=id/verId/VAR_2'];
    const result = parseLockboxVariables(input);
    const expected: Secret[] = [
      {
        environmentVariable: 'ENV_VAR_1',
        id: 'id',
        versionId: 'verId',
        key: 'VAR_1',
      },
      {
        environmentVariable: 'ENV_VAR_2',
        id: 'id',
        versionId: 'verId',
        key: 'VAR_2',
      },
    ];
    expect(result).toEqual(expected);
  });

  test.each(['123412343', '123=id', '123=id/verId', '123=id/verId/'])(
    'it should throw error when bad input provided %s',
    input => {
      expect(() => parseLockboxVariables([input])).toThrow();
    },
  );
});
