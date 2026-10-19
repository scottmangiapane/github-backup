# GitHub Backup

I'm sure GitHub takes good care of my repositories, but I feel better keeping backups on my own hardware. This simple Node.js script creates and maintains mirrors of my GitHub repositories.

## Setup

1. Install dependencies and create your environment file:
   ```
   npm install
   cp .env.example .env
   ```
2. Create a [GitHub personal access token](<https://github.com/settings/personal-access-tokens>) with access to the repositories you want to back up.
3. Ensure your SSH key is added to GitHub and can access those repositories.
4. Edit `.env` with your backup directory, token, and fork preference.
5. Run the backup:
   ```
   npm start
   ```
6. (Optional) Schedule automatic backups using a systemd timer or cron.

**Note:** This backs up Git repository data only, not issues, pull requests, release attachments, or GitHub settings. Keep your token private, and never commit `.env` or your backups to a public repository.

