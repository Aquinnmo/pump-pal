const fs = require('node:fs');
const readline = require('node:readline/promises');

const { fieldsToJs, getAccessToken, listDocuments, requestJson } = require('../catalog/firestore-readonly-snapshot');

// Already gitignored; needs Firestore write access, unlike the read-only catalog credential.
const DEFAULT_CREDENTIAL_PATH = 'db-agent-write-perms.json';

function parseArgs(argv) {
  const args = { apply: false, credentialPath: DEFAULT_CREDENTIAL_PATH, dryRun: false, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--credential') {
      args.credentialPath = argv[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.apply && args.dryRun) throw new Error('--apply and --dry-run cannot be used together');
  return args;
}

function printHelp() {
  console.log(`Usage: bun run moderation:review -- [options]

Walks the open user reports (Firestore \`reports\`, filed in-app) and lets you
dismiss each one, or action it and optionally suspend the reported user from
social features (\`users/{uid}.socialSuspended\`, enforced by the API).

Options:
  --apply                 Write the decisions after each confirmation.
  --dry-run               List open reports without prompting or writing.
  --credential <path>     Service-account JSON with Firestore write access
                          (default: ${DEFAULT_CREDENTIAL_PATH}).
  -h, --help              Show this help.

Without --apply the command never writes, even after you answer the prompts.`);
}

function documentId(documentName) {
  return documentName.split('/').pop();
}

function documentUrl(projectId, documentPath) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

function timestampMillis(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  if (typeof value === 'string') return Date.parse(value);
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
  return Number.POSITIVE_INFINITY;
}

/** Open reports, oldest first, so nothing sits at the bottom of the queue forever. */
function openReportsFromDocuments(documents) {
  return documents
    .map((document) => ({ id: documentId(document.name), ...fieldsToJs(document.fields || {}) }))
    .filter((report) => report.status === 'open')
    .sort((left, right) => {
      const difference = timestampMillis(left.createdAt) - timestampMillis(right.createdAt);
      return difference || left.id.localeCompare(right.id);
    });
}

function describeReport(report) {
  const note = report.note ? `\n  note:     ${report.note}` : '';
  return [
    `${report.id}`,
    `  reported: ${report.reportedUsername || '(no username)'} (${report.reported})`,
    `  reporter: ${report.reporter}`,
    `  reason:   ${report.reason}`,
    `  filed:    ${report.createdAt instanceof Object ? new Date(timestampMillis(report.createdAt)).toISOString() : report.createdAt}${note}`,
  ].join('\n');
}

/**
 * The two writes for a decision. Always an updateMask PATCH: without one a
 * Firestore PATCH replaces the whole document. Pure, so it can be tested
 * without a network.
 */
function buildWrites({ projectId, report, decision, suspend, now }) {
  const writes = [
    {
      url: `${documentUrl(projectId, `reports/${report.id}`)}?updateMask.fieldPaths=status&updateMask.fieldPaths=resolvedAt`,
      body: { fields: { status: { stringValue: decision }, resolvedAt: { timestampValue: now } } },
    },
  ];
  if (decision === 'actioned' && suspend) {
    writes.push({
      url: `${documentUrl(projectId, `users/${report.reported}`)}?updateMask.fieldPaths=socialSuspended`,
      body: { fields: { socialSuspended: { booleanValue: true } } },
    });
  }
  return writes;
}

async function patch({ accessToken, url, body }) {
  const payload = JSON.stringify(body);
  return requestJson(
    url,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload,
  );
}

function createPrompt() {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    input,
    async ask(question) {
      return (await input.question(`${question}: `)).trim().toLowerCase();
    },
  };
}

async function run(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  const serviceAccount = JSON.parse(fs.readFileSync(args.credentialPath, 'utf8'));
  const projectId = serviceAccount.project_id;
  const accessToken = await getAccessToken(serviceAccount);
  const open = openReportsFromDocuments(await listDocuments({ accessToken, projectId, collectionPath: 'reports' }));

  if (open.length === 0) {
    console.log('No open reports.');
    return;
  }
  console.log(`${open.length} open report${open.length === 1 ? '' : 's'}.\n`);
  if (args.dryRun) {
    open.forEach((report) => console.log(`${describeReport(report)}\n`));
    return;
  }

  const prompt = createPrompt();
  try {
    for (const report of open) {
      console.log(describeReport(report));
      const answer = await prompt.ask('[d]ismiss, [a]ction, [s]kip, [q]uit');
      if (answer === 'q') break;
      if (answer !== 'd' && answer !== 'a') continue;

      const decision = answer === 'd' ? 'dismissed' : 'actioned';
      const suspend = decision === 'actioned' && (await prompt.ask(`Suspend ${report.reportedUsername || report.reported} from social? [y/N]`)) === 'y';
      const writes = buildWrites({ projectId, report, decision, suspend, now: new Date().toISOString() });

      if (!args.apply) {
        console.log(`Would mark ${report.id} ${decision}${suspend ? ' and suspend the user' : ''}. Re-run with --apply to write.\n`);
        continue;
      }
      for (const write of writes) await patch({ accessToken, ...write });
      console.log(`Marked ${report.id} ${decision}${suspend ? ' and suspended the user' : ''}.\n`);
    }
  } finally {
    prompt.input.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { buildWrites, describeReport, documentUrl, openReportsFromDocuments, parseArgs, timestampMillis };
