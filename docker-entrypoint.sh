#!/bin/sh

cat <<EOF > /usr/share/nginx/html/env.js
window.env = {
  VITE_API_URL: "${VITE_API_URL}"
};
EOF

exec "$@"
