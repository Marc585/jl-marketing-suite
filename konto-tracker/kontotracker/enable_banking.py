"""Minimaler Enable-Banking-API-Client (https://enablebanking.com/docs/api/reference/).

Authentifizierung: RS256-signiertes JWT mit der Application-ID als `kid`.
Der private Schlüssel stammt aus dem Enable-Banking-Control-Panel und liegt
nur lokal (niemals im Repo).
"""

import time
from pathlib import Path

import jwt
import requests


class EnableBankingError(RuntimeError):
    def __init__(self, status_code: int, message: str):
        super().__init__(f"HTTP {status_code}: {message}")
        self.status_code = status_code


class SessionExpiredError(EnableBankingError):
    """Consent/Session abgelaufen — Nutzer muss neu autorisieren (SCA)."""


class EnableBankingClient:
    def __init__(self, application_id: str, private_key_path: Path,
                 api_origin: str = "https://api.enablebanking.com"):
        self.application_id = application_id
        self.api_origin = api_origin.rstrip("/")
        self._private_key = Path(private_key_path).read_text(encoding="utf-8")
        self._http = requests.Session()

    # -- Auth ----------------------------------------------------------------

    def _jwt(self) -> str:
        now = int(time.time())
        return jwt.encode(
            {"iss": "enablebanking.com", "aud": "api.enablebanking.com",
             "iat": now, "exp": now + 3600},
            self._private_key,
            algorithm="RS256",
            headers={"kid": self.application_id},
        )

    def _request(self, method: str, path: str, **kwargs) -> dict:
        resp = self._http.request(
            method, f"{self.api_origin}{path}",
            headers={"Authorization": f"Bearer {self._jwt()}"},
            timeout=60, **kwargs,
        )
        if resp.status_code == 401:
            raise SessionExpiredError(resp.status_code, resp.text)
        if not resp.ok:
            raise EnableBankingError(resp.status_code, resp.text)
        return resp.json()

    # -- Endpunkte -----------------------------------------------------------

    def application(self) -> dict:
        """Validiert die Zugangsdaten (Application-Details)."""
        return self._request("GET", "/application")

    def aspsps(self, country: str = "DE") -> list[dict]:
        """Verfügbare Banken (ASPSPs) eines Landes."""
        return self._request("GET", "/aspsps", params={"country": country}).get("aspsps", [])

    def start_auth(self, aspsp_name: str, aspsp_country: str, redirect_url: str,
                   state: str, valid_until_iso: str) -> str:
        """Startet die Bank-Autorisierung; Rückgabe: URL für den Browser."""
        body = {
            "access": {"valid_until": valid_until_iso},
            "aspsp": {"name": aspsp_name, "country": aspsp_country},
            "state": state,
            "redirect_url": redirect_url,
            "psu_type": "personal",
        }
        return self._request("POST", "/auth", json=body)["url"]

    def create_session(self, code: str) -> dict:
        """Tauscht den Autorisierungs-Code gegen eine Session (Konten + Gültigkeit)."""
        return self._request("POST", "/sessions", json={"code": code})

    def get_session(self, session_id: str) -> dict:
        return self._request("GET", f"/sessions/{session_id}")

    def transactions(self, account_uid: str, date_from: str | None = None,
                     date_to: str | None = None) -> list[dict]:
        """Alle Transaktionen eines Kontos, folgt automatisch dem continuation_key."""
        collected: list[dict] = []
        continuation_key = None
        while True:
            params = {}
            if date_from:
                params["date_from"] = date_from
            if date_to:
                params["date_to"] = date_to
            if continuation_key:
                params["continuation_key"] = continuation_key
            data = self._request("GET", f"/accounts/{account_uid}/transactions", params=params)
            collected.extend(data.get("transactions", []))
            continuation_key = data.get("continuation_key")
            if not continuation_key:
                return collected

    def balances(self, account_uid: str) -> list[dict]:
        return self._request("GET", f"/accounts/{account_uid}/balances").get("balances", [])
