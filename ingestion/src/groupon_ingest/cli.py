"""groupon-ingest CLI — orchestrates the Scrapling pipeline."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.logging import RichHandler
from rich.table import Table

from groupon_ingest.scraper import build_listings, load_seeds, scrape

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

app = typer.Typer(
    name="groupon-ingest",
    help="Scrape, normalize and embed groupon.es deals for the MCP server.",
    no_args_is_help=True,
)
console = Console()


def _setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=level,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True, console=console)],
    )


def _default_seeds_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "data" / "seeds.json"


@app.command()
def scrape_cmd(
    output: Path = typer.Option(
        Path("../data/scraped.json"), "--output", "-o", help="Output JSON path"
    ),
    seeds: Path = typer.Option(_default_seeds_path, "--seeds"),
    kinds: str = typer.Option(
        "all",
        "--kinds",
        help="Comma-separated: city,category,all (default: all)",
    ),
    slugs: str = typer.Option(
        "all",
        "--slugs",
        help="Comma-separated listing slugs (default: all in seeds)",
    ),
    max_per_listing: int = typer.Option(
        10, "--max", "-m", help="Max deal URLs to take from each listing"
    ),
    no_headless: bool = typer.Option(
        False, "--no-headless", help="Run with a visible browser (debugging)"
    ),
    log_level: str = typer.Option("INFO", "--log-level"),
) -> None:
    """Scrape deals from groupon.es using Scrapling.

    Walks each /ofertas/{slug} listing in seeds, deduplicates deal URLs,
    visits each unique deal page once and writes a normalized JSON.
    """
    _setup_logging(log_level)

    seeds_data = load_seeds(seeds)
    kinds_list = None if kinds == "all" else [k.strip() for k in kinds.split(",")]
    slugs_list = None if slugs == "all" else [s.strip() for s in slugs.split(",")]

    listings = build_listings(seeds_data, filter_kinds=kinds_list, filter_slugs=slugs_list)
    if not listings:
        console.print("[red]No listings matched the filters.[/red]")
        raise typer.Exit(code=1)

    console.print(
        f"[bold cyan]Planning {len(listings)} listing fetches "
        f"({max_per_listing} deals/listing max)[/bold cyan]"
    )

    result = scrape(
        listings,
        base_url=seeds_data["base_url"],
        max_deals_per_listing=max_per_listing,
        headless=not no_headless,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        result.model_dump_json(indent=2, exclude_none=False),
        encoding="utf-8",
    )

    table = Table(title="Scraping summary", show_header=True, header_style="bold cyan")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    table.add_row("Deals collected", str(len(result.deals)))
    table.add_row("Listings completed", str(result.listings_completed))
    table.add_row("Listings failed", str(result.listings_failed))
    table.add_row("Categories represented", str(len(result.categories)))
    table.add_row("Locations represented", str(len(result.locations)))
    table.add_row("Merchants", str(len(result.merchants)))
    table.add_row(
        "Duration (s)",
        f"{(result.finished_at - result.started_at).total_seconds():.1f}",
    )
    console.print(table)
    console.print(f"\n[green]✓[/green] Written to [bold]{output}[/bold]")


# typer renames `scrape_cmd` to `scrape-cmd` by default; we want plain `scrape`
app.command(name="scrape")(scrape_cmd)


@app.command()
def embed(
    input_path: Path = typer.Argument(..., help="Path to scraped.json"),
    sqlite_path: Path = typer.Option(
        Path("../data/deals.sqlite"), "--sqlite", help="Output SQLite path"
    ),
    provider: str = typer.Option(
        "openai", "--provider", help="Embeddings provider: openai | ollama"
    ),
    log_level: str = typer.Option("INFO", "--log-level"),
) -> None:
    """Generate embeddings and load deals into SQLite."""
    _setup_logging(log_level)
    from groupon_ingest.embedder import embed_and_write  # noqa: PLC0415
    from groupon_ingest.models import ScrapingResult  # noqa: PLC0415

    raw = input_path.read_text(encoding="utf-8")
    result = ScrapingResult.model_validate_json(raw)
    console.print(
        f"Loaded [bold]{len(result.deals)}[/bold] deals from {input_path}"
    )

    embed_and_write(result.deals, sqlite_path, provider=provider)  # type: ignore[arg-type]
    console.print(
        f"\n[green]✓[/green] {len(result.deals)} deals + embeddings written to "
        f"[bold]{sqlite_path}[/bold]"
    )


@app.command()
def ingest(
    output_json: Path = typer.Option(
        Path("../data/scraped.json"), "--json", help="Intermediate JSON path"
    ),
    sqlite_path: Path = typer.Option(
        Path("../data/deals.sqlite"), "--sqlite", help="Output SQLite path"
    ),
    seeds: Path = typer.Option(_default_seeds_path, "--seeds"),
    kinds: str = typer.Option("all", "--kinds"),
    slugs: str = typer.Option("all", "--slugs"),
    max_per_listing: int = typer.Option(10, "--max", "-m"),
    provider: str = typer.Option("openai", "--provider"),
    log_level: str = typer.Option("INFO", "--log-level"),
) -> None:
    """Full pipeline: scrape + embed + load (one command)."""
    scrape_cmd(
        output=output_json,
        seeds=seeds,
        kinds=kinds,
        slugs=slugs,
        max_per_listing=max_per_listing,
        no_headless=False,
        log_level=log_level,
    )
    embed(input_path=output_json, sqlite_path=sqlite_path, provider=provider, log_level=log_level)


@app.command(name="list-seeds")
def list_seeds_cmd(
    seeds: Path = typer.Option(_default_seeds_path, "--seeds"),
) -> None:
    """Show available listings in the current seeds.json."""
    data = load_seeds(seeds)
    table = Table(title="Listings", show_header=True, header_style="bold cyan")
    table.add_column("Kind")
    table.add_column("Slug")
    table.add_column("Name")
    table.add_column("URL")
    for item in data["listings"]:
        table.add_row(item["kind"], item["slug"], item["name"], item["url_path"])
    console.print(table)


@app.command()
def doctor() -> None:
    """Verify the Python environment can run the ingestion pipeline."""
    _setup_logging("INFO")
    issues: list[str] = []

    try:
        import scrapling  # noqa: F401

        console.print("[green]✓[/green] Scrapling installed")
    except ImportError:
        issues.append("Scrapling not installed — run: pip install -e ingestion/")

    try:
        from scrapling.fetchers import StealthySession  # noqa: F401

        console.print("[green]✓[/green] StealthySession importable")
    except ImportError as exc:
        issues.append(f"StealthySession import failed: {exc}")

    try:
        import pydantic  # noqa: F401

        console.print(f"[green]✓[/green] pydantic {pydantic.VERSION}")
    except ImportError:
        issues.append("pydantic not installed")

    try:
        import camoufox  # noqa: F401

        console.print("[green]✓[/green] camoufox installed (required for Cloudflare bypass)")
    except ImportError:
        issues.append(
            "camoufox not installed — `uv pip install camoufox[geoip] && python -m camoufox fetch`"
        )

    try:
        import sqlite_vec  # noqa: F401

        console.print("[green]✓[/green] sqlite-vec installed")
    except ImportError:
        issues.append("sqlite-vec not installed — needed for embeddings storage")

    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        console.print("[green]✓[/green] OPENAI_API_KEY present")
    else:
        console.print("[yellow]![/yellow] OPENAI_API_KEY not set (only matters if using OpenAI embeddings)")

    if issues:
        console.print("\n[red]Issues found:[/red]")
        for issue in issues:
            console.print(f"  • {issue}")
        sys.exit(1)
    else:
        console.print("\n[bold green]All systems go.[/bold green]")


if __name__ == "__main__":
    app()
