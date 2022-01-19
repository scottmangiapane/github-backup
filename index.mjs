import 'dotenv/config';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import path from 'path';

async function fetchRepos() {
    const res = await fetch('https://api.github.com/user/repos', {
        method: 'get',
        headers: { 'authorization': `token ${process.env.TOKEN}` }
    });
    const repos = await res.json();
    return repos.filter(r => !r.fork);
}

function log(line) {
    console.log(`${(new Date()).toUTCString()} - ${line}`);
}

await fs.mkdir(process.env.STORAGE, { recursive: true });

for (const repo of await fetchRepos()) {
    const directory = path.join(process.env.STORAGE, repo.name);
    let command = `git --git-dir "${directory}" remote update --prune`;
    try {
        await fs.access(directory);
    } catch(ignored) {
        command = `git clone --mirror ${repo.clone_url} "${directory}"`;
    }
    log(command);
    exec(command);
}

