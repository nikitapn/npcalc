#!/bin/bash

set -euo pipefail

ROOT_DIR=$(dirname "$(readlink -e "${BASH_SOURCE[0]}")")
DB_PATH="${1:-$ROOT_DIR/sample_data/nscalc.db}"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "sqlite3 is required to reset dev auth." >&2
    exit 1
fi

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found: $DB_PATH" >&2
    exit 1
fi

sqlite3 "$DB_PATH" <<'SQL'
UPDATE User
SET pwd = CASE email
  WHEN 'superuser@nscalc.com' THEN X'03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4'
  WHEN 'guest@nscalc.com' THEN X'AB6E4C3DD47810AE0ABC821A2DE8A25B38C1DF86B49CDEFCB58C4A55F9923902'
  ELSE pwd
END
WHERE email IN ('superuser@nscalc.com', 'guest@nscalc.com');

SELECT email, hex(pwd) AS password_sha256
FROM User
WHERE email IN ('superuser@nscalc.com', 'guest@nscalc.com')
ORDER BY id;
SQL

cat <<EOF

Reset local dev credentials in:
  $DB_PATH

Known logins:
  superuser@nscalc.com / 1234
  guest@nscalc.com / 3c2G4sc*vs2#1zf
EOF