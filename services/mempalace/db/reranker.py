"""CrossEncoder reranker for mempalace hybrid search (MP-C-08-RERANKER).

Reranks top-N hybrid search candidates using a cross-encoder model to close
the recall gap vs the legacy Chroma+reranker baseline (80.0% → ≥82% target).

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (~80MB, ~50-100ms/query on CPU).
Cached in /home/mempalace/.cache/sentence_transformers at image build time.

Toggle via env:
    MEMPALACE_RERANKER_ENABLED=true|false  (default: true if imports succeed)
    MEMPALACE_RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
"""
from __future__ import annotations

import logging
import os
from typing import Optional

log = logging.getLogger(__name__)

DEFAULT_MODEL = os.environ.get(
    "MEMPALACE_RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"
)


def _env_enabled() -> bool:
    val = os.environ.get("MEMPALACE_RERANKER_ENABLED", "true").strip().lower()
    return val in ("1", "true", "yes", "on")


class CrossEncoderReranker:
    """Lazy-loaded CrossEncoder reranker.

    The underlying sentence-transformers CrossEncoder is instantiated on first
    rerank() call (or via ``preload()``) so import failures can be tolerated
    gracefully at module load time.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        self.model_name = model_name
        self._model = None  # type: ignore[var-annotated]
        self._load_failed = False

    # ── Lifecycle ────────────────────────────────────────────────────────

    def preload(self) -> bool:
        """Eagerly load the model. Returns True on success."""
        return self._ensure_loaded()

    def _ensure_loaded(self) -> bool:
        if self._model is not None:
            return True
        if self._load_failed:
            return False
        try:
            from sentence_transformers import CrossEncoder  # type: ignore
        except Exception as e:  # pragma: no cover - dependency missing
            log.warning("reranker: sentence_transformers import failed: %s", e)
            self._load_failed = True
            return False
        try:
            log.info("reranker: loading CrossEncoder model=%s", self.model_name)
            self._model = CrossEncoder(self.model_name)
            log.info("reranker: model loaded")
            return True
        except Exception as e:
            log.warning("reranker: failed to load model %s: %s", self.model_name, e)
            self._load_failed = True
            return False

    @property
    def available(self) -> bool:
        return self._model is not None or not self._load_failed

    # ── Rerank ───────────────────────────────────────────────────────────

    def rerank(
        self,
        query: str,
        candidates: list[tuple[object, float]],
        top_n: Optional[int] = None,
    ) -> list[tuple[object, float]]:
        """Rerank (drawer, score) candidates by CrossEncoder relevance.

        Returns a new list sorted by reranker score descending. The score in
        the returned tuples is replaced with the cross-encoder score so that
        callers observe the final relevance order. Passes through unchanged on
        load failure or empty input.
        """
        if not candidates:
            return candidates
        if not self._ensure_loaded():
            return candidates

        pool = candidates if top_n is None else candidates[:top_n]
        try:
            pairs = [(query, self._get_text(d)) for d, _ in pool]
            scores = self._model.predict(pairs)  # type: ignore[union-attr]
        except Exception as e:
            log.warning("reranker: predict failed, falling back to RRF order: %s", e)
            return candidates

        rescored = [
            (drawer, float(score))
            for (drawer, _), score in zip(pool, scores)
        ]
        rescored.sort(key=lambda kv: kv[1], reverse=True)
        return rescored

    @staticmethod
    def _get_text(drawer: object) -> str:
        # Drawer ORM row or dict. Limit to avoid long sequence issues.
        text = getattr(drawer, "content", None)
        if text is None and isinstance(drawer, dict):
            text = drawer.get("content")
        if not text:
            return ""
        # CrossEncoder MiniLM default max_length ~512 tokens; truncate bytes
        return text[:2000]


# ── Module-level factory ────────────────────────────────────────────────

_singleton: Optional[CrossEncoderReranker] = None


def get_reranker() -> Optional[CrossEncoderReranker]:
    """Return a process-wide singleton reranker, or None if disabled."""
    global _singleton
    if not _env_enabled():
        return None
    if _singleton is None:
        _singleton = CrossEncoderReranker()
    return _singleton
