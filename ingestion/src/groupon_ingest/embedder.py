"""Generate embeddings for normalized deals and load them into SQLite.

Provider abstraction mirrors the TypeScript side (src/core/embeddings/):
- 'openai' uses text-embedding-3-small (1536d native)
- 'ollama' uses nomic-embed-text (768d, right-padded to 1536 to keep
  the SQLite schema fixed)

The right-padding is intentional and documented in schema.sql. It costs
us ~768 floats per row that we never use, in exchange for being able to
switch providers without a migration. For 500 deals that's ~3 MB. Fine.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import struct
from pathlib import Path
from typing import Literal

import httpx
from openai import OpenAI

from groupon_ingest.models import NormalizedDeal

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 1536  # canonical, see schema.sql
SCHEMA_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "src"
    / "core"
    / "store"
    / "schema.sql"
)


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------


def _pad_or_truncate(vec: list[float], target_dim: int = EMBEDDING_DIM) -> list[float]:
    if len(vec) == target_dim:
        return vec
    if len(vec) < target_dim:
        return vec + [0.0] * (target_dim - len(vec))
    return vec[:target_dim]


def embed_openai(texts: list[str], model: str | None = None) -> list[list[float]]:
    """Batch embedding via any OpenAI-compatible endpoint.

    Supports the real OpenAI API, OpenRouter, Azure OpenAI deployments,
    and other compatible gateways. The model name should include any
    provider prefix the endpoint expects (e.g. 'openai/text-embedding-3-small'
    for OpenRouter).
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    base_url = os.environ.get("OPENAI_BASE_URL")  # falls back to OpenAI default
    model = model or os.environ.get(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )
    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
    response = client.embeddings.create(model=model, input=texts)
    return [_pad_or_truncate(item.embedding) for item in response.data]


def embed_ollama(
    texts: list[str],
    model: str = "nomic-embed-text",
    host: str = "http://localhost:11434",
) -> list[list[float]]:
    """One-by-one embedding with Ollama. Ollama's /api/embeddings doesn't
    batch as of writing, so we loop. Slower but free."""
    out: list[list[float]] = []
    with httpx.Client(base_url=host, timeout=60.0) as client:
        for text in texts:
            resp = client.post("/api/embeddings", json={"model": model, "prompt": text})
            resp.raise_for_status()
            vec = resp.json()["embedding"]
            out.append(_pad_or_truncate(vec))
    return out


def embed(
    texts: list[str],
    provider: Literal["openai", "ollama"] = "openai",
) -> list[list[float]]:
    if provider == "openai":
        return embed_openai(texts, model=os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"))
    if provider == "ollama":
        return embed_ollama(
            texts,
            model=os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"),
            host=os.environ.get("OLLAMA_HOST", "http://localhost:11434"),
        )
    raise ValueError(f"Unknown embeddings provider: {provider}")


# ---------------------------------------------------------------------------
# SQLite writer
# ---------------------------------------------------------------------------


def _vector_to_blob(vec: list[float]) -> bytes:
    """sqlite-vec stores vectors as packed little-endian float32 bytes."""
    return struct.pack(f"<{len(vec)}f", *vec)


def _load_sqlite_vec(conn: sqlite3.Connection) -> None:
    """Load sqlite-vec extension via the Python wheel.

    The sqlite-vec Python package ships a precompiled extension and exposes
    a `load(conn)` helper. We catch ImportError so this file can be loaded
    even when sqlite-vec isn't installed (the embedder still embeds; only
    the SQLite write step requires it).
    """
    try:
        import sqlite_vec  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "sqlite-vec Python package is required to write vectors. "
            "Install via `uv pip install sqlite-vec` or "
            "`pip install sqlite-vec`."
        ) from exc

    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)


def _build_embedding_text(deal: NormalizedDeal) -> str:
    """The text we embed for each deal — designed for semantic queries
    like 'romantic spa madrid weekend'."""
    parts = [
        deal.title,
        f"Category: {deal.category_slug.replace('-', ' ')}",
        f"Location: {deal.location_slug}",
    ]
    if deal.merchant_name:
        parts.append(f"Merchant: {deal.merchant_name}")
    if deal.description:
        parts.append(deal.description[:500])
    return ". ".join(parts)


