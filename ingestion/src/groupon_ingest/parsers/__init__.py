"""HTML parsers for groupon.es pages."""

from groupon_ingest.parsers.category_page import extract_deal_urls
from groupon_ingest.parsers.deal_page import parse_deal_page

__all__ = ["extract_deal_urls", "parse_deal_page"]
