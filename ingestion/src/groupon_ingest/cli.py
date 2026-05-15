"""groupon-ingest CLI — orchestrates the Scrapling pipeline."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.table import Table

from groupon_ingest.scraper import build_jobs, load_seeds, scrape_jobs

app = typer.Typer(
    name="groupon-ingest",
    help="Scrape, normalize and prepare groupon.es deals for the MCP server.",
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


@app.command()
def scrape(
    output: Path = typer.Option(
        Path("data/scraped.json"), "--output", "-o", help="Output JSON path"
    ),
    seeds: Path = typer.Option(
        Path(__file__).parent.parent.parent / "data" / "seeds.json",
        "--seeds",
        help="Seeds JSON path",
    ),
    cities: str = typer.Option(
        "madrid",
        "--cities",
        help="Comma-separated city slugs (default: madrid). Use 'all' for everything in seeds.",
    ),
    categories: str = typer.Option(
        "belleza-y-relax",
        "--categories",
        help="Comma-separated category slugs. Use 'all' for everything in seeds.",
    ),
    max_per_combo: int = typer.Option(
        10, "--max", "-m", help="Max deals per (city, category) combo"
    ),
    no_headless: bool = typer.Option(
        False, "--no-headless", help="Run with a visible browser (debugging)"
    ),
    log_level: str = typer.Option("INFO", "--log-level"),
) -> None:
    """Scrape deals from groupon.es using Scrapling."""
    _setup_logging(log_level)

    seeds_data = load_seeds(seeds)
    cities_list = None if cities == "all" else [c.strip() for c in cities.split(",")]
    categories_list = (
        None if categories == "all" else [c.strip() for c in categories.split(",")]
    )

    jobs = build_jobs(
        seeds_data,
        cities=cities_list,
        categories=categories_list,
        max_per_combo=max_per_combo,
    )

    if not jobs:
        console.print("[red]No scrape jobs to run (check --cities/--categories).[/red]")
        raise typer.Exit(code=1)

    console.print(
        f"[bold cyan]Planned {len(jobs)} scrape jobs[/bold cyan] "
        f"({max_per_combo} deals/combo max)"
    )

    result = scrape_jobs(
        jobs,
        seeds_data,
        headless=not no_headless,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        result.model_dump_json(indent=2, exclude_none=False),
        encoding="utf-8",
    )

    # Summary table
    table = Table(title="Scraping summary", show_header=True, header_style="bold cyan")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    table.add_row("Deals collected", str(len(result.deals)))
    table.add_row("Jobs completed", str(result.jobs_completed))
    table.add_row("Jobs failed", str(result.jobs_failed))
    table.add_row("Merchants", str(len(result.merchants)))
    table.add_row(
        "Duration (s)",
        f"{(result.finished_at - result.started_at).total_seconds():.1f}",
    )
    console.print(table)
    console.print(f"\n[green]✓[/green] Written to [bold]{output}[/bold]")


@app.command()
def list_seeds(
    seeds: Path = typer.Option(
        Path(__file__).parent.parent.parent / "data" / "seeds.json"
    ),
) -> None:
    """Show available cities and categories in the current seeds.json."""
    data = load_seeds(seeds)

    cities_table = Table(title="Cities", show_header=True, header_style="bold cyan")
    cities_table.add_column("Slug")
    cities_table.add_column("Name")
    for city in data["locations"]:
        cities_table.add_row(city["slug"], city["name"])
    console.print(cities_table)

    cats_table = Table(title="Categories", show_header=True, header_style="bold cyan")
    cats_table.add_column("Slug")
    cats_table.add_column("Name")
    cats_table.add_column("URL path")
    for cat in data["categories"]:
        cats_table.add_row(cat["slug"], cat["name"], cat["url_path"])
    console.print(cats_table)


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

    if issues:
        console.print("\n[red]Issues found:[/red]")
        for issue in issues:
            console.print(f"  • {issue}")
        sys.exit(1)
    else:
        console.print("\n[bold green]All systems go.[/bold green]")


if __name__ == "__main__":
    app()
