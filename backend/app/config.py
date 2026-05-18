from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_paper: bool = True
    alpaca_data_feed: str = "iex"
    default_symbols: str = "AAPL,MSFT,TSLA,SPY"

    @property
    def symbols(self) -> list[str]:
        return [s.strip().upper() for s in self.default_symbols.split(",") if s.strip()]

    @property
    def configured(self) -> bool:
        return bool(self.alpaca_api_key and self.alpaca_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
