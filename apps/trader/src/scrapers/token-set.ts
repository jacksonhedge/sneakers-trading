import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRADER_ROOT = resolve(__dirname, '../..');
const ENV_PATH = join(TRADER_ROOT, '.env');

const KNOWN_PLATFORMS: Record<string, string> = {
  prophetx: 'PROPHETX_BEARER_TOKEN',
  novig: 'NOVIG_BEARER_TOKEN',
  draftkings: 'DRAFTKINGS_BEARER_TOKEN',
  fanduel: 'FANDUEL_BEARER_TOKEN',
  prizepicks: 'PRIZEPICKS_BEARER_TOKEN',
  underdog: 'UNDERDOG_BEARER_TOKEN',
  cdna: 'CDNA_BEARER_TOKEN',
  oddsapi: 'ODDS_API_KEY',
  opinion: 'OPINION_API_KEY',
};

function parseArgs(): { platform: string; token: string } {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const platformArg = args.find((a) => a.startsWith('--platform='));
  const tokenArg = args.find((a) => a.startsWith('--token='));
  let platform = platformArg ? platformArg.slice('--platform='.length) : args[0];
  let token = tokenArg ? tokenArg.slice('--token='.length) : args[1];
  if (!platform || !token) {
    console.error('Usage: pnpm token:set -- --platform=<name> --token=<value>');
    console.error('   or: pnpm token:set -- <platform> <token>');
    console.error(`Known platforms: ${Object.keys(KNOWN_PLATFORMS).join(', ')}`);
    process.exit(1);
  }
  return { platform: platform.toLowerCase(), token };
}

function upsertEnvVar(envText: string, key: string, value: string): string {
  const lines = envText.split('\n');
  const re = new RegExp(`^${key}=`);
  let found = false;
  const next = lines.map((line) => {
    if (re.test(line)) { found = true; return `${key}=${value}`; }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  return next.join('\n').replace(/\n+$/, '') + '\n';
}

function main() {
  const { platform, token } = parseArgs();
  const envKey = KNOWN_PLATFORMS[platform] ?? `${platform.toUpperCase()}_BEARER_TOKEN`;
  const current = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const next = upsertEnvVar(current, envKey, token);
  writeFileSync(ENV_PATH, next, { mode: 0o600 });
  const preview = token.length > 30 ? `${token.slice(0, 20)}...${token.slice(-10)}` : token;
  console.log(`Set ${envKey} in ${ENV_PATH}`);
  console.log(`  value: ${preview}`);
}

main();
