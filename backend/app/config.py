from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True
    alpaca_data_feed: str = "iex"
    default_symbols: str = "AAPL,MSFT,TSLA,SPY"
    # AI chat (Anthropic). Off by default — calls cost real money. Flip
    # ai_chat_enabled=true once an ANTHROPIC_API_KEY is loaded server-side.
    ai_chat_enabled: bool = False
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    ai_max_tokens: int = 4096
    ai_max_tool_iterations: int = 16
    # Web search via Anthropic's hosted tool ($10/1k searches). Off by default
    # — it requires the Anthropic org to have web search enabled, otherwise the
    # API 400s. Set AI_WEB_SEARCH_ENABLED=true only if your org supports it; the
    # bot self-heals (drops the tool and retries) if it's on but unsupported.
    ai_web_search_enabled: bool = False
    # Postgres (Supabase) connection URI. Empty => DB-backed features degrade
    # gracefully (503), mirroring the Alpaca-keys seam.
    database_url: str = ""
    # Skip TLS cert verification on the DB connection. Only flip if the
    # pooler endpoint trips hostname/cert checks; TLS stays on either way.
    database_ssl_insecure: bool = False
    # Financial Modeling Prep API key for company profile enrichment.
    # Free tier; datacenter-friendly. Required for /api/assets/{symbol}/profile.
    fmp_api_key: str = ""
    # CoinGecko Demo API key for crypto enrichment. Optional — unset falls back
    # to the keyless public tier (rate-limited, unstable under load). The free
    # Demo key lifts limits to ~30 calls/min, 10k/month.
    coingecko_api_key: str = ""
    # Browser origins allowed to call this API. The GitHub Pages origin is
    # included so the dev-branch previews can reach the Vercel backend.
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "https://q2z87bs2n7-ops.github.io"
    )

    @property
    def symbols(self) -> list[str]:
        return [s.strip().upper() for s in self.default_symbols.split(",") if s.strip()]

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def configured(self) -> bool:
        return bool(self.alpaca_api_key and self.alpaca_secret_key)

    @property
    def ai_configured(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def db_configured(self) -> bool:
        return bool(self.database_url)

    @property
    def fmp_configured(self) -> bool:
        return bool(self.fmp_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
