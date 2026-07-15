"""Konfiguration aus Umgebungsvariablen bzw. einer .env-Datei."""

import os
from dataclasses import dataclass
from pathlib import Path


def load_env(path: str | os.PathLike = ".env") -> None:
    """Einfacher .env-Loader (KEY=VALUE, '#' als Kommentar).

    Bereits gesetzte Umgebungsvariablen haben Vorrang.
    """
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass
class Config:
    application_id: str
    private_key_path: Path
    redirect_url: str
    api_origin: str
    db_path: Path
    consent_days: int
    first_fetch_days: int

    @classmethod
    def from_env(cls, base_dir: Path | None = None) -> "Config":
        base = base_dir or Path.cwd()
        load_env(base / ".env")
        return cls(
            application_id=os.environ.get("EB_APPLICATION_ID", ""),
            private_key_path=Path(os.environ.get("EB_PRIVATE_KEY_PATH", base / "secrets" / "private.pem")),
            redirect_url=os.environ.get("EB_REDIRECT_URL", ""),
            api_origin=os.environ.get("EB_API_ORIGIN", "https://api.enablebanking.com"),
            db_path=Path(os.environ.get("KONTO_DB_PATH", base / "data" / "kontotracker.db")),
            consent_days=int(os.environ.get("EB_CONSENT_DAYS", "90")),
            first_fetch_days=int(os.environ.get("KONTO_FIRST_FETCH_DAYS", "730")),
        )

    def require_api(self) -> list[str]:
        """Liefert fehlende Pflichtwerte für den API-Zugang (leer = alles da)."""
        missing = []
        if not self.application_id:
            missing.append("EB_APPLICATION_ID")
        if not self.private_key_path.is_file():
            missing.append(f"EB_PRIVATE_KEY_PATH (Datei fehlt: {self.private_key_path})")
        if not self.redirect_url:
            missing.append("EB_REDIRECT_URL")
        return missing
