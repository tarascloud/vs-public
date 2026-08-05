# Deploy Rollback Strategy

## Image Tagging

Before overriding `:latest`, tag the current image with the date:

```bash
# pd-prod
ssh vps "docker tag pd-prod:latest pd-prod:$(date +%Y%m%d)"
# pd-dev
ssh vps "docker tag pd-dev:latest pd-dev:$(date +%Y%m%d)"
# jobfinder
ssh vps "docker tag jobfinder:latest jobfinder:$(date +%Y%m%d)"
# website (owner container)
ssh vps "docker tag website:latest website:$(date +%Y%m%d)"
```

Then build the new image as `<name>:latest` and recreate.

## Rollback Procedure

If the new deploy is broken, roll back to the previous image:

```bash
# Example: roll back pd-prod to previous day's image
PREV_DATE=20260418  # adjust to the date tag you saved

ssh vps "docker tag pd-prod:$PREV_DATE pd-prod:latest && \
  cd /opt/docker && docker compose up -d --force-recreate pd-prod"
```

Repeat for other services (pd-dev, jobfinder, website / owner) as needed.

## DB Rollback

Before any prod deploy, always create a DB backup first:

```bash
ssh vps 'docker exec pg pg_dump -U pd pd_prod | gzip > /opt/docker/backups/pd_prod_backup_$(date +%Y%m%d_%H%M%S).sql.gz'
```

To restore from backup:

```bash
BACKUP=pd_prod_backup_20260418_030000.sql.gz
ssh vps "gunzip -c /opt/docker/backups/$BACKUP | docker exec -i pg psql -U pd pd_prod"
```

## References

- See `CLAUDE.md` §Гілки та деплой — deploy workflow rules
- See `.claude/rules/infrastructure.md` — backup commands and paths
