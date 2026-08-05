"""Ollama-backed embedder for mempalace drawers.

Targets /api/embed (the batch API in modern Ollama). Model default is
`nomic-embed-text` (768d, multilingual UA/EN). Used by ingest and search.

Kept intentionally framework-agnostic — no SQLAlchemy import — so it can
be reused by a future MCP shim layer.
"""
from __future__ import annotations

import os
import time
from typing import Optional

import requests


DEFAULT_BASE_URL = os.environ.get("OLLAMA_EMBED_URL", "http://ollama:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
DEFAULT_TIMEOUT = float(os.environ.get("OLLAMA_EMBED_TIMEOUT", "60"))
DEFAULT_RETRIES = int(os.environ.get("OLLAMA_EMBED_RETRIES", "3"))


class OllamaEmbedder:
    """HTTP client for Ollama /api/embed batch endpoint."""

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        model: str = DEFAULT_MODEL,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_RETRIES,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.retries = max(1, retries)
        self._url = f"{self.base_url}/api/embed"

    @property
    def dim(self) -> int:
        """Embedding vector dimension (fixed for nomic-embed-text = 768)."""
        return 768

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Batch-embed a list of texts. Raises on persistent failure."""
        if not texts:
            return []

        last_exc: Optional[Exception] = None
        for attempt in range(1, self.retries + 1):
            try:
                resp = requests.post(
                    self._url,
                    json={"model": self.model, "input": texts},
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                data = resp.json()
                embeddings = data.get("embeddings", [])
                if not embeddings or len(embeddings) != len(texts):
                    raise RuntimeError(
                        f"Ollama returned {len(embeddings)} embeddings for {len(texts)} inputs"
                    )
                return embeddings
            except Exception as e:
                last_exc = e
                if attempt < self.retries:
                    time.sleep(0.5 * attempt)
                continue

        raise RuntimeError(f"Ollama embed failed after {self.retries} attempts: {last_exc}")

    def embed_one(self, text: str) -> list[float]:
        """Convenience: embed a single string."""
        return self.embed([text])[0]

    def __call__(self, texts: list[str]) -> list[list[float]]:
        return self.embed(texts)
