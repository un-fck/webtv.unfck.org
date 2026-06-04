#!/bin/sh
# Container entrypoint for the Azure Container Apps deployment.
#
# Materialises the crontab from a template (envsubst expands ${CRON_SECRET}
# only — every other shell-syntax token in the template is escaped), starts
# the cron daemon in the background, and execs the Next.js standalone
# server so Node becomes PID 1 and governs the container lifecycle.
#
# cron's stdout/stderr are inherited from this shell, which Docker captures
# as the container's stdout/stderr — so per-tick curl output lands in Azure
# Container Apps logs without extra plumbing.

set -eu

if [ -z "${CRON_SECRET:-}" ]; then
  echo "[entrypoint] WARN: CRON_SECRET unset; cron HTTP fires will be rejected by the route handlers (401)." >&2
fi

# Drop the materialised crontab into /etc/cron.d (cron auto-picks this up
# at the next minute boundary, no need to invoke `crontab` as a user).
# mode 0644 + ownership root:root is the format cron expects for
# /etc/cron.d files; anything else is silently ignored.
envsubst '$CRON_SECRET' < /etc/cron.d/un-cron.template > /etc/cron.d/un-cron
chmod 0644 /etc/cron.d/un-cron
chown root:root /etc/cron.d/un-cron

# Foreground mode keeps cron logging to stderr rather than syslog, which
# this container doesn't run. `&` puts it in the background so Node can
# take the foreground.
cron -f &

# Replace the shell with Node. Node becomes PID 1; SIGTERM from Azure goes
# straight to it, container lifecycle == Node lifecycle.
exec node server.js
