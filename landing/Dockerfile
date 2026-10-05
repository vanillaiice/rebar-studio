FROM caddy:2.11.6-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html fr.html styles.css theme.css theme.js main.js robots.txt sitemap.xml /usr/share/caddy/
COPY assets/ /usr/share/caddy/assets/

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
