const { createHash } = require('node:crypto');

function findingKey(workflow, results) {
  const failures = Object.keys(results).filter((name) => results[name].result === 'failure').sort();
  return 'kaiten-nightly-v1-' + createHash('sha256')
    .update(JSON.stringify({ workflow, failures })).digest('hex').slice(0, 24);
}

// This is the existing scheduled producer, not an additional agent publication path.
async function notify({ github, context, core, results }) {
  const key = findingKey(context.workflow, results);
  const marker = `<!-- finding-key: ${key} -->`;
  const run = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const body = [marker, '## Nightly E2E failure', '',
    `- Finding key: \`${key}\``, `- Revision: \`${context.sha}\``, `- Run: ${run}`, '',
    ...Object.keys(results).sort().map((name) => `- ${name}: \`${results[name].result}\``), '',
    'This key groups the failing job set, not individual test/root-cause identity.',
    'Reports are private evidence until explicitly reviewed for sanitized publication.',
    'Triage expected/actual behavior, minimal reproduction, failing baseline and regression test.',
    'Check existing open/closed issues and PRs before a narrow, human-reviewed draft fix.'].join('\n');
  const { data } = await github.rest.search.issuesAndPullRequests({
    q: `repo:${context.repo.owner}/${context.repo.repo} is:issue in:body "${key}"`,
    sort: 'updated', order: 'desc', per_page: 100,
  });
  if (data.incomplete_results || data.total_count > 100) {
    throw new Error('Deduplication search incomplete; refusing duplicate publication');
  }
  const existing = data.items.find((issue) => issue.body?.includes(marker));
  if (existing) {
    // Closed findings remain linked; a recurrence does not silently reopen or duplicate them.
    await github.rest.issues.createComment({ ...context.repo, issue_number: existing.number, body });
    core.info(`Linked recurrence to #${existing.number} (${existing.state})`);
    return;
  }
  await github.rest.issues.create({ ...context.repo, title: `Nightly E2E failed [${key}]`,
    body, labels: ['e2e', 'nightly-failure'] });
}

module.exports = { findingKey, notify };
