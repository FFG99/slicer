import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/startingPoint.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { normalizeStartingPoint } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('switching from a 2D map to a 1D map removes hidden coordinates', () => {
  assert.deepEqual(normalizeStartingPoint([0.2, 0.3], { variables: ['x'] }), [0.2]);
});

test('expanding the state uses system defaults and preserves entered zero', () => {
  const system = { variables: ['x', 'y', 'z'], default_starting_point: [1, 2, 3] };
  assert.deepEqual(normalizeStartingPoint([0], system), [0, 2, 3]);
  assert.deepEqual(normalizeStartingPoint(undefined, system), [1, 2, 3]);
  assert.deepEqual(normalizeStartingPoint([], { variables: ['x'] }), [0.1]);
});
