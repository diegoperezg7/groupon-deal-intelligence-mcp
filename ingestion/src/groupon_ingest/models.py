"""Pydantic schemas for the ingestion pipeline.

ScrapedDeal is what comes out of the parsers — raw, optional fields.
NormalizedDeal is what gets persisted — strict, validated, deduplicated.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ScrapedDeal(BaseModel):
    """Raw output from the deal-page parser. All fields optional except url."""

    model_config = ConfigDict(extra="allow")

    url: str
    title: str | None = None
    description: str | None = None
    merchant_name: str | None = None
    category_slug: str | None = None
    location_slug: str | None = None
    price_raw: str | None = None
    original_price_raw: str | None = None
    discount_raw: str | None = None
    rating_raw: str | None = None
    reviews_count_raw: str | None = None
    image_url: str | None = None
    scraped_at: datetime = Field(default_factory=datetime.utcnow)


class NormalizedDeal(BaseModel):
    """Validated, normalized deal ready for the SQLite store."""

    id: str = Field(..., description="Stable slug-based identifier")
    url: HttpUrl
    title: str
    description: str | None = None
    merchant_id: str | None = None
    merchant_name: str | None = None
    category_slug: str
    location_slug: str
    price_cents: int | None = None
    original_price_cents: int | None = None
    discount_pct: int | None = None
    rating: float | None = None
    reviews_count: int | None = None
    image_url: HttpUrl | None = None
    scraped_at: datetime
    raw: dict[str, Any] = Field(default_factory=dict, description="Original scraped blob")


class Category(BaseModel):
    slug: str
    name: str
    deal_count: int = 0


class Location(BaseModel):
    slug: str
    name: str
    deal_count: int = 0


class Merchant(BaseModel):
    id: str
    name: str
    rating_avg: float | None = None
    deal_count: int = 0


class Listing(BaseModel):
    """A /ofertas/{slug} listing page configured in seeds.json."""

    kind: Literal["city", "category"]
    slug: str
    name: str
    url_path: str

    def full_url(self, base_url: str) -> str:
        return f"{base_url.rstrip('/')}{self.url_path}"


class ScrapingResult(BaseModel):
    """Aggregate output of one full ingestion run."""

    deals: list[NormalizedDeal]
    categories: list[Category]
    locations: list[Location]
    merchants: list[Merchant]
    listings_completed: int
    listings_failed: int
    started_at: datetime
    finished_at: datetime
    notes: list[str] = Field(default_factory=list)