def write_deals_to_sqlite(
    deals: list[NormalizedDeal],
    sqlite_path: Path,
    embeddings: list[list[float]] | None = None,
) -> None:
    """Insert/replace deals + their embeddings into the SQLite store.

    If embeddings is None, only metadata is written (you'd run the embed
    step separately). When provided, len(embeddings) must equal len(deals).
    """
    if embeddings is not None and len(embeddings) != len(deals):
        raise ValueError(
            f"Embeddings length ({len(embeddings)}) does not match deals "
            f"length ({len(deals)})"
        )

    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(sqlite_path))
    _load_sqlite_vec(conn)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    # Upsert lookup tables first to satisfy FKs
    cur = conn.cursor()
    cur.executemany(
        """INSERT OR IGNORE INTO categories(slug, name) VALUES (?, ?)""",
        [(d.category_slug, d.category_slug.replace("-", " ").title()) for d in deals],
    )
    cur.executemany(
        """INSERT OR IGNORE INTO locations(slug, name) VALUES (?, ?)""",
        [(d.location_slug, d.location_slug.title()) for d in deals],
    )
    cur.executemany(
        """INSERT OR IGNORE INTO merchants(id, name) VALUES (?, ?)""",
        [
            (d.merchant_id, d.merchant_name)
            for d in deals
            if d.merchant_id and d.merchant_name
        ],
    )

    # Upsert deals
    cur.executemany(
        """
        INSERT INTO deals (
          id, url, title, description, merchant_id, merchant_name,
          category_slug, location_slug, price_cents, original_price_cents,
          discount_pct, rating, reviews_count, image_url, scraped_at, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          url=excluded.url,
          title=excluded.title,
          description=excluded.description,
          merchant_id=excluded.merchant_id,
          merchant_name=excluded.merchant_name,
          category_slug=excluded.category_slug,
          location_slug=excluded.location_slug,
          price_cents=excluded.price_cents,
          original_price_cents=excluded.original_price_cents,
          discount_pct=excluded.discount_pct,
          rating=excluded.rating,
          reviews_count=excluded.reviews_count,
          image_url=excluded.image_url,
          scraped_at=excluded.scraped_at,
          raw_json=excluded.raw_json
        """,
        [
            (
                d.id,
                str(d.url),
                d.title,
                d.description,
                d.merchant_id,
                d.merchant_name,
                d.category_slug,
                d.location_slug,
                d.price_cents,
                d.original_price_cents,
                d.discount_pct,
                d.rating,
                d.reviews_count,
                str(d.image_url) if d.image_url else None,
                d.scraped_at.isoformat(),
                __import__("json").dumps(d.raw, default=str),
            )
            for d in deals
        ],
    )

    # Embeddings
    if embeddings is not None:
        for deal, vec in zip(deals, embeddings, strict=True):
            cur.execute(
                "INSERT OR REPLACE INTO deal_vectors(deal_id, embedding) VALUES (?, ?)",
                (deal.id, _vector_to_blob(vec)),
            )

    # Refresh deal_count denormalized columns
    cur.execute(
        """UPDATE categories SET deal_count =
             (SELECT COUNT(*) FROM deals WHERE deals.category_slug = categories.slug)"""
    )
    cur.execute(
        """UPDATE locations SET deal_count =
             (SELECT COUNT(*) FROM deals WHERE deals.location_slug = locations.slug)"""
    )
    cur.execute(
        """UPDATE merchants SET
             deal_count = (SELECT COUNT(*) FROM deals WHERE deals.merchant_id = merchants.id),
             rating_avg = (SELECT AVG(rating) FROM deals
                           WHERE deals.merchant_id = merchants.id AND rating IS NOT NULL)"""
    )

    conn.commit()
    conn.close()
    logger.info("Wrote %d deals to %s", len(deals), sqlite_path)


def embed_and_write(
    deals: list[NormalizedDeal],
    sqlite_path: Path,
    provider: Literal["openai", "ollama"] = "openai",
    batch_size: int = 64,
) -> None:
    """End-to-end: build embedding texts, embed in batches, write all."""
    texts = [_build_embedding_text(d) for d in deals]
    all_embeddings: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        logger.info(
            "Embedding batch %d/%d (%d items)",
            start // batch_size + 1,
            (len(texts) + batch_size - 1) // batch_size,
            len(batch),
        )
        all_embeddings.extend(embed(batch, provider=provider))

    write_deals_to_sqlite(deals, sqlite_path, embeddings=all_embeddings)
