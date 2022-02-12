# Github Backup

Even though I'm sure GitHub takes good care of my repos, I feel better having backups hosted on my own hardware. This simple Node.js script automatically creates and maintains mirrors of all my GitHub repositories.

## Setup

1. Install dependencies:
    ```
    npm install
    ```
2. Generate a personal access token with full control of private repositories.
3. Make a `.env` file with the following content:
   ```
   STORAGE=<path-to-your-storage-directory>
   TOKEN=<your-personal-access-token>
   ```
4. Run the script:
    ```
    npm run start
    ```
5. Set up a systemd timer or cron job (optional).
