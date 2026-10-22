const test = require('node:test');
const assert = require('node:assert/strict');
const { findingKey, notify } = require('../nightly-finding.cjs');
const results = { app: { result: 'failure' }, browser: { result: 'success' } };

test('signature stable across dates/revisions/order; failing job set distinguishes findings', () => {
  assert.equal(findingKey('E2E', results), findingKey('E2E', { browser: { result: 'success' }, app: { result: 'failure' } }));
  assert.notEqual(findingKey('E2E', results), findingKey('E2E', { browser: { result: 'failure' } }));
});

for (const state of ['open', 'closed']) {
  test(`existing ${state} finding is linked, not duplicated or reopened`, async () => {
    const key = findingKey('E2E', results);
    let comments = 0;
    const github = { rest: { search: { issuesAndPullRequests: async ({ q }) => {
      assert.ok(!q.includes('is:open'));
      return { data: { total_count: 1, items: [{ number: 42, state, body: `<!-- finding-key: ${key} -->` }] } };
    } }, issues: {
      create: async () => assert.fail('duplicate issue'),
      createComment: async ({ issue_number, body }) => { assert.equal(issue_number, 42); assert.ok(body.includes(key)); comments++; },
    } } };
    await notify({ github, context: { workflow: 'E2E', repo: { owner: 'fixture', repo: 'repo' }, sha: 'a'.repeat(40), serverUrl: 'https://github.com', runId: 123 }, core: { info() {} }, results });
    assert.equal(comments, 1);
  });
}

test('incomplete search blocks publication', async () => {
  const github = { rest: { search: { issuesAndPullRequests: async () => ({ data: { incomplete_results: true, items: [], total_count: 0 } }) }, issues: { create: () => assert.fail('must not publish') } } };
  await assert.rejects(notify({ github, context: { workflow: 'E2E', repo: { owner: 'fixture', repo: 'repo' } }, core: {}, results }), /incomplete/);
});

test('incomplete search with matching finding blocks comments as well as creation', async () => {
  const key = findingKey('E2E', results);
  const github = { rest: { search: { issuesAndPullRequests: async () => ({ data: { incomplete_results: true, total_count: 1, items: [{ number: 1, body: `<!-- finding-key: ${key} -->` }] } }) }, issues: { create: () => assert.fail('publication'), createComment: () => assert.fail('publication') } } };
  await assert.rejects(notify({ github, context: { workflow: 'E2E', repo: { owner: 'fixture', repo: 'repo' } }, core: {}, results }), /incomplete/);
});
