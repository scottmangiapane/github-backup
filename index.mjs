import 'dotenv/config';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import path from 'path';

const { STORAGE, TOKEN } = process.env;

async function checkPath(directory) {
    try {
        await fs.access(directory);
        return true;
    } catch(ignored) {}
    return false;
}

async function fetchRepos() {
    const allRepos = [];
    let page = 1;

    while (true) {
        const res = await fetch(
            `https://api.github.com/user/repos?per_page=100&page=${page}&type=all`,
            {
                headers: {
                    authorization: `Bearer ${TOKEN}`,
                    accept: 'application/vnd.github+json'
                }
            }
        );

        if (!res.ok) {
            throw new Error(
                `GitHub API failed: ${res.status} ${await res.text()}`
            );
        }

        const repos = await res.json();
        allRepos.push(...repos);

        if (repos.length < 100) break;
        page++;
    }

    log(`GitHub returned ${allRepos.length} repositories`);

    for (const repo of allRepos) {
        if (repo.full_name.toLowerCase() ===
            'scottmangiapane/sysadmin-docs') {
            log(`Found target repo; fork=${repo.fork}, private=${repo.private}`);
        }
    }

    return allRepos.filter(r => !r.fork);
}

function log(line) {
    console.log(`${(new Date()).toUTCString()} - ${line}`);
}

await fs.mkdir(STORAGE, { recursive: true });

for (const repo of await fetchRepos()) {
    const directory = path.join(STORAGE, repo.name);

    if (await checkPath(directory)) {
        log(`Fetching updates for ${repo.name}`);

        const command =
            `git --git-dir "${directory}" remote update --prune`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                log(`Failed to update ${repo.name}: ${stderr || error.message}`);
            }
        });
    } else {
        log(`Taking new backup for ${repo.name}`);

        const [, base] = /^https:\/\/(.*)$/.exec(repo.clone_url);
        const url =
            `https://${encodeURIComponent(process.env.GITHUB_USERNAME)}:${encodeURIComponent(TOKEN)}@${base}`;

        const command = `git clone --mirror "${url}" "${directory}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                log(`Failed to clone ${repo.name}: ${stderr || error.message}`);
            }
        });
    }
}

