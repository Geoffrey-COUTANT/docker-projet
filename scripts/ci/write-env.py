from pathlib import Path
import os
import secrets


ROOT = Path(__file__).resolve().parents[2]
sample = (ROOT / ".env.example").read_text()
generated = {
    "SECRET_PASSWORD": secrets.token_urlsafe(48),
    "RALLLY_POSTGRES_PASSWORD": secrets.token_urlsafe(24),
    "S3_ACCESS_KEY_ID": secrets.token_hex(16),
    "S3_SECRET_ACCESS_KEY": secrets.token_hex(32),
    "GARAGE_RPC_SECRET": secrets.token_hex(32),
    "AUTHENTIK_SECRET_KEY": secrets.token_urlsafe(60),
    "AUTHENTIK_POSTGRES_PASSWORD": secrets.token_urlsafe(24),
    "OIDC_CLIENT_ID": "rallly-ci-client",
    "OIDC_CLIENT_SECRET": secrets.token_urlsafe(48),
    "AUTHENTIK_BOOTSTRAP_PASSWORD": secrets.token_urlsafe(32),
    "AUTHENTIK_BOOTSTRAP_TOKEN": secrets.token_urlsafe(48),
    "RALLLY_TEST_PASSWORD": secrets.token_urlsafe(32),
}
lines = []
for line in sample.splitlines():
    key = line.partition("=")[0]
    if key in generated:
        line = f"{key}={generated[key]}"
    lines.append(line)
(ROOT / ".env").write_text("\n".join(lines) + "\n")
github_env = os.environ.get("GITHUB_ENV")
if github_env:
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"RALLLY_TEST_PASSWORD={generated['RALLLY_TEST_PASSWORD']}\n")
