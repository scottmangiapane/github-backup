import 'dotenv/config';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const {
    STORAGE,
    TOKEN,
    INCLUDE_FORKS = 'false',
} = process.env;

const API_URL = 'https://api.github.com';
const PAGE_SIZE = 100;
const COMMAND_TIMEOUT = 30 * 60 * 1000;

function log(message) {
    console.log(`${new Date().toISOString()} - ${message}`);
}

function validateConfig() {
    if (!STORAGE?.trim()) {
        throw new Error('STORAGE must be set in .env');
    }

    if (!TOKEN?.trim()) {
        throw new Error('TOKEN must be set in .env');
    }

    if (!['true', 'false'].includes(INCLUDE_FORKS.toLowerCase())) {
        throw new Error('INCLUDE_FORKS must be true or false');
    }
}

async function runGit(args) {
    try {
        return await execFileAsync('git', args, {
            windowsHide: true,
            timeout: COMMAND_TIMEOUT,
            maxBuffer: 10 * 1024 * 1024,
            env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: '0',
            },
        });
    } catch (error) {
        // Git errors may contain remote URLs or other sensitive
        // information. Log the operation context, not full commands.
        throw new Error(
            `Git exited with ${error.code ?? error.signal ?? 'an error'}: ` +
            `${error.stderr?.trim() || error.message}`
        );
    }
}

async function fetchRepos() {
    const repos = [];

    for (let page = 1; ; page++) {
        const url = new URL(`${API_URL}/user/repos`);

        url.searchParams.set('per_page', String(PAGE_SIZE));
        url.searchParams.set('page', String(page));
        url.searchParams.set('type', 'all');
        url.searchParams.set('sort', 'full_name');
        url.searchParams.set('direction', 'asc');

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            // Do not log request headers or the token.
            throw new Error(
                `GitHub API error: HTTP ${response.status} ` +
                `${response.statusText}`
            );
        }

        const batch = await response.json();

        if (!Array.isArray(batch)) {
            throw new Error('Unexpected response from GitHub API');
        }

        repos.push(...batch);

        log(`Read page ${page}: ${batch.length} repositories`);

        if (batch.length < PAGE_SIZE) {
            break;
        }
    }

    const selected = INCLUDE_FORKS.toLowerCase() === 'true'
        ? repos
        : repos.filter(repo => !repo.fork);

    log(`Discovered ${repos.length}; selected ${selected.length}`);

    return selected;
}

async function exists(directory) {
    try {
        await fs.access(directory);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

async function isBareRepository(directory) {
    try {
        const { stdout } = await runGit([
            '--git-dir', directory,
            'rev-parse', '--is-bare-repository',
        ]);

        return stdout.trim() === 'true';
    } catch {
        return false;
    }
}

async function setSshRemote(directory, sshUrl) {
    const { stdout } = await runGit([
        '--git-dir', directory,
        'remote',
    ]);

    if (stdout.split(/\r?\n/).includes('origin')) {
        await runGit([
            '--git-dir', directory,
            'remote', 'set-url', 'origin', sshUrl,
        ]);
    } else {
        await runGit([
            '--git-dir', directory,
            'remote', 'add', 'origin', sshUrl,
        ]);
    }
}

async function backupRepo(repo) {
    if (!repo.full_name || !repo.ssh_url) {
        throw new Error('Repository API response is missing its name or SSH URL');
    }

    // Use owner/repo to avoid collisions between repositories
    // that share a name but have different owners.
    const directory = path.join(
        path.resolve(STORAGE),
        repo.full_name
    );

    if (await exists(directory)) {
        if (!(await isBareRepository(directory))) {
            throw new Error(
                `Destination exists but is not a valid bare repository: ${directory}`
            );
        }

        log(`Updating ${repo.full_name}`);

        await setSshRemote(directory, repo.ssh_url);

        await runGit([
            '--git-dir', directory,
            'remote', 'update', '--prune',
        ]);
    } else {
        log(`Cloning ${repo.full_name}`);

        await fs.mkdir(path.dirname(directory), { recursive: true });

        try {
            await runGit([
                'clone', '--mirror', '--',
                repo.ssh_url,
                directory,
            ]);
        } catch (error) {
            // Remove an incomplete clone so a later run can retry.
            await fs.rm(directory, {
                recursive: true,
                force: true,
            }).catch(() => {});

            throw error;
        }
    }

    log(`Completed ${repo.full_name}`);
}

async function main() {
    validateConfig();

    // Fail early if Git or SSH is unavailable.
    await runGit(['--version']);
    await fs.mkdir(STORAGE, { recursive: true });

    const repos = await fetchRepos();

    let succeeded = 0;
    let failed = 0;

    for (const repo of repos) {
        try {
            await backupRepo(repo);
            succeeded++;
        } catch (error) {
            failed++;
            log(`FAILED ${repo.full_name}: ${error.message}`);
        }
    }

    log(`Finished: ${succeeded} succeeded, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
}

try {
    await main();
} catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exitCode = 1;
}

