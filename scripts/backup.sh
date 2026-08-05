#!/bin/bash
# Nightly database backup. Add to crontab:
#   30 21 * * *  /opt/hiklean/scripts/backup.sh >> /var/log/hiklean-backup.log 2>&1
set -euo pipefail
DIR="${BACKUP_DIR:-/opt/hiklean/backups}"
KEEP="${KEEP_DAYS:-30}"
mkdir -p "$DIR"
STAMP=$(date +%F_%H%M)
FILE="$DIR/hiklean_$STAMP.sql.gz"

# reads DATABASE_URL from the .env next to this script's parent folder
if [ -f "$(dirname "$0")/../.env" ]; then set -a; . "$(dirname "$0")/../.env"; set +a; fi

pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "$(date +%F\ %T)  wrote $FILE ($(du -h "$FILE" | cut -f1))"

# keep the last N days locally
find "$DIR" -name 'hiklean_*.sql.gz' -mtime +"$KEEP" -delete

# OFF-SITE COPY — uncomment one of these. A backup on the same machine is not a backup.
# rclone copy "$FILE" gdrive:HiKleanBackups/
# aws s3 cp "$FILE" s3://your-bucket/hiklean/
