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
    const res = await fetch('https://api.github.com/user/repos', {
        method: 'get',
        headers: { 'authorization': `token ${TOKEN}` }
    });
    const repos = await res.json();
    return repos.filter(r => !r.fork);
}

function log(line) {
    console.log(`${(new Date()).toUTCString()} - ${line}`);
}

await fs.mkdir(STORAGE, { recursive: true });

for (const repo of await fetchRepos()) {
    const directory = path.join(STORAGE, repo.name);
    if (await checkPath(directory)) {
        log(`Fetching updates for ${repo.name}`);
        const command = `git --git-dir "${directory}" remote update --prune`;
        exec(command);
    } else {
        log(`Taking new backup for ${repo.name}`);
        const [, base] = /^https:\/\/(.*)$/.exec(repo['clone_url']);
        const url = `https://${TOKEN}@${base}`;
        const command = `git clone --mirror ${url} "${directory}"`;
        exec(command);
    }
}

